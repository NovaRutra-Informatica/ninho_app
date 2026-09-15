import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { test, expect } from "./fixtures";

test("a interface de produção bloqueia conexões de desenvolvimento, formulários e bases externas", async ({
  ninho,
}) => {
  const server = createServer((_request, response) =>
    response.end("isolated fixture"),
  );
  let upgrades = 0;
  server.on("upgrade", (request, socket) => {
    upgrades++;
    const accept = createHash("sha1")
      .update(
        `${request.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`,
      )
      .digest("base64");
    socket.end(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const result = await ninho.page.evaluate(async (address) => {
      const violations: string[] = [];
      const record = (event: SecurityPolicyViolationEvent) =>
        violations.push(event.effectiveDirective);
      document.addEventListener("securitypolicyviolation", record);
      const socketResult = await new Promise<string>((resolve) => {
        const socket = new WebSocket(address.replace("http:", "ws:"));
        const timer = setTimeout(() => {
          socket.close();
          resolve("timeout");
        }, 2000);
        socket.onopen = () => {
          clearTimeout(timer);
          socket.close();
          resolve("opened");
        };
        socket.onerror = () => {
          clearTimeout(timer);
          resolve("blocked");
        };
      });
      const originalBase = document.baseURI;
      const base = document.createElement("base");
      base.href = `${address}/injected/`;
      document.head.append(base);
      const baseStayed = document.baseURI === originalBase;
      base.remove();
      const frame = document.createElement("iframe");
      frame.name = "ninho-security-test";
      frame.hidden = true;
      document.body.append(frame);
      const form = document.createElement("form");
      form.method = "POST";
      form.action = `${address}/form`;
      form.target = frame.name;
      document.body.append(form);
      form.submit();
      await new Promise((resolve) => setTimeout(resolve, 200));
      form.remove();
      frame.remove();
      document.removeEventListener("securitypolicyviolation", record);
      return { socketResult, baseStayed, violations };
    }, address);
    expect(result.socketResult).toBe("blocked");
    expect(upgrades).toBe(0);
    expect(result.baseStayed).toBe(true);
    expect(result.violations).toEqual(
      expect.arrayContaining(["connect-src", "base-uri", "form-action"]),
    );
    await expect(ninho.page.getByTestId("nav-today")).toBeVisible();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

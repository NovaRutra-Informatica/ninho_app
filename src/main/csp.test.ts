import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createServer } from "vite";

const indexPath = path.resolve("index.html");
const policy = (html: string) =>
  html.match(/content="(default-src [^"]+)"/)![1];

describe("renderer CSP", () => {
  it("keeps the shipped document offline and prohibits injected bases and form submissions", async () => {
    const rules = policy(await readFile(indexPath, "utf8"));
    expect(rules).toContain("connect-src 'none'");
    expect(rules).toContain("script-src 'self';");
    expect(rules).toContain("base-uri 'none'");
    expect(rules).toContain("form-action 'none'");
    expect(rules).not.toMatch(/(?:https?|wss?):\/\//);
  });
  it("allows Vite refresh only in the development transform", async () => {
    const server = await createServer({
      server: { middlewareMode: true, watch: null },
    });
    try {
      const html = await server.transformIndexHtml(
        "/index.html",
        await readFile(indexPath, "utf8"),
      );
      const rules = policy(html);
      expect(html).toContain("/@vite/client");
      expect(rules).toContain("script-src 'self' 'unsafe-inline'");
      expect(rules).toContain("connect-src 'self' ws://127.0.0.1:*");
      expect(rules).toContain("base-uri 'none'");
      expect(rules).toContain("form-action 'none'");
      expect(policy(await readFile(indexPath, "utf8"))).toContain(
        "connect-src 'none'",
      );
    } finally {
      await server.close();
    }
  });
});

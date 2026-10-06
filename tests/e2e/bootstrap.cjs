if (process.env.NINHO_E2E !== "1" || !process.env.NINHO_DATA_DIR) {
  throw new Error("The E2E bootstrap requires an isolated data directory.");
}
const { app, BrowserWindow } = require("electron");
BrowserWindow.prototype.show = function () {};
BrowserWindow.prototype.showInactive = function () {};
app.on("browser-window-created", (_event, window) =>
  window.webContents.setBackgroundThrottling(false),
);
globalThis.__ninhoAi = {
  mode: "offline",
  calls: [],
  reply: "Resposta do modelo local simulado para o teste.",
};
globalThis.fetch = async (url, init = {}) => {
  const requestUrl = String(url);
  if (!requestUrl.startsWith("http://127.0.0.1:1234/"))
    throw new Error(`Unexpected network access in E2E: ${requestUrl}`);
  const mock = globalThis.__ninhoAi;
  const body = init.body ? JSON.parse(String(init.body)) : undefined;
  mock.calls.push({ url: requestUrl, body });
  if (mock.mode === "offline")
    throw new Error("ECONNREFUSED: isolated LM Studio fixture");
  if (requestUrl.endsWith("/api/v1/models"))
    return Response.json({
      models: [
        {
          type: "llm",
          key: "qwen/test-4b",
          display_name: "Qwen simulado E2E",
          params_string: "4B",
          size_bytes: 2_500_000_000,
          loaded_instances: [{ id: "qwen/test-4b" }],
        },
        {
          type: "llm",
          key: "large/test-70b",
          display_name: "Modelo grande simulado E2E",
          params_string: "70B",
          size_bytes: 40_000_000_000,
          loaded_instances: [],
        },
      ],
    });
  if (requestUrl.endsWith("/v1/chat/completions")) {
    if (mock.mode === "error")
      return Response.json({ error: "Synthetic error" }, { status: 503 });
    if (mock.mode === "pending")
      await new Promise((resolve, reject) => {
        if (init.signal?.aborted) return reject(init.signal.reason);
        init.signal?.addEventListener(
          "abort",
          () => reject(init.signal.reason),
          { once: true },
        );
      });
    return Response.json({
      choices: [{ message: { role: "assistant", content: mock.reply } }],
    });
  }
  throw new Error(`Unexpected LM Studio route in E2E: ${requestUrl}`);
};
require("../../dist-electron/main.cjs");

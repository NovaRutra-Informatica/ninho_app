import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { DataRecoveryError, StudyStore } from "./storage";
import { LocalAiService } from "./ai";
import {
  isTrustedDocument,
  MATERIAL_EXTENSIONS,
  validateExternalUrl,
} from "./security";
import type { Command } from "../shared/types";

app.setName("Ninho");
app.setAppUserModelId("com.aless.ninho");
const isolatedTest =
  process.env.NINHO_E2E === "1" && Boolean(process.env.NINHO_DATA_DIR);
const dataDirectory = isolatedTest
  ? path.resolve(process.env.NINHO_DATA_DIR!)
  : path.join(app.getPath("appData"), "Ninho");
mkdirSync(dataDirectory, { recursive: true });
app.setPath("userData", dataDirectory);
const store = new StudyStore(dataDirectory);
const ai = new LocalAiService({
  loadState: () => store.load(),
  allowCli: !isolatedTest,
});
let window: BrowserWindow | null = null;
const indexPath = path.join(__dirname, "..", "dist", "index.html");
const developmentUrl =
  !app.isPackaged && process.env.NINHO_DEV_URL
    ? validateExternalUrl(process.env.NINHO_DEV_URL)
    : undefined;
if (
  developmentUrl &&
  !["127.0.0.1", "localhost", "[::1]"].includes(
    new URL(developmentUrl).hostname,
  )
)
  throw new Error("O servidor de desenvolvimento precisa ser local.");
const documentUrl = developmentUrl || pathToFileURL(indexPath).href;

function assertSender(event: IpcMainInvokeEvent): void {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    !isTrustedDocument(event.senderFrame.url, documentUrl)
  ) {
    throw new Error("Esta página não tem acesso aos seus dados.");
  }
}

function registerHandlers(): void {
  const handle = (channel: string, action: (...args: any[]) => unknown) =>
    ipcMain.handle(channel, (event, ...args) => {
      assertSender(event);
      return action(...args);
    });
  handle("ninho:load", () => store.load());
  handle("ninho:ai-status", () => ai.status());
  handle("ninho:ai-chat", (request) => ai.chat(request));
  handle("ninho:ai-cancel", (requestId: string) => ai.cancel(requestId));
  handle("ninho:ai-unload", () => ai.unload());
  handle("ninho:dispatch", (command: Command) => store.dispatch(command));
  handle(
    "ninho:import-materials",
    async (context?: { subjectId?: string; lessonId?: string }) => {
      const result = await dialog.showOpenDialog(window!, {
        title: "Adicionar materiais ao Ninho",
        buttonLabel: "Adicionar à biblioteca",
        properties: ["openFile", "multiSelections"],
        filters: [
          { name: "Materiais de estudo", extensions: [...MATERIAL_EXTENSIONS] },
        ],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      return store.importFiles(result.filePaths, context);
    },
  );
  handle("ninho:preview-material", (id: string) => store.previewMaterial(id));
  handle("ninho:open-material", async (id: string) => {
    const error = await shell.openPath(await store.resolveMaterial(id));
    if (error) throw new Error(`Não foi possível abrir o arquivo: ${error}`);
  });
  handle("ninho:open-external", async (url: string) => {
    await shell.openExternal(validateExternalUrl(url));
  });
  handle("ninho:export-backup", async () => {
    const result = await dialog.showSaveDialog(window!, {
      title: "Salvar backup completo",
      defaultPath: path.join(
        app.getPath("documents"),
        `Ninho-backup-${new Date().toISOString().slice(0, 10)}.zip`,
      ),
      buttonLabel: "Salvar backup",
      filters: [{ name: "Backup do Ninho", extensions: ["zip"] }],
    });
    if (result.canceled || !result.filePath) return null;
    return store.exportBackup(
      result.filePath.toLowerCase().endsWith(".zip")
        ? result.filePath
        : `${result.filePath}.zip`,
    );
  });
  handle("ninho:restore-backup", async () => {
    const result = await dialog.showOpenDialog(window!, {
      title: "Restaurar backup do Ninho",
      buttonLabel: "Selecionar backup",
      properties: ["openFile"],
      filters: [{ name: "Backup do Ninho", extensions: ["zip"] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const confirmation = await dialog.showMessageBox(window!, {
      type: "question",
      title: "Restaurar seus estudos",
      message: "Substituir a coleção atual pelo backup?",
      detail:
        "O Ninho salvará uma cópia completa da coleção atual antes de restaurar. Seus arquivos originais permanecem intactos.",
      buttons: ["Cancelar", "Restaurar backup"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (confirmation.response !== 1) return null;
    const restored = await store.restoreBackup(result.filePaths[0]);
    const notice = store.takeRecoveryNotice();
    if (notice)
      await dialog.showMessageBox(window!, {
        type: "warning",
        title: "Backup restaurado",
        message: "Seus estudos foram restaurados.",
        detail: notice,
      });
    return restored;
  });
  handle("ninho:get-paths", () => ({
    data: store.directory,
    backup: store.backupsDirectory,
  }));
}

async function initializeStore(): Promise<boolean> {
  try {
    await store.load();
    const notice = store.takeRecoveryNotice();
    if (notice)
      await dialog.showMessageBox({
        type: "warning",
        title: "Estudos recuperados",
        message: "Seus estudos foram recuperados.",
        detail: notice,
      });
    return true;
  } catch (error) {
    if (error instanceof DataRecoveryError) {
      const result = await dialog.showMessageBox({
        type: "error",
        title: "Recuperar seus estudos",
        message: error.message,
        detail: `Pasta preservada: ${dataDirectory}`,
        buttons: ["Selecionar backup", "Fechar"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      if (result.response === 0) {
        const selected = await dialog.showOpenDialog({
          title: "Escolher backup para recuperação",
          properties: ["openFile"],
          filters: [{ name: "Backup do Ninho", extensions: ["zip"] }],
        });
        if (!selected.canceled && selected.filePaths[0]) {
          try {
            await store.restoreBackup(selected.filePaths[0]);
            return true;
          } catch (restoreError) {
            await dialog.showMessageBox({
              type: "error",
              message: "Não foi possível restaurar esse backup.",
              detail:
                restoreError instanceof Error
                  ? restoreError.message
                  : "O arquivo não é válido.",
            });
          }
        }
      }
    } else {
      await dialog.showMessageBox({
        type: "error",
        title: "Ninho",
        message: "Não foi possível abrir a pasta de estudos.",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    return false;
  }
}

async function createWindow(): Promise<void> {
  window = new BrowserWindow({
    width: 1420,
    height: 940,
    minWidth: 1100,
    minHeight: 720,
    title: "Ninho",
    backgroundColor: "#f5f4ee",
    show: false,
    autoHideMenuBar: true,
    icon: path.join(app.getAppPath(), "resources", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      webviewTag: false,
      webSecurity: true,
      spellcheck: true,
    },
  });
  Menu.setApplicationMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedDocument(url, documentUrl)) event.preventDefault();
  });
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  window.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.on("will-prevent-unload", (event) =>
    event.preventDefault(),
  );
  window.once("ready-to-show", () => {
    if (!isolatedTest || process.env.NINHO_E2E_VISIBLE === "1") window?.show();
  });
  window.on("closed", () => {
    window = null;
  });
  if (developmentUrl) await window.loadURL(developmentUrl);
  else await window.loadFile(indexPath);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (window?.isMinimized()) window.restore();
    window?.show();
    window?.focus();
  });
  app
    .whenReady()
    .then(async () => {
      if (!(await initializeStore())) {
        app.quit();
        return;
      }
      registerHandlers();
      await createWindow();
    })
    .catch((error) => {
      dialog.showErrorBox(
        "Ninho não pôde iniciar",
        error instanceof Error ? error.message : String(error),
      );
      app.quit();
    });
  app.on("window-all-closed", () => app.quit());
  let aiCleaned = false;
  app.on("before-quit", (event) => {
    if (aiCleaned) return;
    event.preventDefault();
    aiCleaned = true;
    void Promise.race([
      ai.dispose(),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]).finally(() => app.quit());
  });
}

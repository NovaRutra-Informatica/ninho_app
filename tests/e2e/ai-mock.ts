import type { ElectronApplication } from "@playwright/test";

export interface AiMockState {
  mode: "online" | "offline" | "error" | "pending";
  reply: string;
  calls: {
    url: string;
    body?: {
      model?: string;
      messages?: { role: string; content: string }[];
      stream?: boolean;
    };
  }[];
}

export async function configureAi(
  app: ElectronApplication,
  patch: Partial<Pick<AiMockState, "mode" | "reply">>,
) {
  await app.evaluate((_electron, value) => {
    const context = globalThis as unknown as { __ninhoAi: AiMockState };
    Object.assign(context.__ninhoAi, value);
  }, patch);
}

export async function aiCalls(app: ElectronApplication) {
  return app.evaluate(
    () => (globalThis as unknown as { __ninhoAi: AiMockState }).__ninhoAi.calls,
  );
}

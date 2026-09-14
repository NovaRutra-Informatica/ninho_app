import { build } from "esbuild";
import { mkdir } from "node:fs/promises";

await mkdir("dist-electron", { recursive: true });
await build({
  entryPoints: { main: "src/main/main.ts", preload: "src/main/preload.ts" },
  outdir: "dist-electron",
  outExtension: { ".js": ".cjs" },
  platform: "node",
  format: "cjs",
  target: "node22",
  bundle: true,
  external: ["electron"],
  sourcemap: true,
  legalComments: "none",
});

import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";

await build({
  entryPoints: ["src/server/index.ts"],
  outfile: "bin/token-context-optimizer.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["node:*"],
  logLevel: "info",
});

const outfile = "bin/token-context-optimizer.mjs";
const bundled = await readFile(outfile, "utf8");
await writeFile(outfile, bundled.replace(/[ \t]+$/gmu, ""), "utf8");

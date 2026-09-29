import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

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
const shebang = "#!/usr/bin/env node\n";
const body = bundled.startsWith(shebang) ? bundled.slice(shebang.length) : bundled;
const imageDependencyNotices = await bundledDependencyNotices(["fast-png", "fflate", "iobuffer"]);
await writeFile(outfile, `${shebang}${imageDependencyNotices}${body}`.replace(/[ \t]+$/gmu, ""), "utf8");

async function bundledDependencyNotices(packageNames) {
  const notices = [];
  for (const packageName of packageNames) {
    const license = await readFile(join("node_modules", packageName, "LICENSE"), "utf8");
    notices.push(`Package: ${packageName}\n${license.trim()}`);
  }
  return `/*\nBundled dependency license notices\n\n${notices.join("\n\n")}\n*/\n`;
}

import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { bundleBuildOptions, collectThirdPartyComponents, renderThirdPartyNotices } from "./third-party-notices.mjs";

const result = await build({ ...bundleBuildOptions, metafile: true, logLevel: "info" });

const outfile = bundleBuildOptions.outfile;
const bundled = await readFile(outfile, "utf8");
const shebang = "#!/usr/bin/env node\n";
const body = bundled.startsWith(shebang) ? bundled.slice(shebang.length) : bundled;
const notices = renderThirdPartyNotices(await collectThirdPartyComponents({ metafile: result.metafile, rootDir: "." }));
await writeFile(outfile, `${shebang}${notices}${body}`.replace(/[ \t]+$/gmu, ""), "utf8");

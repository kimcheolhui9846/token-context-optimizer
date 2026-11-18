import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { bundleBuildOptions, collectThirdPartyComponents, renderThirdPartyNotices } from "./third-party-notices.mjs";

const result = await build({ ...bundleBuildOptions, metafile: true, logLevel: "info" });

const outfile = bundleBuildOptions.outfile;
const bundled = await readFile(outfile, "utf8");
const shebang = "#!/usr/bin/env node\n";
const body = bundled.startsWith(shebang) ? bundled.slice(shebang.length) : bundled;
const notices = renderThirdPartyNotices({
  ...(await collectThirdPartyComponents({ metafile: result.metafile, rootDir: "." })),
  projectLicense: await readFile("LICENSE", "utf8"),
});
const thirdPartyHeading = "Bundled third-party license notices";
const thirdPartyOffset = notices.indexOf(thirdPartyHeading);
if (thirdPartyOffset < 0) throw new Error(`Generated bundle is missing ${thirdPartyHeading}`);
const projectNotice = notices.slice(0, thirdPartyOffset);
const thirdPartyNotice = notices.slice(thirdPartyOffset).replace(/[ \t]+$/gmu, "");
await writeFile(outfile, `${shebang}${projectNotice}${thirdPartyNotice}${body.replace(/[ \t]+$/gmu, "")}`, "utf8");

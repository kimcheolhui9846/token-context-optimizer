import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import Module from "node:module";
import { arch, platform, release } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [family, sizeText, sampleCountText] = process.argv.slice(2);
const size = Number(sizeText);
const sampleCount = Number(sampleCountText);
const samplesByDesign = new Map([
  ["drop", { prefix: "", unit: "DROP ", suffix: "" }],
  ["semicolon", { prefix: "x", unit: ";", suffix: "x" }],
  ["php_opener", { prefix: "", unit: "<?a", suffix: "" }],
  ["tag_space", { prefix: "<a", unit: " ", suffix: "" }],
  ["trace_spaces_equals", { prefix: "trace", unit: " ", suffix: "=" }],
  ["hyphen", { prefix: "", unit: "a-", suffix: "" }],
  ["dot", { prefix: "", unit: "a.", suffix: "" }],
  ["blanklines", { prefix: "a", unit: "\n\n", suffix: "" }],
  ["bang_letter", { prefix: "", unit: "<!a", suffix: "" }],
  ["html_comment", { prefix: "", unit: "<!--", suffix: "" }],
  ["npm_dots_x", { prefix: "npm", unit: ".", suffix: "x" }],
  ["command_prefix", { prefix: "sudo ", unit: "-x ", suffix: "x" }],
]);
if (
  !samplesByDesign.has(family) ||
  !Number.isSafeInteger(size) || size < 1 || size > 10 * 1024 * 1024 ||
  !Number.isSafeInteger(sampleCount) || sampleCount < 1 || sampleCount > 5
) {
  throw new Error("usage: measure-large-child.mjs <known-family> <size<=10MiB> <samples<=5>");
}

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const sourcePath = resolve(root, "src/core/policy.ts");
const sourceBytes = readFileSync(sourcePath);
const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
const source = `${sourceBytes.toString("utf8")}\nexport { classifyContext };\n`;
const require = createRequire(import.meta.url);
const ts = require("typescript");
const compiledSource = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiled = new Module(sourcePath);
compiled.filename = sourcePath;
compiled.paths = Module._nodeModulePaths(root);
compiled._compile(compiledSource, sourcePath);

function exactLength(targetSize, prefix, unit, suffix = "") {
  const remaining = Math.max(0, targetSize - prefix.length - suffix.length);
  return prefix + unit.repeat(Math.ceil(remaining / unit.length)).slice(0, remaining) + suffix;
}

const recipe = samplesByDesign.get(family);
const input = exactLength(size, recipe.prefix, recipe.unit, recipe.suffix);
if (input.length !== size || Buffer.byteLength(input, "utf8") !== size || /[^\x00-\x7f]/u.test(input)) {
  throw new Error("large measurement recipe must produce exact-length ASCII input");
}
compiled.exports.classifyContext(exactLength(Math.min(100, size), recipe.prefix, recipe.unit, recipe.suffix));

process.stdout.write(`${JSON.stringify({
  type: "metadata",
  family,
  size,
  utf16Length: input.length,
  utf8Bytes: Buffer.byteLength(input, "utf8"),
  sampleCount,
  source: "src/core/policy.ts",
  sourceSha256,
  environment: { node: process.version, platform: platform(), release: release(), arch: arch() },
})}\n`);

for (let index = 0; index < sampleCount; index += 1) {
  const started = process.hrtime.bigint();
  const classification = compiled.exports.classifyContext(input);
  const elapsedNs = Number(process.hrtime.bigint() - started);
  process.stdout.write(`${JSON.stringify({
    type: "sample",
    index,
    elapsedNs,
    mode: classification.mode,
    reasons: classification.reasons,
    warnings: classification.warnings,
  })}\n`);
}

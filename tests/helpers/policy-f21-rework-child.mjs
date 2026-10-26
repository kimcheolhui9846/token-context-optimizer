import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import Module from "node:module";
import { resolve } from "node:path";

const [mode, sourceRelative, recipe = "a-"] = process.argv.slice(2);
const root = process.cwd();
const sourcePath = resolve(root, sourceRelative);
const source = `${readFileSync(sourcePath, "utf8")}\nexport { EXACT_PATTERNS, hasCredentialLabel };\n`;
const ts = createRequire(import.meta.url)("typescript");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiled = new Module(sourcePath);
compiled.filename = sourcePath;
compiled.paths = Module._nodeModulePaths(root);
compiled._compile(js, sourcePath);

if (mode === "throw") {
  throw new Error("synthetic child failure");
}

if (mode === "timeout") {
  setInterval(() => {}, 1_000);
  await new Promise(() => {});
}

if (mode !== "dense") {
  throw new Error(`unknown mode: ${mode}`);
}

const targetBytes = 10 * 1024 * 1024;
const units = new Set(["a-", "pass ", "secret ", "private "]);
if (!units.has(recipe)) throw new Error(`unknown dense recipe: ${recipe}`);
const unit = recipe;
const content = unit.repeat(Math.ceil(targetBytes / unit.length)).slice(0, targetBytes);
const predicate = compiled.exports.EXACT_PATTERNS[0]?.[1];
const combined = typeof predicate === "function" ? predicate(content) : predicate.test(content);
const e3 = compiled.exports.hasCredentialLabel(content);
process.stdout.write(JSON.stringify({ status: "returned", combined, e3, byteLength: Buffer.byteLength(content) }));

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import Module from "node:module";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const [mode, sourceRelative, fault] = process.argv.slice(2);
const root = process.cwd();
const require = createRequire(import.meta.url);
const ts = require("typescript");

function compile(sourcePath, source, append = "") {
  const js = ts.transpileModule(`${source}\n${append}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiled = new Module(sourcePath);
  compiled.filename = sourcePath;
  compiled.paths = Module._nodeModulePaths(root);
  compiled._compile(js, sourcePath);
  return compiled.exports;
}

function exactLength(byteLength, prefix, unit, suffix = "") {
  const remaining = byteLength - prefix.length - suffix.length;
  return prefix + unit.repeat(Math.ceil(remaining / unit.length)).slice(0, remaining) + suffix;
}

function largeInputs() {
  const sixMiB = 6_000_000;
  const tenMiB = 10 * 1024 * 1024;
  // patternIndex values are zero-based indexes into EXACT_PATTERNS.
  return [
    { name: "bearer", patternIndex: 2, byteLength: sixMiB, recipe: "bearer" },
    // Neutral padding keeps the exact 10 MiB path even: xx/a/a/…/a.
    { name: "path", patternIndex: 8, byteLength: tenMiB, recipe: "path" },
    { name: "identifier", patternIndex: 19, byteLength: sixMiB, recipe: "identifier" },
    { name: "trace", patternIndex: 21, byteLength: sixMiB, recipe: "trace" },
    { name: "hex", patternIndex: 23, byteLength: sixMiB, recipe: "hex" },
    { name: "classify", patternIndex: null, byteLength: tenMiB, recipe: "path" },
  ];
}

function makeLargeInput(recipe, byteLength) {
  if (recipe === "path") return `xx${"/a".repeat((byteLength - 2) / 2)}`;
  if (recipe === "bearer") return exactLength(byteLength, "Bearer ", "A");
  if (recipe === "identifier") return exactLength(byteLength, "id=", "a");
  if (recipe === "trace") return exactLength(byteLength, "trace=", "a");
  if (recipe === "hex") return exactLength(byteLength, "", "a");
  throw new Error(`unknown large recipe ${recipe}`);
}

function loadPolicy(sourcePath, injectFault = false) {
  let source = readFileSync(sourcePath, "utf8");
  if (injectFault) {
    const marker = /function classifyContextUnchecked\(content: string\)[^{]*\{/u;
    if (!marker.test(source)) throw new Error("missing classifyContextUnchecked injection marker");
    const faultExpressions = {
      "range-stack": "RangeError(\"Maximum call stack size exceeded\")",
      "range-other": "RangeError(\"synthetic range failure\")",
      error: "Error(\"synthetic failure\")",
      "error-stack": "Error(\"Maximum call stack size exceeded\")",
      "type-error": "TypeError(\"synthetic type failure\")",
      "type-error-stack": "TypeError(\"Maximum call stack size exceeded\")",
    };
    const expression = faultExpressions[fault];
    if (!expression) throw new Error(`unknown fault token: ${fault}`);
    source = source.replace(marker, (match) => `${match}\n  if (process.env.POLICY_FAULT === "${fault}") throw new ${expression};`);
  }
  return compile(sourcePath, source, "export { EXACT_PATTERNS };");
}

function emitOutcome(name, target) {
  try {
    return { name, status: "returned", value: target() };
  } catch (error) {
    return {
      name,
      status: "threw",
      error: { name: error?.constructor?.name ?? "UnknownError", message: String(error?.message ?? error) },
    };
  }
}

if (mode === "large-calls") {
  const policy = loadPolicy(resolve(root, sourceRelative));
  const specs = largeInputs();
  const byteLength = [];
  const utf16Length = [];
  const outcomes = specs.map(({ name, patternIndex, byteLength: expectedBytes, recipe }) => {
    let predicate;
    if (patternIndex !== null) {
      predicate = policy.EXACT_PATTERNS[patternIndex]?.[1];
      if (!predicate) throw new Error(`missing predicate at index ${patternIndex}`);
    }
    let content = makeLargeInput(recipe, expectedBytes);
    const outcome = emitOutcome(name, () => {
      if (patternIndex === null) return policy.classifyContext(content);
      return typeof predicate === "function" ? predicate(content) : predicate.test(content);
    });
    byteLength.push(Buffer.byteLength(content, "utf8"));
    utf16Length.push(content.length);
    content = "";
    return outcome;
  });
  process.stdout.write(JSON.stringify({ byteLength, utf16Length, outcomes }));
} else if (mode === "fault") {
  const policy = loadPolicy(resolve(root, sourceRelative), true);
  process.env.POLICY_FAULT = fault;
  process.stdout.write(JSON.stringify(emitOutcome("injected-fault", () => policy.classifyContext("ordinary prose"))));
} else if (mode === "artifacts") {
  require.extensions[".ts"] = (module, filename) => {
    const source = readFileSync(filename, "utf8").replaceAll(".js\"", ".ts\"");
    const js = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    module._compile(js, filename);
  };
  const artifacts = require(resolve(root, "src/core/artifacts.ts"));
  const rootDir = await mkdtemp(join(tmpdir(), "tco-large-policy-"));
  const path = join(rootDir, "large.txt");
  let cleanedUp = false;
  let indexedByteLength;
  let summary;
  try {
    const content = exactLength(10 * 1024 * 1024, "Bearer ", "A");
    await writeFile(path, content, "utf8");
    const store = new artifacts.MemoryArtifactStore();
    const artifact = await artifacts.indexArtifact({ path, store, allowedRoots: [rootDir] });
    indexedByteLength = artifact.byteLength;
    summary = artifacts.summarizeArtifact({ artifactId: artifact.artifactId, maxTokens: 200, store });
  } finally {
    await rm(rootDir, { recursive: true, force: true });
    cleanedUp = true;
  }
  process.stdout.write(JSON.stringify({ byteLength: indexedByteLength, cleanedUp, summary }));
} else {
  throw new Error("usage: policy-large-input-child.mjs <large-calls|fault|artifacts> <source> [fault]");
}

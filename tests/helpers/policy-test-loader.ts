import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import Module from "node:module";
import { resolve } from "node:path";

import type { ContextClassification } from "../../src/core/types.js";

type PolicyPredicate = RegExp | ((content: string) => boolean);
type CompilableModule = Module & {
  paths: string[];
  _compile(source: string, filename: string): unknown;
};

const moduleWithNodePaths = Module as typeof Module & {
  _nodeModulePaths(from: string): string[];
};

export interface LoadedPolicyInternals {
  EXACT_PATTERNS: Array<[string, PolicyPredicate]>;
  classifyContext(content: string): ContextClassification;
  lossyCompressionAllowed(classification: ContextClassification): boolean;
}

export function loadPolicyInternals(sourceRelative: string): LoadedPolicyInternals {
  const root = process.cwd();
  const sourcePath = resolve(root, sourceRelative);
  const source = `${readFileSync(sourcePath, "utf8")}\nexport { EXACT_PATTERNS };\n`;
  const require = createRequire(import.meta.url);
  const ts = require("typescript");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiled = new Module(sourcePath) as CompilableModule;
  compiled.filename = sourcePath;
  compiled.paths = moduleWithNodePaths._nodeModulePaths(root);
  compiled._compile(js, sourcePath);
  return compiled.exports as LoadedPolicyInternals;
}

export function evaluatePolicyPredicate(predicate: PolicyPredicate, content: string): boolean {
  return typeof predicate === "function" ? predicate(content) : predicate.test(content);
}

// Planning-only impact survey. No product mutation, performance timers or hosted calls.
// Run npm run build at the pinned source, then node research/src/n17-korean-credential-impact.mjs --out <JSON>.
// Extraction helpers below adapt scripts/analyze-f21-uri-impact.mjs; only pure fixture builders are transpiled.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import Module from "node:module";
import { resolve, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = process.cwd();
const BASE = "f78737ea66fc91cb59bf1069a8c598a46c7032e1";
const EXPECTED_DIST_LF_SHA256 = "2da21283720e123beebac64d7327c6f55de7975e574d09df40ad2c2b7085ba5b";
const require = createRequire(import.meta.url), ts = require("typescript"), moduleWithNodePaths = Module;
const paths = { policy: "src/core/policy.ts", corpus: "tests/helpers/policy-corpus.ts", characterization: "tests/fixtures/policy/characterization.json", benchmark: "benchmarks/run.ts", coreTest: "tests/core.test.ts" };
const unresolvedSites = [], extraSourceFiles = new Set(), sourceFiles = new Map();
const sha256 = value => createHash("sha256").update(value).digest("hex");
const lf = value => value.replaceAll("\r\n", "\n");
const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
function readBaseText(file) {
  if (!sourceFiles.has(file)) {
    const text = git(["show", BASE + ":" + file]);
    sourceFiles.set(file, { text, blob: git(["rev-parse", BASE + ":" + file]).trim(), sha256Lf: sha256(lf(text)) });
  }
  return sourceFiles.get(file).text;
}

function compileModule(source, sourcePath, exportSuffix) {
  const compiledSource = `${source}\n${exportSuffix}\n`;
  const js = ts.transpileModule(compiledSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: sourcePath,
  }).outputText;
  const module = new Module(sourcePath);
  module.filename = sourcePath;
  module.paths = moduleWithNodePaths._nodeModulePaths(root);
  module._compile(js, sourcePath);
  return module.exports;
}

function isStringNode(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function stringValue(node) {
  return ts.isStringLiteral(node) ? node.text : node.text;
}

function staticString(node) {
  if (!node) return undefined;
  if (isStringNode(node)) return node.text;
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "join" && ts.isArrayLiteralExpression(node.expression.expression)) {
    const values = node.expression.expression.elements.map(staticString);
    const separator = staticString(node.arguments[0]);
    if (values.every(v=>typeof v === "string") && typeof separator === "string") return values.join(separator);
  }
  return undefined;
}

function lineContext(sourceFile, node) {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const lineText = sourceFile.text.split(/\r?\n/u)[start.line] ?? "";
  return { line: start.line + 1, column: start.character + 1, context: lineText.trim() };
}

function collectClassifierLiterals(filePath) {
  const source = readBaseText(filePath);
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const entries = [];
  const add = (node, context, value) => {
    if (typeof value !== "string") return;
    entries.push({ content: value, ...lineContext(sourceFile, node), context });
  };
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ["classifyContext", "writeFile"].includes(node.expression.text)) {
      const arg = node.arguments[node.expression.text === "writeFile" ? 1 : 0];
      if (typeof staticString(arg) === "string") add(arg, node.expression.text + " static input", staticString(arg));
      else {
        let resolved;
        for (let scope = node.parent; scope && resolved === undefined; scope = scope.parent) {
          if (ts.isBlock(scope) && arg && ts.isIdentifier(arg)) {
            for (const statement of scope.statements) if (ts.isVariableStatement(statement)) {
              const declaration = statement.declarationList.declarations.find(d=>ts.isIdentifier(d.name)&&d.name.text===arg.text);
              if (declaration?.initializer) resolved = staticString(declaration.initializer);
            }
          }
        }
        if (resolved !== undefined) add(arg, node.expression.text + " resolved local literal", resolved);
        else unresolvedSites.push({file:filePath,...lineContext(sourceFile,node),argument:arg?.getText(sourceFile),note:"dynamic input; each-table input is enumerated separately when present"});
      }
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "each") {
      const table = node.arguments[0];
      if (table && ts.isArrayLiteralExpression(table)) {
        for (const row of table.elements) {
          if (ts.isArrayLiteralExpression(row)) {
            const literals = row.elements.filter(isStringNode);
            const candidate = literals[literals.length - 1];
            if (candidate) add(candidate, "it.each row input literal", stringValue(candidate));
          } else if (isStringNode(row)) {
            add(row, "it.each row input literal", stringValue(row));
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  const safety = sourceFile.statements.find(n=>ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.arguments[0]&&isStringNode(n.expression.arguments[0])&&n.expression.arguments[0].text === (filePath === paths.coreTest ? "safety policy" : "F-21 URI and credential boundaries"));
  assert(safety, `classifier describe missing: ${filePath}`);
  visit(safety);
  return { sourceHash: sha256(source), sourceLfHash: sha256(source.replaceAll("\r\n", "\n")), entries };
}

function collectBenchmarkSources() {
  const source = readBaseText(paths.benchmark);
  const sourceFile = ts.createSourceFile(paths.benchmark, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const entries = [];
  const visit = (node) => {
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === "source" && isStringNode(node.initializer)) {
      const object = node.parent;
      const nameProperty = ts.isObjectLiteralExpression(object)
        ? object.properties.find((property) => ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && property.name.text === "name" && isStringNode(property.initializer))
        : undefined;
      entries.push({
        content: stringValue(node.initializer),
        name: nameProperty ? stringValue(nameProperty.initializer) : null,
        ...lineContext(sourceFile, node.initializer),
        context: "benchmark source property literal",
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  const prelude = readBaseText("src/core/token-estimator.ts");
  extraSourceFiles.add("src/core/token-estimator.ts");
  const names=["buildLargeBuildLog","buildSemanticDegradationFixtures","buildCodeContextFixture"];
  const nodes=sourceFile.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text));
  assert.equal(nodes.length,3);
  const constants=sourceFile.statements.filter(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>ts.isIdentifier(d.name)&&["CODE_CONTEXT_EXPECTED_LINES","CODE_CONTEXT_DISTRACTOR_LINES"].includes(d.name.text)));
  const builders=compileModule(prelude+"\n"+[...constants,...nodes].map(n=>n.getText(sourceFile)).join("\n"),resolve(root,paths.benchmark),"export { "+names.join(",")+" };");
  for(const fixture of builders.buildSemanticDegradationFixtures()) entries.push({name:fixture.name+" (80-line document)",content:Array(80).fill(fixture.source).join("\n"),...lineContext(sourceFile,nodes.find(n=>n.name.text==="buildSemanticDegradationFixtures")),context:"actual repeated semantic benchmark document"});
  entries.push({name:"25K build log",content:builders.buildLargeBuildLog(25000),...lineContext(sourceFile,nodes.find(n=>n.name.text==="buildLargeBuildLog")),context:"actual pure benchmark builder; benchmark runner not invoked"});
  entries.push({name:"8K code context",content:builders.buildCodeContextFixture(8000).source,...lineContext(sourceFile,nodes.find(n=>n.name.text==="buildCodeContextFixture")),context:"actual pure benchmark builder; benchmark runner not invoked"});
  return { sourceHash: sha256(source), sourceLfHash: sha256(source.replaceAll("\r\n", "\n")), entries };
}

function collectGeneratedInputs(corpus) {
  const definitions = [["tests/policy-redos.test.ts","group1DifferentialInputs"],["tests/policy-redos-group2.test.ts","group2DifferentialInputs"],["tests/policy-redos-group3.test.ts","group3DifferentialInputs"],["tests/policy-redos-group4.test.ts","group4Inputs"],["tests/policy-large-input.test.ts","smallDifferentialInputs"]];
  return definitions.flatMap(([file,name])=>{
    extraSourceFiles.add(file);
    const source=readBaseText(file);
    const sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
    const node=sf.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
    assert(node, "generator not found: "+name);
    const globals=sf.statements.filter(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.every(d=>ts.isIdentifier(d.name)&&["whitespace","lineTerminators","starts","commands","codeKeywords"].includes(d.name.text))).map(n=>n.getText(sf)).join("\n");
    const module=compileModule("const policyCorpus="+JSON.stringify(corpus)+";\n"+globals+"\n"+node.getText(sf),resolve(root,file),"export { "+name+" };");
    const values=module[name]();assert(Array.isArray(values));
    return values.map((content,index)=>({group:"generated-test-inputs",id:name+":"+index,content,location:{file,...lineContext(sf,node),function:name,index}}));
  });
}


const SP = "[ \\t]?";
const T1 = [`비밀${SP}번호`, "비번", `패스${SP}워드`, `인증${SP}키`, `개인${SP}키`, `비밀${SP}키`, `시크릿${SP}키`, `액세스${SP}키`, `(?<![A-Za-z0-9])api${SP}키`, `복구${SP}코드`, `백업${SP}코드`, `인증${SP}토큰`, `접근${SP}토큰`, `액세스${SP}토큰`];
const T2 = ["암호", "토큰", `보안${SP}코드`];
const variants = [
  ["T1-H", T1, "[ \\t]*"], ["T1-J", T1, "\\s*"],
  ["T12-H", [...T1, ...T2], "[ \\t]*"], ["T12-J", [...T1, ...T2], "\\s*"],
].map(([id, labels, gap]) => ({ id, source: `(?:${labels.join("|")})${gap}[:=：]`, flags: "i" }));
const regexes = variants.map(v => new RegExp(v.source, v.flags));
function overlay(original, hit) {
  // #0 OR runs before every other tuple. The production catch discards accumulated reasons on resource failure.
  if (!hit || original.reasons.includes("classification_resource_limit")) return original;
  return { mode: "exact", reasons: ["secret", ...(original.mode === "exact" ? original.reasons.filter(r => r !== "secret") : [])], warnings: ["lossy_compression_not_allowed"] };
}
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const distPath = "dist/src/core/policy.js";
assert.equal(lf(readFileSync(resolve(root, paths.policy), "utf8")), lf(readBaseText(paths.policy)), "working policy differs from pinned base");
const distText = lf(readFileSync(resolve(root, distPath), "utf8"));
assert.equal(sha256(distText), EXPECTED_DIST_LF_SHA256, "stale/different dist: rebuild pinned base with lockfile compiler");
// policy.js is self-contained; it has no runtime imports. Never transpile or instrument production policy.
const { classifyContext } = await import(pathToFileURL(resolve(root, distPath)).href);
const exact = { mode: "exact", reasons: ["secret"], warnings: ["lossy_compression_not_allowed"] };
const semantic = { mode: "semantic", reasons: ["natural_language"], warnings: [] };
const unknown = { mode: "unknown", reasons: ["insufficient_semantic_signal"], warnings: ["lossy_compression_not_allowed"] };
const modeResult = { E: exact, S: semantic, U: unknown,
  I: { mode: "exact", reasons: ["identifier_or_hash", "code_or_path"], warnings: ["lossy_compression_not_allowed"] },
  C: { mode: "exact", reasons: ["secret", "identifier_or_hash", "code_or_path"], warnings: ["lossy_compression_not_allowed"] },
};
const prose = label => `회의실 ${label} hunter2 이니까 접속할 때 참고해 주세요.`;

// Independent literal oracle: columns are T1-H/T1-J/T12-H/T12-J, never derived from candidate lexicon.
const boundaryLiterals = [
  ["인증_토큰:", "0011", "S"], ["인증-토큰:", "0011", "S"], ["API-키:", "0000", "U"],
  ["개인_키:", "0000", "S"], ["비밀_번호:", "0000", "S"], ["보안_코드:", "0000", "S"],
  ["입력토큰:", "0011", "S"], ["비밀번호\u00a0:", "0101", "S"], ["비밀번호\u3000:", "0101", "S"],
  ["**비밀번호**:", "0000", "S"], ["비밀번호  :", "1111", "S"], ["비밀  번호:", "0000", "S"], ["password\u00a0:", "0000", "E"],
];
const historical = JSON.parse(readBaseText("research/results/n17/2026-11-02.json"));
assert.deepEqual(boundaryLiterals.map(r => r[0]), historical.boundaries.map(r => r.label));
const boundaries = boundaryLiterals.map(([label, bits, before], index) => ({
  id: `B${String(index + 1).padStart(2, "0")}`, label,
  cases: [["alone", `${label} hunter2`, before === "E" ? "E" : "U"], ["sentence", prose(label), before]].map(([form, content, originalCode]) => {
    const original = classifyContext(content);
    assert.deepEqual(original, modeResult[originalCode], `baseline boundary ${index}/${form}`);
    const expected = [...bits].map(bit => bit === "1" ? exact : modeResult[originalCode]);
    regexes.forEach((re, i) => {
      assert.equal(re.test(content), bits[i] === "1", `boundary match ${index}/${form}/${i}`);
      assert.deepEqual(overlay(original, re.test(content)), expected[i]);
    });
    return { form, content, original, matches: [...bits].map(b => b === "1"), expected };
  }),
}));
const literalLabels = [
  ["비밀번호", "1111"], ["비번", "1111"], ["패스워드", "1111"], ["인증키", "1111"], ["개인키", "1111"],
  ["비밀키", "1111"], ["시크릿 키", "1111"], ["액세스 키", "1111"], ["API 키", "1111"], ["복구 코드", "1111"],
  ["백업 코드", "1111"], ["인증 토큰", "1111"], ["접근 토큰", "1111"], ["액세스 토큰", "1111"],
  ["암호", "0011"], ["토큰", "0011"], ["보안 코드", "0011"],
];
const matrix = literalLabels.flatMap(([label, bits]) => [":", "=", "："].flatMap(sep => [
  ["alone", `${label}${sep} hunter2`, "U"], ["sentence", prose(label + sep), label === "API 키" ? "U" : "S"],
].map(([form, content, before]) => {
  const original = classifyContext(content); assert.deepEqual(original, modeResult[before]);
  const expected = [...bits].map(b => b === "1" ? exact : modeResult[before]);
  regexes.forEach((re, i) => { assert.equal(re.test(content), bits[i] === "1"); assert.deepEqual(overlay(original, re.test(content)), expected[i]); });
  return { label, separator: sep, form, content, original, matches: [...bits].map(b => b === "1"), expected };
})));
const controls = [
  ["암호화:", "0000", "S", "SSSS"], ["토큰화:", "0000", "S", "SSSS"], ["비밀번호 변경:", "0000", "S", "SSSS"], ["비밀번호는 hunter2", "0000", "S", "SSSS"],
  ["비밀번호＝", "0000", "S", "SSSS"], ["비밀번호\u200b:", "0000", "S", "SSSS"], ["비밀번호\n:", "0101", "U", "UEUE"], ["비밀번호\r\n:", "0101", "U", "UEUE"],
  ["비밀번호\u2028:", "0101", "S", "SESE"], ["비밀번호\u2029:", "0101", "S", "SESE"], ["비밀번호\ufeff:", "0101", "S", "SESE"],
  ["비밀 번호:", "1111", "S", "EEEE"], ["비밀\t번호:", "1111", "S", "EEEE"], ["패스 워드:", "1111", "S", "EEEE"], ["인증 키:", "1111", "S", "EEEE"],
  ["개인 키:", "1111", "S", "EEEE"], ["비밀 키:", "1111", "S", "EEEE"], ["시크릿키:", "1111", "S", "EEEE"], ["액세스키:", "1111", "S", "EEEE"],
  ["비밀\n번호:", "0000", "U", "UUUU"], ["비밀\u00a0번호:", "0000", "S", "SSSS"], ["계정비밀번호:", "1111", "S", "EEEE"],
  ["api키:", "1111", "S", "EEEE"], ["api\t키:", "1111", "S", "EEEE"], ["v2api 키:", "0000", "S", "SSSS"], ["카카오api 키:", "1111", "S", "EEEE"], ["my_api 키:", "1111", "I", "CCCC"],
  ["`비밀번호`:", "0000", "U", "UUUU"], ["password:", "0000", "E", "EEEE"], ["password：", "0000", "S", "SSSS"],
].map(([label, bits, before, after]) => {
  const content = prose(label), original = classifyContext(content);
  assert.deepEqual(original, modeResult[before], `control baseline ${label}`);
  const expected = [...after].map(code => modeResult[code]);
  regexes.forEach((re, i) => { assert.equal(re.test(content), bits[i] === "1", `control ${label}/${i}`); assert.deepEqual(overlay(original, re.test(content)), expected[i]); });
  return { content, matches: [...bits].map(b => b === "1"), original, expected };
});
assert.deepEqual(classifyContext("Guest wifi password：hunter2 is taped under the desk for visitors."), semantic, "N27 baseline");
assert.deepEqual(overlay({ mode: "exact", reasons: ["numeric_or_table"], warnings: ["lossy_compression_not_allowed"] }, true), { mode: "exact", reasons: ["secret", "numeric_or_table"], warnings: ["lossy_compression_not_allowed"] });
const resource = { mode: "exact", reasons: ["classification_resource_limit"], warnings: ["lossy_compression_not_allowed", "classification_resource_limit"] };
assert.deepEqual(overlay(resource, true), resource);
assert.deepEqual(overlay(exact, true), exact);

const records = [];
const add = (group, content, location) => { assert.equal(typeof content, "string"); records.push({ group, content, location }); };
const corpus = compileModule(readBaseText(paths.corpus), resolve(root, paths.corpus), "export { policyCorpus };").policyCorpus;
const frozen = JSON.parse(readBaseText(paths.characterization)).entries;
assert.equal(corpus.length, 120); assert.equal(frozen.length, 120);
assert.deepEqual(corpus.map(r => [r.id, r.content]), frozen.map(r => [r.id, r.content]));
for (const [group, file, entries] of [["characterization", paths.characterization, frozen], ["policyCorpus", paths.corpus, corpus], ["f21-overlay", "tests/fixtures/policy/f21-uri-expectations.json", JSON.parse(readBaseText("tests/fixtures/policy/f21-uri-expectations.json")).entries]]) {
  entries.forEach((r, i) => add(group, r.content, { file, entry: i + 1, id: r.id }));
}
for (const file of [paths.coreTest, "tests/policy-uri-scheme.test.ts"]) {
  for (const r of collectClassifierLiterals(file).entries) add(file === paths.coreTest ? "existing-test-input-literals" : "f21-test-literals", r.content, { file, line: r.line, column: r.column, context: r.context });
}
for (const r of collectGeneratedInputs(corpus)) add("generated-test-inputs", r.content, r.location);
for (const r of collectBenchmarkSources().entries) add("benchmark-fixtures", r.content, { file: paths.benchmark, name: r.name, line: r.line, column: r.column, context: r.context });
const mdFiles = git(["ls-tree", "-r", "--name-only", "-z", BASE]).split("\0").filter(f => f.endsWith(".md"));
let koreanMdCount = 0;
for (const file of mdFiles) {
  const text = lf(readBaseText(file)); if (!/[가-힣]/u.test(text)) continue;
  koreanMdCount++;
  text.split("\n").forEach((content, i) => { if (content.trim()) add("korean-markdown-line", content, { file, line: i + 1 }); });
  text.split(/\n\s*\n/u).forEach((content, i) => { if (content.trim()) add("korean-markdown-paragraph", content, { file, paragraph: i + 1 }); });
}
const byContent = new Map();
for (const { group, content, location } of records) {
  if (!byContent.has(content)) byContent.set(content, { content, sources: [] });
  byContent.get(content).sources.push({ group, ...location });
}
const rows = [...byContent.values()].map(row => {
  const original = classifyContext(row.content);
  const matches = regexes.map(re => re.test(row.content));
  const results = matches.map(hit => overlay(original, hit));
  const crossLine = variants.map(v => [...row.content.matchAll(new RegExp(v.source, "ig"))].some(m => /[\r\n\u2028\u2029]/u.test(m[0])));
  return { ...row, original, matches, results, crossLine };
});
function summarize(input) {
  return Object.fromEntries(variants.map((v, i) => {
    const transitions = {}, totals = { rows: input.length, matches: 0, modeChanged: 0, reasonsOnlyChanged: 0, warningsChanged: 0, resultChanged: 0, identical: 0, crossLineMatches: 0 };
    for (const r of input) {
      const after = r.results[i], before = r.original;
      const key = before.mode + "->" + after.mode; transitions[key] = (transitions[key] ?? 0) + 1;
      totals.matches += +r.matches[i]; totals.modeChanged += +(before.mode !== after.mode);
      totals.reasonsOnlyChanged += +(before.mode === after.mode && !equal(before.reasons, after.reasons));
      totals.warningsChanged += +!equal(before.warnings, after.warnings); totals.resultChanged += +!equal(before, after);
      totals.identical += +equal(before, after); totals.crossLineMatches += +r.crossLine[i];
    }
    return [v.id, { ...totals, transitions }];
  }));
}
const analyzed = new Map(rows.map(r => [r.content, r]));
const groupNames = [...new Set(records.map(r => r.group))];
const groupSummaries = Object.fromEntries(groupNames.map(group => [group, {
  sourceRows: summarize(records.filter(r => r.group === group).map(r => analyzed.get(r.content))),
  uniqueInputs: summarize(rows.filter(r => r.sources.some(s => s.group === group))),
}]));
const isPredesign = s => s.file === "research/plans/2026-11-02-n17-korean-credential-predesign.md";
const changedRows = rows.filter(r => r.results.some(result => !equal(result, r.original)));
// Completeness diagnostic, not another corpus: scan all pinned tracked non-Markdown blobs literally.
// Candidate hits in source/result files are not automatically runtime classifier inputs.
const tree = git(["ls-tree", "-rlz", BASE]).split("\0").filter(Boolean);
const coverageScan = { trackedEntries: tree.length, markdownEntries: 0, scannedUtf8: 0, excluded: [], nonMarkdownHits: [], literalOnly: true };
const inventoriedFiles = new Set(records.map(r => r.location.file));
for (const entry of tree) {
  const tab = entry.indexOf("\t"), file = entry.slice(tab + 1);
  const [, type, blob, sizeText] = entry.slice(0, tab).trim().split(/\s+/u);
  if (file.endsWith(".md")) { coverageScan.markdownEntries++; continue; }
  if (type !== "blob" || Number(sizeText) > 64 * 1024 * 1024) { coverageScan.excluded.push({ file, reason: type !== "blob" ? "non-blob" : "over64MiB" }); continue; }
  const bytes = execFileSync("git", ["cat-file", "blob", blob], { cwd: root, windowsHide: true, maxBuffer: 65 * 1024 * 1024 });
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { coverageScan.excluded.push({ file, reason: "not-valid-UTF8" }); continue; }
  if (text.includes("\0")) { coverageScan.excluded.push({ file, reason: "NUL-bearing-binary" }); continue; }
  coverageScan.scannedUtf8++;
  if (!regexes[3].test(text)) continue;
  coverageScan.nonMarkdownHits.push({ file, blob, sha256: sha256(bytes),
    disposition: inventoriedFiles.has(file) ? "input extraction included; dynamic exclusions still apply" : file.startsWith("research/") ? "research source/result text; not an existing classifier input group" : "non-runtime document/source; inspect before treating as classifier input",
  });
}
const scriptPath = relative(root, fileURLToPath(import.meta.url)).replaceAll("\\", "/");
const output = {
  schema: "n17-korean-credential-impact/v1", base: BASE,
  scope: { planningOnly: true, productMutation: false, performanceMeasured: false, variants, candidateComposition: "#0 OR with secret prepended; non-exact reasons replaced; resource fallback preserved; no production execution of candidate" },
  reproducibility: { script: scriptPath, scriptSha256Lf: sha256(lf(readFileSync(resolve(root, scriptPath), "utf8"))), node: process.version, typescript: ts.version, dist: { path: distPath, sha256Lf: sha256(distText), buildSource: BASE, command: "npm ci && npm run build", runtimeImports: [] }, sources: Object.fromEntries([...sourceFiles].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([file, { blob, sha256Lf }]) => [file, { blob, sha256Lf }])) },
  inventory: { sourceRows: records.length, uniqueInputs: rows.length, duplicateOccurrences: records.length - rows.length, markdownFilesExamined: mdFiles.length, koreanMarkdownFiles: koreanMdCount, sourceCounts: Object.fromEntries(groupNames.map(g => [g, records.filter(r => r.group === g).length])), deduplication: "exact string across groups; source git blobs; Markdown CRLF normalized LF, lines and blank-line paragraphs both retained as source occurrences; all provenance retained for changed rows", unresolvedSites },
  summary: summarize(rows), groupSummaries, coverageScan,
  excludingPredesignOnlyInputs: summarize(rows.filter(r => r.sources.some(s => !isPredesign(s)))),
  changedRows,
  unchangedDigest: sha256(JSON.stringify(rows.filter(r => r.results.every(result => equal(result, r.original))).map(r => ({ content: r.content, sources: r.sources, original: r.original })))),
  synthetic: { denominator: "excluded from repository input counts", boundaries, matrix, controls, syntheticCaseVariantChecks: boundaries.length * 2 * 4 + matrix.length * 4 + controls.length * 4, countMeaning: "case/form x variant combinations; each checks match and full output, plus baseline assertions; not total assert invocations", n27: { content: "Guest wifi password：hunter2 is taped under the desk for visitors.", expected: semantic } },
  limitations: [
    "F21 inventory: frozen120, matching policyCorpus, core safety static/resolved-local/each-table inputs, five actual small differential generators, benchmark literals plus 80-line semantic/25K-log/8K-context pure builders. Added F21 overlay/static URI test inputs and base Korean Markdown lines/paragraphs.",
    "Not a complete integration execution trace. Unresolved calls are listed; dynamic template substitutions/flatMap-expanded cases and multi-MiB stress recipes are not enumerated. Other integration files, raw datasets/experiment JSON and arbitrary source strings are outside the defined F21+Markdown inventory, not inferred to be classifier inputs.",
    "Historical N17 JSON is read only for its13 boundary labels, never included as corpus input. Predesign Markdown is self-referential; a separate summary excludes inputs whose only provenance is that document. Other policy docs also contain synthetic technical examples. Zero transitions do not establish real-world absence of over-protection.",
    "Only the four specified K1/K6 candidates are surveyed. K7/K8 inclusion, alternative api boundary and N27 expansion need extra survey before implementation if selected. Independent boundary decision outcomes are in the plan; no performance timings collected.",
    "Overlay models insertion into tuple0 for this fixed source; future production integration and resource behavior still require differential regression tests. Source/dist hashes prevent silently surveying a different product build.",
  ],
};
const args = process.argv.slice(2); assert.equal(args.length, 2); assert.equal(args[0], "--out");
writeFileSync(resolve(root, args[1]), JSON.stringify(output, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ sourceRows: records.length, uniqueInputs: rows.length, changedRows: changedRows.length, summary: output.summary, syntheticCaseVariantChecks: output.synthetic.syntheticCaseVariantChecks, coverage: { tracked: tree.length, text: coverageScan.scannedUtf8, excluded: coverageScan.excluded.length, hits: coverageScan.nonMarkdownHits } }));

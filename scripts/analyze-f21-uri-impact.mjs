import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import Module from "node:module";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

const root = process.cwd();
const require = createRequire(import.meta.url);
const ts = require("typescript");
const moduleWithNodePaths = Module;
const unresolvedSites = [];
const extraSourceFiles = new Set();

const paths = {
  policy: "src/core/policy.ts",
  corpus: "tests/helpers/policy-corpus.ts",
  characterization: "tests/fixtures/policy/characterization.json",
  benchmark: "benchmarks/run.ts",
  coreTest: "tests/core.test.ts",
};

const KNOWN_SCHEMES = [
  "http", "https", "ftp", "ftps", "file", "mailto", "data", "urn", "tel",
  "sms", "ssh", "sftp", "postgres", "postgresql", "mysql", "mongodb", "redis",
  "sqlite",
];

const candidateDefinitions = {
  disabled: "tuple index 3 replaced with false predicate",
  a: "original eligible scheme run followed by ://",
  b: "original eligible scheme run followed by : and a defined non-whitespace JS \\s suffix character",
  c: "any eligible scheme:// OR case-insensitive explicit known scheme followed by colon; known suffix may be empty or whitespace",
  bE3: "tuple3 uses b; tuple0 preserves original predicate OR credential-label scanner, ASCII boundaries/case, space/tab between words, JS whitespace before : or =",
};

const E3_LABELS = [
  ["passwd"], ["pwd"], ["passphrase"], ["pass"], ["credential"],
  ["credentials"], ["private", "key"], ["secret", "key"], ["access", "key"],
  ["api", "key"], ["client", "secret"], ["recovery", "code"], ["secret", "answer"],
];
const E3_REVIEW_LABELS = E3_LABELS.map((tokens) => tokens.join(" "));
const E3_EXACT_REVIEW_CASES = [
  ["passwd", "passwd: hunter2"],
  ["pwd", "pwd: hunter2"],
  ["passphrase", "Passphrase: correct horse battery staple"],
  ["credentials", "Credentials: admin / hunter2"],
  ["pass", "Login: alice, Pass: hunter2"],
  ["private key", "Private key: MIIEvQIBADANB"],
  ["secret answer", "Secret answer: fluffy"],
  ["recovery code", "Recovery code: alpha bravo charlie"],
  ["access key", "access key: AKIAABCDEFGH"],
  ["api key", "API key: sk-live-abc"],
];

function isAsciiWord(code) {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) ||
    (code >= 48 && code <= 57) || code === 95;
}

function isAsciiLetter(code) {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function asciiEqualIgnoreCase(content, offset, text) {
  if (offset + text.length > content.length) return false;
  for (let index = 0; index < text.length; index += 1) {
    const actual = content.charCodeAt(offset + index);
    const expected = text.charCodeAt(index);
    const folded = actual >= 65 && actual <= 90 ? actual + 32 : actual;
    if (folded !== expected) return false;
  }
  return true;
}

function scanCredentialLabel(content) {
  for (let index = 0; index < content.length; index += 1) {
    if (!isAsciiLetter(content.charCodeAt(index)) ||
        (index > 0 && isAsciiWord(content.charCodeAt(index - 1)))) continue;
    for (const tokens of E3_LABELS) {
      let cursor = index;
      let matched = true;
      for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
        const token = tokens[tokenIndex];
        if (!asciiEqualIgnoreCase(content, cursor, token)) {
          matched = false;
          break;
        }
        cursor += token.length;
        if (tokenIndex < tokens.length - 1) {
          const separatorStart = cursor;
          while (content[cursor] === " " || content[cursor] === "\t") cursor += 1;
          if (cursor === separatorStart) {
            matched = false;
            break;
          }
        }
      }
      if (!matched || (cursor < content.length && isAsciiWord(content.charCodeAt(cursor)))) continue;
      while (cursor < content.length && /\s/u.test(content[cursor])) cursor += 1;
      if (content[cursor] === ":" || content[cursor] === "=") return true;
    }
  }
  return false;
}

const E3_REGEX_ORACLE = /\b(?:passwd|pwd|passphrase|pass|credentials?|(?:private|secret|access|api)[ \t]+key|client[ \t]+secret|recovery[ \t]+code|secret[ \t]+answer)\b\s*[:=]/i;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readText(path) {
  return readFile(resolve(root, path), "utf8");
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

async function loadPolicy() {
  const source = await readText(paths.policy);
  return {
    sourceHash: sha256(source),
    sourceLfHash: sha256(source.replaceAll("\r\n", "\n")),
    internals: compileModule(
      source,
      resolve(root, paths.policy),
      "export { EXACT_PATTERNS, classifyContext as originalclassify };",
    ),
  };
}

async function loadCorpus() {
  const source = await readText(paths.corpus);
  return {
    sourceHash: sha256(source),
    sourceLfHash: sha256(source.replaceAll("\r\n", "\n")),
    corpus: compileModule(source, resolve(root, paths.corpus), "export { policyCorpus };").policyCorpus,
  };
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
  const source = require("node:fs").readFileSync(resolve(root, filePath), "utf8");
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
  const safety = sourceFile.statements.find(n=>ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.arguments[0]&&isStringNode(n.expression.arguments[0])&&n.expression.arguments[0].text === "safety policy");
  assert(safety, "core safety-policy describe missing");
  visit(safety);
  return { sourceHash: sha256(source), sourceLfHash: sha256(source.replaceAll("\r\n", "\n")), entries };
}

function collectBenchmarkSources() {
  const source = require("node:fs").readFileSync(resolve(root, paths.benchmark), "utf8");
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
  const prelude = require("node:fs").readFileSync(resolve(root,"src/core/token-estimator.ts"),"utf8");
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
    const source=require("node:fs").readFileSync(resolve(root,file),"utf8");
    const sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
    const node=sf.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
    assert(node, "generator not found: "+name);
    const globals=sf.statements.filter(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.every(d=>ts.isIdentifier(d.name)&&["whitespace","lineTerminators","starts","commands","codeKeywords"].includes(d.name.text))).map(n=>n.getText(sf)).join("\n");
    const module=compileModule("const policyCorpus="+JSON.stringify(corpus)+";\n"+globals+"\n"+node.getText(sf),resolve(root,file),"export { "+name+" };");
    const values=module[name]();assert(Array.isArray(values));
    return values.map((content,index)=>({group:"generated-test-inputs",id:name+":"+index,content,location:{file,...lineContext(sf,node),function:name,index}}));
  });
}

function hasOriginalBoundary(content, index) {
  const isWord = (code) => (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || code === 95;
  const at = (position) => position >= 0 && position < content.length && isWord(content.charCodeAt(position));
  return at(index - 1) !== at(index);
}

function scanScheme(content, predicate) {
  let eligibleStart = -1;
  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index);
    const schemeCode = (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || code === 43 || code === 45 || code === 46;
    if (schemeCode) {
      if (code >= 65 && code <= 90 || code >= 97 && code <= 122) {
        if (hasOriginalBoundary(content, index) && eligibleStart === -1) eligibleStart = index;
      }
      continue;
    }
    if (code === 58 && eligibleStart !== -1 && predicate(content.slice(eligibleStart, index), content[index + 1], content, index)) return true;
    eligibleStart = -1;
  }
  return false;
}

const predicates = {
  disabled: () => false,
  a: (_scheme, _suffix, content, colon) => content.slice(colon + 1, colon + 3) === "//",
  b: (_scheme, suffix) => suffix !== undefined && !/\s/u.test(suffix),
  c: (_scheme, _suffix, content, colon) => content.slice(colon + 1, colon + 3) === "//" || KNOWN_SCHEMES.some(scheme => {
    const start = colon - scheme.length;
    return start >= 0 && hasOriginalBoundary(content, start) && content.slice(start, colon).toLowerCase() === scheme;
  }),
};

function classifyWith(predicateName, label, policy, content) {
  const tuples = policy.internals.EXACT_PATTERNS;
  const originalUriTuple = tuples[3];
  const originalE3Tuple = tuples[0];
  if (predicateName === "bE3") {
    tuples[0] = ["secret", (value) => originalE3Tuple[1].test(value) || scanCredentialLabel(value)];
    tuples[3] = [label, (value) => scanScheme(value, predicates.b)];
  } else {
    tuples[3] = [label, predicateName === "original" ? originalUriTuple[1] : (value) => scanScheme(value, predicates[predicateName])];
  }
  try {
    return policy.internals.originalclassify(content);
  } finally {
    tuples[0] = originalE3Tuple;
    tuples[3] = originalUriTuple;
  }
}

function exactReasonBreakdown(policy, content) {
  const tuples = policy.internals.EXACT_PATTERNS;
  const matches = tuples.map(([reason, predicate], index) => ({ index, reason, matches: typeof predicate === "function" ? predicate(content) : predicate.test(content) }));
  return {
    uriTupleMatches: matches[3].matches,
    nonUriTupleMatches: matches.filter(({ index, matches: matched }) => index !== 3 && matched),
  };
}

function summarizeBaseline(policy, content, classification) {
  const breakdown = exactReasonBreakdown(policy, content);
  const otherReasons = classification.reasons.filter((reason) => !(reason === "secret" && breakdown.uriTupleMatches));
  let category = "not-uri-exact";
  if (breakdown.uriTupleMatches) category = otherReasons.length === 0 ? "uri-only-exact" : "other-exact-reason";
  if (breakdown.uriTupleMatches && breakdown.nonUriTupleMatches.some(({ reason }) => reason === "secret")) category = "same-secret-masking";
  return { category, uriTupleMatches: breakdown.uriTupleMatches, nonUriTupleMatches: breakdown.nonUriTupleMatches, otherReasons };
}

function compareClassification(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function analyzeRecord(policy, record) {
  const original = policy.internals.originalclassify(record.content);
  const baseline = summarizeBaseline(policy, record.content, original);
  const variants = {};
  for (const name of ["disabled", "a", "b", "c", "bE3"]) {
    variants[name] = {
      e1: classifyWith(name, "secret", policy, record.content),
      e2: classifyWith(name, "uri", policy, record.content),
    };
  }
  const uri = baseline.uriTupleMatches;
  const disabledExact = variants.disabled.e1.mode === "exact";
  baseline.category = !uri ? "not-uri-exact" : !disabledExact ? "uri-only-exact" : baseline.nonUriTupleMatches.some(r => r.reason === "secret") ? "same-secret-masking" : "other-exact-reason";
  const reference = {a: /\b[A-Za-z][A-Za-z0-9+.-]*:\/\//u, b: /\b[A-Za-z][A-Za-z0-9+.-]*:(?=\S)/u};
  for (const name of ["a", "b", "c"]) {
    const hit = scanScheme(record.content, predicates[name]);
    const expected = name === "c" ? reference.a.test(record.content) || KNOWN_SCHEMES.some(s => new RegExp("\\b" + s + ":", "i").test(record.content)) : reference[name].test(record.content);
    assert.equal(hit, expected, `candidate ${name} reference mismatch`);
    assert(!hit || uri, "candidate broadened original predicate");
    if (!uri) assert.deepEqual(variants[name].e1, original);
  }
  const e3RegexMatch = E3_REGEX_ORACLE.test(record.content);
  assert.equal(scanCredentialLabel(record.content), e3RegexMatch, "E3 scanner/reference mismatch");
  const changed = Object.fromEntries(Object.entries(variants).map(([name, result]) => [name, {
    e1: !compareClassification(original, result.e1),
    e2: !compareClassification(original, result.e2),
  }]));
  return { ...record, original, baseline, variants, changed };
}

function dedupeRecords(records) {
  const groups = new Map();
  for (const record of records) {
    const existing = groups.get(record.content) ?? { content: record.content, sources: [] };
    existing.sources.push({ group: record.group, id: record.id, location: record.location ?? null });
    groups.set(record.content, existing);
  }
  return [...groups.values()];
}

function countBy(items, key) {
  return Object.fromEntries([...new Set(items.map(key))].map((value) => [value, items.filter((item) => key(item) === value).length]));
}

function summarize(records) {
  const names = ["disabled", "a", "b", "c"];
  const summary = { records: records.length, baselineModes: countBy(records, (r) => r.original.mode), baselineUriCategories: countBy(records, (r) => r.baseline.category), variants: {} };
  for (const name of names) {
    summary.variants[name] = {
      e1Modes: countBy(records, (r) => r.variants[name].e1.mode),
      e2Modes: countBy(records, (r) => r.variants[name].e2.mode),
      e1Changed: records.filter((r) => r.changed[name].e1).length,
      e2Changed: records.filter((r) => r.changed[name].e2).length,
      modeChanged: records.filter(r => r.original.mode !== r.variants[name].e1.mode).length,
      toSemantic: records.filter(r => r.original.mode !== r.variants[name].e1.mode && r.variants[name].e1.mode === "semantic").length,
      toUnknown: records.filter(r => r.original.mode !== r.variants[name].e1.mode && r.variants[name].e1.mode === "unknown").length,
      toVisual: records.filter(r => r.original.mode !== r.variants[name].e1.mode && r.variants[name].e1.mode === "visual").length,
      retainedExactReasonChanges: records.filter(r => r.changed[name].e1 && r.variants[name].e1.mode === "exact").length,
      e2AdditionalLabelChanges: records.filter(r => !compareClassification(r.variants[name].e1,r.variants[name].e2)).length,
      e1UriOnlyToMode: countBy(records.filter((r) => r.baseline.category === "uri-only-exact" && r.original.mode !== r.variants[name].e1.mode), (r) => r.variants[name].e1.mode),
      e2UriOnlyToMode: countBy(records.filter((r) => r.baseline.category === "uri-only-exact" && r.original.mode !== r.variants[name].e2.mode), (r) => r.variants[name].e2.mode),
    };
  }
  const modeFor = (record, name) => name === "original" ? record.original.mode : record.variants[name].e1.mode;
  const transitions = (left, right) => countBy(records, (record) =>
    `${modeFor(record, left)}->${modeFor(record, right)}`);
  summary.variants.bE3 = {
    e1Modes: countBy(records, (r) => r.variants.bE3.e1.mode),
    e2Modes: countBy(records, (r) => r.variants.bE3.e2.mode),
    e1Changed: records.filter((r) => r.changed.bE3.e1).length,
    e2Changed: records.filter((r) => r.changed.bE3.e2).length,
    modeChanged: records.filter(r => r.original.mode !== r.variants.bE3.e1.mode).length,
    toSemantic: records.filter(r => r.original.mode !== r.variants.bE3.e1.mode && r.variants.bE3.e1.mode === "semantic").length,
    toUnknown: records.filter(r => r.original.mode !== r.variants.bE3.e1.mode && r.variants.bE3.e1.mode === "unknown").length,
    toVisual: records.filter(r => r.original.mode !== r.variants.bE3.e1.mode && r.variants.bE3.e1.mode === "visual").length,
    retainedExactReasonChanges: records.filter(r => r.changed.bE3.e1 && r.variants.bE3.e1.mode === "exact").length,
    e2AdditionalLabelChanges: records.filter(r => !compareClassification(r.variants.bE3.e1, r.variants.bE3.e2)).length,
    e1UriOnlyToMode: countBy(records.filter((r) => r.baseline.category === "uri-only-exact" && r.original.mode !== r.variants.bE3.e1.mode), (r) => r.variants.bE3.e1.mode),
    e2UriOnlyToMode: countBy(records.filter((r) => r.baseline.category === "uri-only-exact" && r.original.mode !== r.variants.bE3.e2.mode), (r) => r.variants.bE3.e2.mode),
    modeTransitionsVsCurrent: transitions("original", "bE3"),
    modeTransitionsVsB: transitions("b", "bE3"),
    uriMatchedRecords: records.filter((r) => r.baseline.uriTupleMatches).length,
    newlyChangedVsB: records.filter((r) => !r.changed.b.e1 && r.changed.bE3.e1).length,
    newlyChangedVsCurrent: records.filter((r) => r.changed.bE3.e1).length,
    newlyExactVsCurrent: records.filter((r) => r.variants.bE3.e1.mode === "exact" && r.original.mode !== "exact").length,
    newlyExactVsB: records.filter((r) => r.variants.bE3.e1.mode === "exact" && r.variants.b.e1.mode !== "exact").length,
  };
  return summary;
}

function syntheticRecords() {
  const cases = [
    ["note", "Note: preserve source text exactly before compression."],
    ["summary", "Summary: the team agreed to retain source evidence."],
    ["mailto", "mailto:ops@example.com"],
    ["data", "data:text/plain,hello"],
    ["urn", "urn:isbn:0451450523"],
    ["custom-opaque", "custom:value"],
    ["windows-backslash", "C:\\Users\\00\\file.txt"],
    ["windows-slash", "C:/Users/00/file.txt"],
    ["localhost-port", "localhost:8080"],
    ["key-value", "key:value"],
    ["time", "The meeting starts at 12:30."],
    ["ipv6", "http://[2001:db8::1]/"],
    ["unicode-whitespace", "mailto:\u00a0ops@example.com"],
    ["mailto-minimal", "mailto:a@b"],
    ["urn-without-number", "urn:example:animal"],
    ["bare-note", "Note:"],
    ["note-visual", "Note: diagram screenshot layout"],
    ["note-newline", "Note:\nThe team agreed to preserve the original meeting notes."],
    ["custom-hierarchical", "custom://host"],
    ["windows-bare-backslash", "C:\\"],
    ["windows-bare-slash", "C:/"],
    ["time-bare", "12:30"],
    ["ipv6-bare", "fe80::1"],
    ["ipv6-numeric-prefix", "2001:db8::1"],
    ["known-empty", "mailto:"],
    ["known-space", "mailto: a@b"],
    ["suffix-known", "x.mailto:payload"],
    ["non-boundary", "_mailto:x"],
    ["digit-prefix", "1mailto:x"],
    ["zero-width", "Note:\u200bx"],
    ["ascii-scheme-only", "ſsh:x"],
    ["unicode-line-separator", "Note:\u2028the team agreed to preserve the original notes."],
    ["unicode-feff", "Note:\ufeffthe team agreed to preserve the original notes."],
    ["same-secret", "api_key=secret Note: the team agreed to preserve meeting notes."],
  ];
  return cases.map(([id, content]) => ({ group: "synthetic-boundaries", id, content }));
}

function reviewProbeEvidence(policy) {
  const proseSuffix = " The team agreed to keep this note for the onboarding review and preserve the original context.";
  const probes = E3_EXACT_REVIEW_CASES.flatMap(([label, payload]) => [
    { label, form: "no-prose", content: payload },
    { label, form: "prose", content: `${payload}${proseSuffix}` },
  ]);
  const results = probes.map((probe, index) => {
    const regexMatch = E3_REGEX_ORACLE.test(probe.content);
    const scannerMatch = scanCredentialLabel(probe.content);
    assert.equal(scannerMatch, regexMatch, `review probe ${index} scanner/reference mismatch`);
    const original = policy.internals.originalclassify(probe.content);
    const bOnly = classifyWith("b", "secret", policy, probe.content);
    const classification = classifyWith("bE3", "secret", policy, probe.content);
    assert.equal(classification.mode, "exact", `review probe ${index} must be exact`);
    assert.deepEqual(classification.reasons, ["secret"], `review probe ${index} reason mismatch`);
    return { ...probe, regexMatch, scannerMatch, original, bOnly, classification };
  });
  const controls = [
    { id: "wifi-limitation", content: "Wifi: hunter2", expectedScannerMatch: false },
    { id: "wifi-control-with-prose", content: "The note says Wifi: hunter2, not a credential label.", expectedScannerMatch: false },
    ...["compass:", "_passwd:", "passwdSuffix:", "Note:", "Summary:", "private\nkey:", "paſs:"].map(content=>({id:content,content,expectedScannerMatch:false})),
    ...["secret key:", "client secret:", "credential:", "PASSWD:", "private\tkey:", "pwd\u2028=", "secret answer\ufeff:"].map(content=>({id:content,content,expectedScannerMatch:true})),
  ].map((probe) => {
    const scannerMatch = scanCredentialLabel(probe.content);
    assert.equal(scannerMatch, probe.expectedScannerMatch, `${probe.id} scanner result mismatch`);
    assert.equal(scannerMatch,E3_REGEX_ORACLE.test(probe.content));
    return { ...probe, scannerMatch, regexMatch: E3_REGEX_ORACLE.test(probe.content), original:policy.internals.originalclassify(probe.content),bOnly:classifyWith("b","secret",policy,probe.content),classification:classifyWith("bE3","secret",policy,probe.content) };
  });
  const newExactExamples = [
    "API KEY =",
    "credentials =",
    "passwd = hunter",
    "secret answer = fluffy",
  ].map((content) => {
    const original = policy.internals.originalclassify(content);
    const bOnly = classifyWith("b", "secret", policy, content);
    const classification = classifyWith("bE3", "secret", policy, content);
    assert.equal(classification.mode, "exact", `new exact example must be exact: ${content}`);
    assert.notEqual(original.mode, "exact", `new exact example was already exact: ${content}`);
    assert.notEqual(bOnly.mode, "exact", `new exact example was already exact under b: ${content}`);
    return { content, scannerMatch: scanCredentialLabel(content), original, bOnly, classification };
  });
  return {
    exactSecretProbeCount: results.length,
    labels: E3_EXACT_REVIEW_CASES.map(([label]) => label),
    fixedScannerLabels: E3_REVIEW_LABELS,
    proseSuffix,
    probes: results,
    controls,
    newExactExamples,
    uniqueContentCount: new Set(results.map((probe) => probe.content)).size,
    originalModeCounts: countBy(results, (probe) => probe.original.mode),
    bOnlyModeCounts: countBy(results, (probe) => probe.bOnly.mode),
    bE3ModeCounts: countBy(results, (probe) => probe.classification.mode),
    newlyExactVsCurrent: results.filter((probe) => probe.original.mode !== "exact" && probe.classification.mode === "exact").length,
    newlyExactVsB: results.filter((probe) => probe.bOnly.mode !== "exact" && probe.classification.mode === "exact").length,
    denominator: "separate from repo inventory and summary counts",
  };
}

function measureE3ScannerPrototype(policy) {
  const recipes = [
    ["boundary-near-misses", n=>"xpasswd ! ".repeat(Math.ceil(n/10)).slice(0,n), false],
    ["repeated-valid-start-misses", n=>"passwd ! private key ! ".repeat(Math.ceil(n/22)).slice(0,n), false],
    ["internal-gap-miss", n=>"private"+" ".repeat(n-8)+"!", false],
    ["trailing-gap-miss", n=>"passwd"+" ".repeat(n-7)+"!", false],
    ["old-label-gap-miss", n=>"password"+" ".repeat(n-9)+"!", false],
    ["internal-gap-hit", n=>"private"+" ".repeat(n-11)+"key:", true],
    ["late-label-hit", n=>"x".repeat(n-8)+" passwd:", true],
  ];
  const result=[];
  for(const [recipe,build,expected] of recipes) for(const mib of [1,5,10]) {
    const content=build(mib*1024*1024);
    assert.equal(content.length,mib*1024*1024);
    const timings={};
    const original=policy.internals.EXACT_PATTERNS[0][1];
    for(const [name,fn] of [["scannerOnly",scanCredentialLabel],["combinedTuple0",value=>original.test(value)||scanCredentialLabel(value)]]) {
      fn("private key: warmup");
      const samplesMs=[];
      for(let i=0;i<5;i++) {
        const started=performance.now();
        const actual=fn(content);
        samplesMs.push(performance.now()-started);
        assert.equal(actual,expected,recipe+" "+name);
      }
      const medianMs=[...samplesMs].sort((a,b)=>a-b)[2];
      timings[name]={result:expected,samplesMs,medianMs,error:null};
    }
    result.push({recipe,sizeMiB:mib,inputCodeUnits:content.length,...timings});
  }
  return result;
}

async function main() {
  const policy = await loadPolicy();
  const corpusSource = await loadCorpus();
  const characterizationText = await readText(paths.characterization);
  const characterization = JSON.parse(characterizationText);
  if (characterization.entries.length !== 120) throw new Error("characterization fixture must contain exactly 120 entries");
  const baselineMatch = characterization.entries.every((entry) => {
    const actual = policy.internals.originalclassify(entry.content);
    return JSON.stringify(actual) === JSON.stringify(entry.classification) && policy.internals.lossyCompressionAllowed(actual) === entry.lossyCompressionAllowed;
  });
  if (!baselineMatch) throw new Error("frozen characterization baseline mismatch");
  if (corpusSource.corpus.length !== 120) throw new Error(`policy corpus expected 120 entries, got ${corpusSource.corpus.length}`);
  const corpusMatch = characterization.entries.every((entry, index) => entry.id === corpusSource.corpus[index].id && entry.content === corpusSource.corpus[index].content);
  if (!corpusMatch) throw new Error("policy corpus does not match characterization input ordering");

  const characterizationRecords = characterization.entries.map((entry, index) => ({ group: "characterization", id: entry.id, content: entry.content, location: { file: paths.characterization, entry: index + 1 } }));
  const corpusRecords = corpusSource.corpus.map((entry, index) => ({ group: "policyCorpus", id: entry.id, content: entry.content, location: { file: paths.corpus, entry: index + 1 } }));
  const benchmark = collectBenchmarkSources();
  const benchmarkRecords = benchmark.entries.map((entry) => ({ group: "benchmark-fixtures", id: entry.name ?? `source-line-${entry.line}`, content: entry.content, location: { file: paths.benchmark, line: entry.line, column: entry.column, context: entry.context } }));
  const testLiterals = collectClassifierLiterals(paths.coreTest);
  const testRecords = testLiterals.entries.map((entry, index) => ({ group: "existing-test-input-literals", id: `${entry.context}#${index + 1}`, content: entry.content, location: { file: paths.coreTest, line: entry.line, column: entry.column, context: entry.context } }));
  const generatedRecords = collectGeneratedInputs(corpusSource.corpus);
  const repoRecords = [...characterizationRecords, ...corpusRecords, ...benchmarkRecords, ...testRecords, ...generatedRecords];
  const uniqueRepo = dedupeRecords(repoRecords);
  const analyzedRepo = uniqueRepo.map((record) => analyzeRecord(policy, record));
  const analyzedSynthetic = syntheticRecords().map((record) => ({ ...analyzeRecord(policy, record), sources: [{ group: record.group, id: record.id, location: null }] }));
  const review = reviewProbeEvidence(policy);
  const performance = measureE3ScannerPrototype(policy);
  const sourceFiles = [paths.policy, paths.corpus, paths.characterization, paths.benchmark, paths.coreTest, "tests/helpers/policy-baseline.ts", ...extraSourceFiles];
  const sourceFileHashes = {};
  for (const file of sourceFiles) {
    const content = await readText(file);
    sourceFileHashes[file] = { sha256: sha256(content), sha256Lf: sha256(content.replaceAll("\r\n", "\n")) };
  }
  const scriptPath = relative(root, fileURLToPath(import.meta.url)).replaceAll("\\", "/");
  const scriptText = await readText(scriptPath);
  const output = {
    schema: "f21-uri-impact-survey/v1",
    generatedAt: new Date().toISOString(),
    scope: { planningOnly: true, sourceEdits: [], testEdits: [], oracleEdits: [], existingEvidenceEdits: [], benchmarksRun: false, testGatesRun: false, externalCalls: false },
    reproducibility: { script: scriptPath, scriptSha256: sha256(scriptText), sourceFileHashes, baselineFrozen120Match: true, policyCorpus120Match: true, forbiddenChanges: "none" },
    policy: { exactTupleIndex: 3, originalTupleReason: "secret", candidates: candidateDefinitions, knownSchemes: KNOWN_SCHEMES, boundary: "original ASCII word-boundary logic; eligible starts are ASCII letters at an ASCII word-boundary, and scheme run permits ASCII letters/digits/+/-/." },
    inventory: { sourceCounts: countBy(repoRecords, (r) => r.group), repoRecordCount: repoRecords.length, repoUniqueContentCount: uniqueRepo.length, syntheticRecordCount: analyzedSynthetic.length, repoGroups: ["characterization", "policyCorpus", "benchmark-fixtures", "existing-test-input-literals"], deduplication: "content exact equality across all repository source groups" },
    repo: { summary: summarize(analyzedRepo), bE3NonUriChangedRows: analyzedRepo.filter(r=>!r.baseline.uriTupleMatches && (r.changed.bE3.e1 || r.changed.bE3.e2)), fullClassificationsForUriMatches: analyzedRepo.filter(r=>r.baseline.uriTupleMatches), unchangedNonUriDigest: sha256(JSON.stringify(analyzedRepo.filter(r=>!r.baseline.uriTupleMatches).map(r=>({content:r.content,sources:r.sources,original:r.original})))) },
    synthetic: { summary: summarize(analyzedSynthetic), cases: analyzedSynthetic },
    review,
    performance: { scanner: "scanCredentialLabel", combined: "original tuple0.test(content) OR scanCredentialLabel(content)", prototypeOnly: true, productionPerformanceClaim: false, inputs: performance },
    coverageLimitations: [
      "Core test inventory is restricted to the safety-policy describe: direct/resolved local string inputs and each-table rows. Unresolved dynamic sites are listed; this is not an execution trace of all integration tests.",
      "All five checked-in small differential input generators are evaluated as extracted pure functions, without running test module bodies. Multi-megabyte stress recipes are reserved for unchanged regression gates.",
      "Benchmark includes named source literals, actual repeated semantic documents and pure 25K log/8K code-context builders. No retrieval or latency benchmark is run.",
      "Counts describe repository evidence and synthetic boundary cases separately; they do not establish all real-world URI safety or policy impact.",
      "The exact 20 credential probes, Wifi limitation/control, and new-exact examples are review probes kept outside the repository denominator.",
      "The exact probe prose suffix is a classification fixture; the survey makes no byte-identity claim about prose.",
      "The 1/5/10 MiB measurements exercise the in-memory planning scanner and combined tuple0 predicate on matching/missing inputs and long whitespace gaps; they are not production performance evidence or a general input-safety guarantee.",
    ],
    recommendationInputs: { e1: "Candidate c is the conservative explicit-allowlist option; candidate a is narrowest syntax; candidate b preserves opaque non-whitespace schemes but retains arbitrary key:value false positives.", e2: "Labeling URI matches as uri separates the reason from secret, but is a public reasons-output change and must be decided separately." },
  };
  const outputDir = resolve(root, "docs/research/evidence/f21");
  await mkdir(outputDir, { recursive: true });
  const timestamp = output.generatedAt.replace(/[:.]/gu, "-");
  const outputPath = join(outputDir, `${timestamp}.json`);
  output.reproducibility.scriptSource = scriptText;
  output.reproducibility.base = "5559330";
  output.reproducibility.runtime = { node: process.version, typescript: ts.version };
  output.inventory.unresolvedStaticSites = unresolvedSites;
  output.inventory.repoGroups.push("generated-test-inputs");
  output.repo.groupSummaries = Object.fromEntries([...new Set(repoRecords.map(r=>r.group))].map(g=>[g,summarize(analyzedRepo.filter(r=>r.sources.some(s=>s.group===g)))]));
  const byContent = new Map(analyzedRepo.map(r=>[r.content,r]));
  output.repo.sourceRecordSummaries = Object.fromEntries([...new Set(repoRecords.map(r=>r.group))].map(g=>[g,summarize(repoRecords.filter(r=>r.group===g).map(r=>byContent.get(r.content)))]));
  output.inventory.groupCountUnits = "groupSummaries uses unique content per group; sourceRecordSummaries retains duplicate source rows (including all120 characterization entries). Global repository summary deduplicates all groups.";
  const forbiddenDiff = execFileSync("git",["diff","HEAD","--name-only","--","src","tests","package.json","package-lock.json","research","paper","codex_review","docs/research/evidence/task-25","docs/research/evidence/n01"],{cwd:root,encoding:"utf8",windowsHide:true}).trim();
  assert.equal(forbiddenDiff,"","forbidden tracked edits detected");
  output.reproducibility.forbiddenChanges = "verified empty git diff against HEAD for source/tests/packages/research/paper/review and historical Task25/N01 evidence";
  // One complete row per line keeps the full raw classifications reviewable without huge indentation overhead.
  const rowKey = "__F21_URI_ROWS__";
  const uriRows = output.repo.fullClassificationsForUriMatches;
  output.repo.fullClassificationsForUriMatches = rowKey;
  const serialized = JSON.stringify(output, null, 2).replace(JSON.stringify(rowKey), "[\n" + uriRows.map(row=>JSON.stringify(row)).join(",\n") + "\n]");
  await writeFile(outputPath, serialized + "\n", {encoding:"utf8",flag:"wx"});
  console.log(JSON.stringify({ outputPath: relative(root, outputPath), repoUniqueContentCount: uniqueRepo.length, characterization120: true, policyCorpus120: true, sourceGroups: output.inventory.sourceCounts }, null, 2));
}

await main();

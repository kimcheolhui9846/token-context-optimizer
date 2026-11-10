import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const [, , command, snapshotRootArg, fixtureRootArg, kind, budgetArg] = process.argv;

function inside(child, parent) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function assertSnapshotImport(snapshotRoot, file) {
  const resolved = resolve(snapshotRoot, file);
  if (!inside(resolved, snapshotRoot)) throw new Error(`resolved path escapes snapshot: ${resolved}`);
  return pathToFileURL(resolved).href;
}

async function loadSnapshot(snapshotRoot) {
  const artifacts = await import(assertSnapshotImport(snapshotRoot, "dist/src/core/artifacts.js"));
  const estimator = await import(assertSnapshotImport(snapshotRoot, "dist/src/core/token-estimator.js"));
  const policy = await import(assertSnapshotImport(snapshotRoot, "dist/src/core/policy.js"));
  const benchmark = await import(assertSnapshotImport(snapshotRoot, "dist/benchmarks/run.js"));
  const source = await readFile(resolve(snapshotRoot, "src/core/artifacts.ts"), "utf8");
  const cap = source.includes('const candidateLines = artifact.sourceMap.slice(0, 6);') ? 6 : Infinity;
  if (cap === Infinity && !source.includes('const candidateLines = artifact.sourceMap;')) throw new Error('unknown candidate selection source');
  return { ...artifacts, ...estimator, ...policy, ...benchmark, summaryPrefixCap: cap };
}

function normalizeMap(sourceMap, fixtureRoot) {
  if (!sourceMap) return null;
  return { ...sourceMap, path: relative(resolve(fixtureRoot), resolve(sourceMap.path)).replaceAll("\\", "/") };
}

async function putFixture(fixtureRoot, name, content) {
  await mkdir(fixtureRoot, { recursive: true });
  const path = join(fixtureRoot, name);
  await writeFile(path, content, "utf8");
  return path;
}

const semanticFixtures = [
  { name: "semantic success phrase", source: "Token efficiency depends on measured task success and careful source preservation.", requiredPhrases: ["Token efficiency depends on measured task success"] },
  { name: "spelled-out threshold phrase preservation", source: "Reviewers approve launch only when latency stays below one thousand milliseconds.", requiredPhrases: ["latency", "below one thousand milliseconds"] },
  { name: "negation preservation", source: "Operators must not delete source excerpts during cleanup.", requiredPhrases: ["must not delete source excerpts"] },
  { name: "actor action preservation", source: "The shift captain updates the readiness notes before opening hour.", requiredPhrases: ["shift captain updates the readiness notes"] },
];

function classificationFor(content, policy) {
  return policy.classifyContext(content);
}

function completePrefix(sourceMap, selectedLineCount) {
  return sourceMap.slice(0, selectedLineCount).map((line) => line.text).join("\n");
}

function derivedLoopCounters(sourceMap, selectedLineCount, classification, fallbackReason, cap) {
  if (classification.mode !== 'semantic') return { derivedEstimateCalls: 0, derivedPrefixUTF16Scanned: 0, derivedFinalEstimateCalls: 0 };
  const candidateCount = Math.min(sourceMap.length, cap);
  const calls = selectedLineCount + (selectedLineCount < candidateCount ? 1 : 0);
  let prefixLength = 0;
  let scanned = 0;
  for (let index = 0; index < calls; index++) {
    prefixLength += sourceMap[index].text.length + (index > 0 ? 1 : 0);
    scanned += prefixLength;
  }
  return { derivedEstimateCalls: calls, derivedPrefixUTF16Scanned: scanned, derivedFinalEstimateCalls: fallbackReason === null ? 1 : 0 };
}

async function summarizeOne(mods, fixtureRoot, file, budget, fixture = null, artifact = null, store = null) {
  store ??= new mods.MemoryArtifactStore();
  artifact ??= await mods.indexArtifact({ path: file, store, allowedRoots: [resolve(fixtureRoot)] });
  assert.equal(artifact.lineCount, artifact.sourceMap.length);
  const classification = classificationFor(artifact.content, mods);
  const fullEstimate = mods.estimateTextTokens(artifact.content);
  const started = performance.now();
  const summary = mods.summarizeArtifact({ artifactId: artifact.artifactId, maxTokens: budget, store });
  const summarizeMs = performance.now() - started;
  const selectedLineCount = summary.sourceMap ? summary.sourceMap.endLine - summary.sourceMap.startLine + 1 : 0;
  const normalizedMap = normalizeMap(summary.sourceMap, fixtureRoot);
  const meaningGate = fixture ? mods.semanticSummaryPassesMeaningGate(summary, fixture) : null;
  const counters = derivedLoopCounters(artifact.sourceMap, selectedLineCount, classification, summary.fallbackReason, mods.summaryPrefixCap);
  if (summary.summary !== completePrefix(artifact.sourceMap, selectedLineCount)) throw new Error(`summary prefix invariant failed for ${basename(file)}`);
  if (summary.estimatedTokens > budget && !summary.fallbackReason) throw new Error(`budget invariant failed for ${basename(file)}`);
  return {
    inputSha256: artifact.sha256,
    inputLines: artifact.lineCount,
    selectedLineCount,
    sourceMap: normalizedMap,
    estimatedTokens: summary.estimatedTokens,
    fullEstimate,
    fallbackReason: summary.fallbackReason,
    warnings: summary.warnings,
    summary: summary.summary,
    meaningGate,
    budget,
    classification,
    summarizeMs,
    ...counters,
  };
}

function characterizationCases() {
  const late = [
    "The archive stores ordinary notes for the planning group.",
    "Members review the notes during a quiet morning meeting.",
    "The team records decisions in a shared paper journal.",
    "Everyone can suggest a correction before the meeting ends.",
    "The coordinator reads the older entries aloud to the group.",
    "Participants discuss the wording and agree on a clear version.",
    "The required observation is that the blue lantern remains beside the window.",
    "The group leaves the room after the conversation is complete.",
  ];
  const mixed = [
    "The garden committee reviews ordinary plans during a calm afternoon.",
    "Several members bring notes and share them around the table.",
    "The group discusses the path near the old stone fountain.",
    "A volunteer reads the latest observations to everyone present.",
    "The committee compares suggestions before choosing a direction.",
    "People leave room for questions and thoughtful revisions.",
    "The report says the silver bell remains beneath the cedar tree. Other observations describe the path and the morning light.",
  ];
  return [
    ["late8lines", late.join("\n"), ["blue lantern remains beside the window"]],
    ["mixed7", mixed.join("\n"), ["silver bell remains beneath the cedar tree"]],
  ];
}

async function runMatrix(snapshotRoot, fixtureRoot) {
  const mods = await loadSnapshot(snapshotRoot);
  const cases = [];
  const add = async (id, content, budget, fixture = null) => {
    const file = await putFixture(fixtureRoot, `${id}.txt`, content);
    const result = await summarizeOne(mods, fixtureRoot, file, budget, fixture);
    const { summarizeMs, ...stableResult } = result;
    cases.push({ id, ...stableResult });
    return result;
  };
  for (const [id, content, phrases] of characterizationCases()) {
    const fixture = { name: id, source: content, requiredPhrases: phrases };
    await add(id, content, 120, fixture);
    const full = mods.estimateTextTokens(content.replace(/\r\n|\r/g, "\n"));
    await add(`${id}-full`, content, full, fixture);
  }
  const semanticSourceFixtures = mods.buildSemanticDegradationFixtures();
  if (semanticSourceFixtures.length !== 4 || semanticSourceFixtures.some((f, i) => f.source !== semanticFixtures[i].source)) throw new Error("semantic fixture provenance mismatch");
  for (const fixture of semanticSourceFixtures) {
    await add(`semantic-${fixture.name.replaceAll(/[^a-z0-9]+/gi, "-")}`, fixture.source, 120, fixture);
    await add(`semantic-${fixture.name.replaceAll(/[^a-z0-9]+/gi, "-")}-80`, Array(80).fill(fixture.source).join("\n"), 120, fixture);
  }
  await add("empty", "", 120);
  await add("twelve-blank", Array(12).fill("").join("\n"), 120);
  await add("twenty-short", Array(20).fill("a").join("\n"), 120);
  await add("semantic-20-blank", `${semanticFixtures[0].source}\n${Array(20).fill("").join("\n")}`, 120, semanticFixtures[0]);
  await add("semantic-20-short", `${semanticFixtures[0].source}\n${Array(20).fill("a").join("\n")}`, 120, semanticFixtures[0]);
  await add("too-long-budget10", "This ordinary prose sentence is intentionally longer than the tiny budget.", 10);
  await add("korean-natural", "팀은 검토 결과를 기록하고 다음 작업의 근거를 보존합니다.", 120);
  await add("mixed-crlf-cr", `Ordinary prose remains clear.\r\nAnother ordinary line.${String.fromCharCode(13)}Final line.\nLast line.`, 120);
  const proseLines = [
    'The team reviews these ordinary notes.',
    'Every member reads the next sentence.',
    'The group keeps a clear record.',
    'These notes describe a quiet morning.',
    'Each person can suggest another revision.',
    'The discussion ends with shared understanding.',
    'The blue lantern remains beside the window.',
  ];
  await add('mixed-delimiters-semantic', proseLines.map((line, index) => line + (index === proseLines.length - 1 ? '' : ['\r\n', '\r', '\n'][index % 3])).join(''), 120, { name: 'mixed delimiters', source: proseLines.join('\n'), requiredPhrases: ['blue lantern remains beside the window'] });
  await add('short-prose-semantic', Array(30).fill('We all like warm tea.').join('\n'), 120);
  await add("policy-blocked", "The deployment command uses npm test and numeric code 42.", 120);

  const monotonicity = [];
  const seeded = ["", " ", "\t", "alpha", "검토 기록", "かなカナ", "🙂🙂", "ordinary prose."];
  let state = 0x9e3779b9;
  for (let i = 0; i < 128; i++) {
    const lines = [];
    for (let j = 0; j < (i % 9) + 1; j++) {
      state = (state * 1664525 + 1013904223) >>> 0;
      lines.push(seeded[state % seeded.length]);
    }
    let previous = 0;
    for (let j = 0; j <= lines.length; j++) {
      const estimate = mods.estimateTextTokens(lines.slice(0, j).join("\n"));
      if (!Number.isFinite(estimate) || estimate < previous) throw new Error(`seeded estimator monotonicity failed at ${i}:${j}`);
      previous = estimate;
    }
    monotonicity.push(previous);
  }
  const fixedInputs = ["", " ", "\t", "검토 기록", "かなカナ", "🙂🙂", "\uD800", "\uDC00", "a\r\nb", "a\rb"];
  for (const [index, input] of fixedInputs.entries()) {
    let previous = 0;
    for (let length = 0; length <= 2; length++) {
      const estimate = mods.estimateTextTokens(Array(length).fill(input.replace(/\r\n|\r/g, '\n')).join('\n'));
      if (estimate < previous) throw new Error(`fixed estimator monotonicity failed at ${index}`);
      previous = estimate;
    }
  }
  const sourceMapsContiguous = cases.every((entry) => !entry.sourceMap || (entry.sourceMap.startLine === 1 && entry.sourceMap.endLine === entry.selectedLineCount && entry.selectedLineCount <= entry.inputLines));
  return { snapshotRoot: basename(resolve(snapshotRoot)), fixtureRoot: basename(resolve(fixtureRoot)), caseCount: cases.length, cases, seededMonotonicity: { count: monotonicity.length, fixedCount: fixedInputs.length, finalEstimates: monotonicity.slice(-4) }, invariants: { pathConsistency: cases.every((entry) => !entry.sourceMap || !entry.sourceMap.path.includes("..")), summariesArePrefixes: true, sourceMapsContiguous } };
}

async function runDiagnostic(snapshotRoot, fixtureRoot, inputKind, budget) {
  const mods = await loadSnapshot(snapshotRoot);
  if (!["blank", "short", "semantic-blank", "semantic-short", "prose-short"].includes(inputKind)) throw new Error(`invalid diagnostic kind: ${inputKind}`);
  if (!Number.isInteger(budget) || budget < 0) throw new Error(`invalid budget: ${budget}`);
  const content = inputKind === 'blank' ? '' : inputKind === 'short' ? 'a' : semanticFixtures[0].source;
  const lines = inputKind === 'prose-short' ? Array(100000).fill('We all like warm tea.') : inputKind.endsWith('blank') ? [content, ...Array(100000).fill('')] : [content, ...Array(99999).fill('a')];
  const file = await putFixture(fixtureRoot, `diagnostic-${inputKind}.txt`, lines.join("\n"));
  const store = new mods.MemoryArtifactStore();
  const indexStart = performance.now();
  const artifact = await mods.indexArtifact({ path: file, store, allowedRoots: [resolve(fixtureRoot)] });
  const indexMs = performance.now() - indexStart;
  const classification = classificationFor(artifact.content, mods);
  assert.equal(classification.mode, ['semantic-blank', 'prose-short'].includes(inputKind) ? 'semantic' : 'unknown', 'diagnostic policy coverage changed');
  process.stdout.write(`${JSON.stringify({ type: "index-ready", classification, indexMs, hash: artifact.sha256, generatedLines: lines.length, lineCount: artifact.lineCount })}\n`);
  const result = await summarizeOne(mods, fixtureRoot, file, budget, inputKind.startsWith("semantic") ? semanticFixtures[0] : null, artifact, store);
  process.stdout.write(`${JSON.stringify({ type: "result", ...result })}\n`);
}

try {
  if (!snapshotRootArg || !fixtureRootArg) throw new Error("usage: worker.mjs matrix <snapshotRoot> <fixtureRoot> | diagnostic <snapshotRoot> <fixtureRoot> <kind> <budget>");
  if (command === "matrix") process.stdout.write(`${JSON.stringify(await runMatrix(resolve(snapshotRootArg), resolve(fixtureRootArg)))}\n`);
  else if (command === "diagnostic") await runDiagnostic(resolve(snapshotRootArg), resolve(fixtureRootArg), kind, Number(budgetArg));
  else throw new Error(`unknown command: ${command}`);
} catch (error) {
  console.error(error?.stack || error);
  process.exitCode = 1;
}

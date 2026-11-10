import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const base = 'e906015a4be6bac2904d4ee83b52ae36ab0f2e59';
const args = new Map(process.argv.slice(2).filter((x) => x.startsWith('--')).map((x) => { const [k, ...v] = x.slice(2).split('='); return [k, v.join('=') || 'true']; }));
const output = resolve(args.get('output') || join(root, 'research/results/6-4b-5-store-candidates.json'));
assert.equal(dirname(output), join(root, 'research/results'));
assert(/^6-4b-5-[\w-]+\.json$/.test(basename(output)));
const fixed = Number(args.get('fixed') || 4096); const k = Number(args.get('k'));
if (!args.has('check-only') && (!Number.isSafeInteger(k) || k < 0)) throw new Error('--k=<integer> is required');
if (!Number.isSafeInteger(fixed) || fixed < 0) throw new Error('--fixed must be a non-negative safe integer');
if (existsSync(output) && !args.has('check-only')) throw new Error(`refusing to overwrite existing output: ${output}`);
const sha = (value) => createHash('sha256').update(value).digest('hex');
function git(args) { const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 32000000 }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); }
const npmCli = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
function run(command, commandArgs, cwd, env, timeout = 600000) {
  return new Promise((done) => { const child = spawn(command, commandArgs, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let stdout = '', stderr = ''; let timedOut = false;
    child.stdout.on('data', (x) => { stdout += x; }); child.stderr.on('data', (x) => { stderr += x; }); const timer = setTimeout(() => { timedOut = true; if (child.pid) spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); else child.kill(); }, timeout);
    child.on('close', (status, signal) => { clearTimeout(timer); done({ command: [command, ...commandArgs].join(' '), status, signal, timedOut, stdout, stderr, logSha256: sha(`${stdout}\n${stderr}`) }); });
    child.on('error', (error) => { clearTimeout(timer); done({ command: [command, ...commandArgs].join(' '), status: null, error: error.message, stdout, stderr, logSha256: sha(`${stdout}\n${stderr}`) }); }); });
}
function transform(text, { removeTrim = false, instrument = false, limitOverride = null } = {}) {
  const start = text.indexOf('export class MemoryArtifactStore'); const defaultStart = text.indexOf('export const defaultArtifactStore', start); const end = text.lastIndexOf('\n}', defaultStart) + 2;
  if (start < 0 || end < 3) throw new Error('MemoryArtifactStore transform anchor not found');
  const counter = instrument ? `\nimport { appendFileSync } from "node:fs";\nimport { threadId as __tcoThreadId } from "node:worker_threads";\nconst __tcoSurveyStats: { puts: number; gets: number; evictions: number; maxAccountedResident: number; maxRecords: number } = { puts: 0, gets: 0, evictions: 0, maxAccountedResident: 0, maxRecords: 0 };\nprocess.once("exit", () => { if (process.env.TCO_SURVEY_STATS_DIR) appendFileSync(process.env.TCO_SURVEY_STATS_DIR + "/stats-" + process.pid + "-" + __tcoThreadId + ".jsonl", JSON.stringify(__tcoSurveyStats) + "\\n"); });\n` : '';
  const replacement = `export class MemoryArtifactStore implements ArtifactStore {\n  private readonly records = new Map<string, { record: ArtifactRecord; weight: number }>();\n  private total = 0;\n  private readonly maxEstimatedBytes: number;\n  constructor(options?: { maxEstimatedBytes?: number }) {\n    const value = options?.maxEstimatedBytes ?? ${limitOverride ?? '256 * 1024 * 1024'};\n    if (!Number.isSafeInteger(value) || value <= 0) throw new Error("maxEstimatedBytes must be a finite positive safe integer");\n    this.maxEstimatedBytes = value;\n  }\n  get(artifactId: string): ArtifactRecord | undefined {\n    ${instrument ? '__tcoSurveyStats.gets++;' : ''}\n    const entry = this.records.get(artifactId);\n    if (!entry) return undefined;\n    this.records.delete(artifactId); this.records.set(artifactId, entry); return entry.record;\n  }\n  put(record: ArtifactRecord): void {\n    ${instrument ? '__tcoSurveyStats.puts++;' : ''}\n    const weight = 2 * record.byteLength + ${k || 0} * record.sourceMap.length + ${fixed};\n    if (!Number.isSafeInteger(weight) || weight < 0) throw new Error("record estimated weight must be a non-negative safe integer");\n    const previous = this.records.get(record.artifactId);\n    if (previous) this.total -= previous.weight;\n    this.records.delete(record.artifactId); this.records.set(record.artifactId, { record, weight }); this.total += weight;\n    ${instrument ? '__tcoSurveyStats.maxAccountedResident = Math.max(__tcoSurveyStats.maxAccountedResident, this.total); __tcoSurveyStats.maxRecords = Math.max(__tcoSurveyStats.maxRecords, this.records.size);' : ''}\n    while (this.total > this.maxEstimatedBytes && this.records.size > 1) {\n      const oldest = this.records.keys().next().value!; const removed = this.records.get(oldest)!;\n      this.records.delete(oldest); this.total -= removed.weight;\n      ${instrument ? '__tcoSurveyStats.evictions++;' : ''}\n    }\n  }\n}`;
  let result = counter + text.slice(0, start) + replacement + text.slice(end);
  if (instrument) {
    result = result.replace('import { appendFileSync } from "node:fs";', 'import { writeFileSync as __tcoSurveyWrite } from "node:fs";\nimport { randomUUID as __tcoSurveyUUID } from "node:crypto";');
    result = result.replace(/process\.once\("exit", \(\) => \{[^\n]+\n/, 'const __tcoSurveyFile = process.env.TCO_SURVEY_STATS_DIR ? process.env.TCO_SURVEY_STATS_DIR + "/stats-" + process.pid + "-" + __tcoThreadId + "-" + __tcoSurveyUUID() + ".json" : null;\nfunction __tcoSurveyFlush(): void { if (__tcoSurveyFile) __tcoSurveyWrite(__tcoSurveyFile, JSON.stringify(__tcoSurveyStats)); }\n');
    result = result.replace('__tcoSurveyStats.gets++;', '__tcoSurveyStats.gets++; __tcoSurveyFlush();');
    result = result.replaceAll('maxAccountedResident', 'maxBeforeEviction');
    result = result.replace('maxRecords: number }', 'maxRecords: number; maxAfterEviction: number }');
    result = result.replace('maxRecords: 0 };', 'maxRecords: 0, maxAfterEviction: 0 };');
    result = result.replace('__tcoSurveyStats.evictions++;\n    }', '__tcoSurveyStats.evictions++;\n    }\n    __tcoSurveyStats.maxAfterEviction = Math.max(__tcoSurveyStats.maxAfterEviction, this.total); __tcoSurveyFlush();');
  }
  if (removeTrim) result = result.replace(/\r?\nfunction trimToTokenBudget\([\s\S]*?\r?\n}\r?\n\r?\n(?=function longestFittingSummaryPrefix)/, '\n');
  assert.notEqual(result, text); assert(result.includes('private total = 0'));
  assert.equal((result.match(/function trimToTokenBudget\(/g) || []).length, removeTrim ? 0 : 1);
  return result;
}
function checkOnly() { const text = readFileSync(resolve(args.get('fixture') || join(root, 'src/core/artifacts.ts')), 'utf8'); const a = transform(text); const b = transform(text, { removeTrim: true }); const trim = (x) => (x.match(/function trimToTokenBudget\(/g) || []).length; if (trim(text) !== 1 || trim(b) !== 0 || !a.includes('private total = 0')) throw new Error('transform fixture validation failed'); process.stdout.write(`${JSON.stringify({ mode: 'check-only', pass: true, beforeSha256: sha(text), aSha256: sha(a), bSha256: sha(b) }, null, 2)}\n`); }
if (args.has('check-only')) { checkOnly(); process.exit(0); }
if (process.version !== 'v24.18.0') throw new Error(`Node v24.18.0 required, got ${process.version}`);
const temp = resolve(mkdtempSync(join(tmpdir(), '6-4b-5-store-candidates-'))); const result = { schema: '6-4b-5-store-candidates/v2', base, k, fixed, node: process.version, snapshots: [], status: 'running' };
const manifest = git(['ls-files', '-z']).split('\0').filter(Boolean).map(file => ({ file, sha256: sha(readFileSync(join(root, file))) }));
result.files = Object.fromEntries(['research/src/6-4b-5-store-candidates.mjs', 'research/src/6-4b-5-store-scenarios.mjs', 'package-lock.json'].map(file => [file, sha(readFileSync(join(root, file)))]));
result.startedAt = new Date().toISOString();
const save = () => { mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(result, null, 2).replaceAll(temp.replaceAll('\\', '\\\\'), '<temp>').replaceAll(root.replaceAll('\\', '\\\\'), '<repo>') + '\n'); };
try {
  const variants = [{ name: 'base' }, { name: 'A' }, { name: 'B' }, { name: 'A-instrumented256', instrument: true }, { name: 'TinyA1', instrument: true, limitOverride: 1 }].filter(spec => !args.has('instrument-only') || spec.instrument);
  let reference = null;
  if (args.has('instrument-only')) {
    const bytes = readFileSync(join(root, 'research/results/6-4b-5-store-candidates.json'));
    reference = JSON.parse(bytes); assert.equal(reference.base, base); assert.equal(reference.k, k); assert.equal(reference.fixed, fixed);
    result.cleanReference = { file: 'research/results/6-4b-5-store-candidates.json', sha256: sha(bytes) };
    result.snapshots.push({ ...reference.snapshots.find(entry => entry.variant === 'base'), reusedReference: true });
  }
  for (const spec of variants) { const variant = spec.name; const dir = join(temp, variant); mkdirSync(dir, { recursive: true }); const tar = join(temp, `${variant}.tar`); const archive = spawnSync('git', ['archive', '--format=tar', '--output', tar, base], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120000 }); const extract = archive.status === 0 ? spawnSync('C:\\Windows\\System32\\tar.exe', ['-xf', tar, '-C', dir], { encoding: 'utf8', windowsHide: true, timeout: 120000 }) : { status: 1, stderr: archive.stderr }; const entry = { variant, informational: Boolean(spec.instrument), archiveStatus: archive.status, extractStatus: extract.status, steps: [] }; result.snapshots.push(entry); save(); if (archive.status !== 0 || extract.status !== 0) { entry.setupFailure = archive.stderr || extract.stderr; save(); continue; }
    const source = join(dir, 'src/core/artifacts.ts'); const before = readFileSync(source, 'utf8'); entry.sourceBeforeSha256 = sha(before); if (variant !== 'base') writeFileSync(source, transform(before, { removeTrim: variant === 'B', instrument: spec.instrument, limitOverride: spec.limitOverride })); entry.sourceAfterSha256 = sha(readFileSync(source, 'utf8'));
    const testFile = join(temp, `${variant}-tests.json`); const statsDir = join(dir, 'survey-stats'); if (spec.instrument) mkdirSync(statsDir, { recursive: true }); const env = spec.instrument ? { ...process.env, TCO_SURVEY_STATS_DIR: statsDir } : undefined;
    for (const [name, commandArgs] of [['npm-ci', [npmCli, 'ci', '--ignore-scripts']], ['build', [npmCli, 'run', 'build']], ['typecheck', [npmCli, 'run', 'typecheck']], ['test', [npmCli, 'test', '--', '--reporter=json', `--outputFile=${testFile}`]], ['benchmark', [npmCli, 'run', 'benchmark']]]) {
      const stepStats = join(statsDir, name);
      if (spec.instrument) mkdirSync(stepStats, { recursive: true });
      const report = await run(process.execPath, commandArgs, dir, spec.instrument ? { ...env, TCO_SURVEY_STATS_DIR: stepStats } : undefined);
      const step = { name, ...report };
      if (spec.instrument) step.instrumentation = readdirSync(stepStats).filter(file => file.endsWith('.json')).map(file => JSON.parse(readFileSync(join(stepStats, file), 'utf8')));
      entry.steps.push(step); save(); console.log(JSON.stringify({ variant, step: name, status: report.status }));
      if ((name === 'npm-ci' || name === 'build') && report.status !== 0) break;
    }
    if (existsSync(testFile)) { try { const report = JSON.parse(readFileSync(testFile, 'utf8')); entry.testSummary = { numTotalTests: report.numTotalTests, numPassedTests: report.numPassedTests, numFailedTests: report.numFailedTests, failedTestNames: (report.testResults || []).flatMap((x) => (x.assertionResults || []).filter((a) => a.status === 'failed').map((a) => a.fullName || a.title)) }; } catch (error) { entry.testSummaryError = error.message; } }
    if (existsSync(testFile)) {
      const report = JSON.parse(readFileSync(testFile, 'utf8'));
      entry.testFailures = (report.testResults || []).flatMap(file => (file.assertionResults || []).filter(test => test.status === 'failed').map(test => ({ file: file.name, name: test.fullName, failureMessages: test.failureMessages })));
      entry.testSummary.numSkippedTests = report.numPendingTests;
    }
    if (!entry.steps.some((x) => x.name === 'build' && x.status !== 0) && !spec.instrument) { const scenario = await run(process.execPath, [join(root, 'research/src/6-4b-5-store-scenarios.mjs'), `--snapshot=${dir}`, `--k=${k}`, `--fixed=${fixed}`, '--json'], root, undefined); entry.scenario = { ...scenario, parsed: (() => { try { return JSON.parse(scenario.stdout); } catch { return null; } })() }; save(); }
  }
  const baseEntry = result.snapshots.find((x) => x.variant === 'base'); const benchmark = (entry) => { const step = entry?.steps.find((x) => x.name === 'benchmark'); if (!step) return null; try { const start = step.stdout.indexOf('{'); const end = step.stdout.lastIndexOf('}'); return start >= 0 && end > start ? JSON.parse(step.stdout.slice(start, end + 1)) : null; } catch { return null; } }; const stripTime = (value) => { if (Array.isArray(value)) return value.map(stripTime); if (!value || typeof value !== 'object') return value; return Object.fromEntries(Object.entries(value).filter(([key]) => !['environment', 'generatedAt', 'latencyMs', 'medianLatencyMs', 'p95LatencyMs', 'suiteLatencyMs'].includes(key)).map(([key, item]) => [key, stripTime(item)])); }; const baseBenchmark = stripTime(benchmark(baseEntry)); for (const entry of result.snapshots) if (entry !== baseEntry) { const candidateBenchmark = stripTime(benchmark(entry)); entry.benchmarkNonTimeDiff = { base: baseBenchmark, candidate: candidateBenchmark, equal: baseBenchmark !== null && candidateBenchmark !== null && JSON.stringify(baseBenchmark) === JSON.stringify(candidateBenchmark) }; }
  result.status = result.snapshots.filter(entry => !entry.informational).every(entry => entry.steps.length === 5 && entry.steps.every(step => step.status === 0) && entry.testSummary?.numFailedTests === 0 && entry.scenario?.parsed && (entry.variant === 'base' ? !entry.scenario.parsed.pass : entry.scenario.parsed.pass && entry.benchmarkNonTimeDiff?.equal)) ? 'complete' : 'complete_with_failures'; save();
} catch (error) { result.status = 'failed'; result.error = error.message; try { save(); } catch {} throw error; }
finally {
  result.preservation = { changed: manifest.filter(row => sha(readFileSync(join(root, row.file))) !== row.sha256).map(row => row.file), trackedCount: manifest.length };
  for (const [file, hash] of Object.entries(result.files)) if (sha(readFileSync(join(root, file))) !== hash) result.preservation.changed.push(file);
  if (result.preservation.changed.length) result.status = 'preservation_failed';
  const parent = resolve(dirname(temp)); assert.equal(parent, resolve(tmpdir())); assert(temp.startsWith(join(parent, '6-4b-5-store-candidates-')));
  rmSync(temp, { recursive: true, force: true }); result.tempCleanup = !existsSync(temp);
  result.finishedAt = new Date().toISOString(); save();
}
if (result.status !== 'complete') process.exitCode = 1;
process.stdout.write(`${output}\n`);

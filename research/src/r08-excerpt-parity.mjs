// R08: offline comparison of query_artifact across plugin bundles on the experiment 3 log questions (no model calls).
// Inputs are the raw captures of src/r08-excerpt-capture.mjs and the rows.jsonl of src/excerpt-bench.mjs for the same run.
// Usage: node src/r08-excerpt-parity.mjs --config <config.json> --out <report.json>
//   config (written by src/r08-parity-config.mjs): { sessions: <dir>, committedManifests: { split: path },
//             expectedBundles: { role: sha256 } (in version order), reps: [1, 2],
//             runs: [{ role, rep, capture: <jsonl>, bench: <rows.jsonl> }], stored: [{ name, rows: <jsonl>, role }] }
// Exit 1 when any structural check fails: duplicate, missing or extra keys, repetition IDs per role that are not exactly
// the planned ones (config reps, default [1, 2]), a capture whose meta role/rep differs from its run, a stored comparison
// whose role has no rerun or whose rows do not all join (joinedRows is the denominator), a bundle hash
// that is not the expected one, a log whose bytes differ from its manifest hash, or a capture that differs from its own
// excerpt-bench row (query string or excerpt ranges). Repetitions that disagree hold their key out of the version comparison.
// Exit 2 when the structure is sound but an attention item needs review: held keys, excerpt-bench repetitions that differ,
// or stored rows that are missing, duplicated or differ from the rerun. Differences between versions are results, not
// attention items.
//
// Field rules (fixed before the runs): compared per excerpt in returned order are startLine, endLine, startByte, endByte,
// completeSpan and the SHA-256 of text; per response the excerpt count, moreMatches (or "absent"), fallbackReason,
// warnings, confidence, estimatedTokens, sha256 and the sorted list of top-level fields. Excluded: artifactId and
// sourceMap.path (absolute paths of this checkout, not part of the behavior under test). A legacy single excerpt is
// position 1; metadata a version does not return is "absent".
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const canon = (v) => (Array.isArray(v) ? `[${v.map(canon).join(",")}]` : v && typeof v === "object"
  ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}` : JSON.stringify(v));
export const hashOf = (v) => sha256(canon(v));
export const keyOf = (r) => `${r.split}/${r.session}/${r.turn}/${r.variant}`;
const VARIANTS = ["full", "keywords", "entity"];

export function expectedKeySet(manifests) {
  const keys = [];
  for (const [split, m] of Object.entries(manifests)) {
    for (const s of m.sessions) {
      s.turns.forEach((t, i) => {
        if (typeof t.evidence?.log !== "number") return;
        for (const v of VARIANTS) keys.push(`${split}/${s.id}/${i + 1}/${v}`);
      });
    }
  }
  return keys.sort();
}

export function normalizeResponse(rec) {
  if (rec.error !== undefined) return { error: rec.error };
  if (rec.applicable === false) return { applicable: false };
  const r = rec.response ?? {};
  return {
    fields: Object.keys(r).sort(),
    count: (r.excerpts ?? []).length,
    excerpts: (r.excerpts ?? []).map((e, i) => ({
      position: i + 1, startLine: e.sourceMap?.startLine, endLine: e.sourceMap?.endLine, startByte: e.sourceMap?.startByte,
      endByte: e.sourceMap?.endByte, completeSpan: e.sourceMap?.completeSpan, textSha256: sha256(e.text ?? ""),
    })),
    moreMatches: r.moreMatches === undefined ? "absent" : r.moreMatches,
    fallbackReason: r.fallbackReason === undefined ? "absent" : r.fallbackReason,
    warnings: r.warnings ?? "absent", confidence: r.confidence ?? "absent",
    estimatedTokens: r.estimatedTokens ?? "absent", sha256: r.sha256 ?? "absent",
  };
}
const firstExcerpt = (n) => (n.excerpts ? n.excerpts[0] ?? null : n);

function indexRecords(records, expected, label, failures) {
  const map = new Map();
  for (const r of records) {
    const k = keyOf(r);
    if (map.has(k)) failures.push(`${label}: duplicate key ${k}`);
    else map.set(k, r);
  }
  const want = new Set(expected);
  const missing = expected.filter((k) => !map.has(k));
  const extra = [...map.keys()].filter((k) => !want.has(k));
  if (missing.length) failures.push(`${label}: ${missing.length} missing keys (first ${missing[0]})`);
  if (extra.length) failures.push(`${label}: ${extra.length} extra keys (first ${extra[0]})`);
  return map;
}

// excerpt-bench summary rules (src/excerpt-bench.mjs).
const isHit = (r) => r.goldCovered && (r.type.startsWith("cross") || r.answerInExcerpt);
const isHitAny = (r) => (r.anyCovered ?? r.goldCovered) && (r.type.startsWith("cross") || (r.anyAnswer ?? r.answerInExcerpt));
export function benchTotals(rows) {
  const t = {};
  for (const r of rows.filter((x) => x.applicable)) {
    for (const k of [`${r.split}/${r.variant}`, `${r.split}/${r.variant}/${r.type}`]) {
      const a = (t[k] ??= { n: 0, hit: 0, hitAny: 0, tie: 0, lost: 0, notTop: 0 });
      a.n++; a.hit += isHit(r) ? 1 : 0; a.hitAny += isHitAny(r) ? 1 : 0; a.tie += r.tieCount > 1 ? 1 : 0;
      a.lost += r.goldAmongTies && !r.goldCovered ? 1 : 0; a.notTop += r.goldAmongTies ? 0 : 1;
    }
  }
  return Object.fromEntries(Object.entries(t).sort(([a], [b]) => a.localeCompare(b)));
}

// reps: the planned repetition IDs per role (the R08 plan runs every bundle twice, IDs 1 and 2).
export function analyze({ manifests, expectedBundles, runs, stored = [], reps = [1, 2] }) {
  const failures = [];
  const expected = expectedKeySet(manifests);
  const manifestLog = new Map();
  for (const [split, m] of Object.entries(manifests)) for (const s of m.sessions) manifestLog.set(`${split}/${s.id}`, s.log.sha256);
  const roles = Object.keys(expectedBundles);
  const perRun = [];
  for (const run of runs) {
    const label = `${run.role}#${run.rep}`;
    const meta = run.capture.find((r) => r.kind === "meta");
    if (!(run.role in expectedBundles)) failures.push(`${label}: unknown role`);
    if (!meta || meta.bundleSha256 !== expectedBundles[run.role]) failures.push(`${label}: bundle sha256 ${meta?.bundleSha256} is not ${expectedBundles[run.role]}`);
    // A capture records its own role and repetition; reusing one file for both repetitions would fake stability.
    if (meta && (meta.role !== run.role || meta.rep !== run.rep)) failures.push(`${label}: capture meta role/rep is ${meta.role}#${meta.rep} (meta rep mismatch)`);
    const cap = indexRecords(run.capture.filter((r) => r.kind === "query"), expected, `${label} capture`, failures);
    const bench = indexRecords(run.bench, expected, `${label} bench`, failures);
    for (const [k, c] of cap) {
      const want = manifestLog.get(`${c.split}/${c.session}`);
      if (c.logSha256 !== want || c.manifestLogSha256 !== want || (c.indexSha256 !== undefined && c.indexSha256 !== want)) failures.push(`${label}: log sha256 of ${k} does not match the manifest`);
      const b = bench.get(k);
      if (!b) continue;
      if (b.query !== c.query) failures.push(`${label}: query differs from excerpt-bench at ${k}`);
      const capRanges = (c.response?.excerpts ?? []).map((e) => [e.sourceMap.startLine, e.sourceMap.endLine]);
      if (c.applicable !== false && canon(capRanges) !== canon(b.excerptRanges ?? (b.excerpt ? [b.excerpt] : []))) failures.push(`${label}: excerpt ranges differ from excerpt-bench at ${k}`);
    }
    perRun.push({ run, meta, cap, bench });
  }
  // Two runs per role; per-key normalized hashes must agree across them or the key is held.
  const norm = {};
  const unstable = {};
  const benchByRole = {};
  const runtime = {};
  for (const role of roles) {
    const rs = perRun.filter((p) => p.run.role === role).sort((a, b) => a.run.rep - b.run.rep);
    // Repetition IDs must be exactly the planned ones; the same capture offered twice under one ID would fake stability.
    const ids = rs.map((p) => p.run.rep);
    if (canon(ids) !== canon([...reps].sort((a, b) => a - b))) { failures.push(`${role}: repetition IDs ${canon(ids)} are not the planned ${canon(reps)} (${rs.length} runs, need ${reps.length} runs)`); continue; }
    runtime[role] = rs.map((p) => ({ rep: p.run.rep, node: p.meta?.node, platform: p.meta?.platform, locale: p.meta?.locale, tools: p.meta?.tools, serverInfo: p.meta?.serverInfo }));
    norm[role] = new Map();
    unstable[role] = [];
    for (const k of expected) {
      const hs = rs.map((p) => (p.cap.has(k) ? normalizeResponse(p.cap.get(k)) : null));
      if (hs.some((h) => h === null)) continue;
      if (new Set(hs.map(hashOf)).size > 1) unstable[role].push(k);
      else norm[role].set(k, hs[0]);
    }
    const benchHashes = rs.map((p) => hashOf([...p.bench.values()].sort((a, b) => keyOf(a).localeCompare(keyOf(b))).map((r) => { const { layout, ...rest } = r; return rest; })));
    benchByRole[role] = { rows: [...rs[0].bench.values()], repsAgree: new Set(benchHashes).size === 1 };
  }
  const pairList = [];
  for (let i = 0; i + 1 < roles.length; i++) pairList.push([roles[i], roles[i + 1]]);
  for (const r of roles.slice(0, -1)) if (!pairList.some(([a, b]) => a === r && b === roles.at(-1))) pairList.push([r, roles.at(-1)]);
  const pairs = {};
  for (const [a, b] of pairList) {
    if (!norm[a] || !norm[b]) continue;
    const p = { compared: 0, held: 0, identical: 0, firstExcerptIdentical: 0, differences: [] };
    for (const k of expected) {
      const x = norm[a].get(k), y = norm[b].get(k);
      if (!x || !y) { p.held++; continue; }
      p.compared++;
      if (hashOf(x) === hashOf(y)) p.identical++;
      else {
        const fields = Object.keys({ ...x, ...y }).filter((f) => canon(x[f]) !== canon(y[f]));
        p.differences.push({ key: k, fields, from: { count: x.count, ranges: x.excerpts?.map((e) => [e.startLine, e.endLine]), moreMatches: x.moreMatches, fields: x.fields },
          to: { count: y.count, ranges: y.excerpts?.map((e) => [e.startLine, e.endLine]), moreMatches: y.moreMatches, fields: y.fields } });
      }
      if (hashOf(firstExcerpt(x)) === hashOf(firstExcerpt(y))) p.firstExcerptIdentical++;
    }
    pairs[`${a}→${b}`] = p;
  }
  const roleSummaries = {};
  for (const [role, { rows, repsAgree }] of Object.entries(benchByRole)) {
    const caps = [...(norm[role]?.values() ?? [])];
    roleSummaries[role] = {
      benchRepsAgree: repsAgree, rows: rows.length, applicable: rows.filter((r) => r.applicable).length,
      errors: perRun.filter((p) => p.run.role === role).reduce((a, p) => a + [...p.cap.values()].filter((c) => c.error !== undefined).length, 0),
      multiExcerptResponses: caps.filter((c) => c.count > 1).length, maxExcerpts: Math.max(0, ...caps.map((c) => c.count ?? 0)),
      moreMatchesPresent: caps.filter((c) => c.moreMatches !== undefined && c.moreMatches !== "absent").length,
      moreMatchesAbsentField: caps.filter((c) => c.moreMatches === "absent").length,
      fallbacks: caps.filter((c) => c.fallbackReason && c.fallbackReason !== "absent").length,
      replicaDisagreements: rows.filter((r) => r.applicable && !r.replicaAgrees).length,
      ties: rows.filter((r) => r.applicable && r.tieCount > 1).map((r) => ({ key: keyOf(r), tieCount: r.tieCount, goldAmongTies: r.goldAmongTies, firstCovers: r.goldCovered, anyCovers: r.anyCovered ?? r.goldCovered })),
      goldNotTop: rows.filter((r) => r.applicable && !r.goldAmongTies).map(keyOf),
      totals: benchTotals(rows),
    };
  }
  const storedComparisons = {};
  for (const s of stored) {
    const f = [];
    const map = indexRecords(s.rows, expected, `stored ${s.name}`, f);
    if (!(s.role in expectedBundles) || !benchByRole[s.role]) failures.push(`stored ${s.name}: role ${s.role} has no rerun rows to compare`);
    const mine = benchByRole[s.role]?.rows ? new Map(benchByRole[s.role].rows.map((r) => [keyOf(r), r])) : new Map();
    // Every stored field must equal the rerun. Fields only the rerun has (added to excerpt-bench after the stored run) are
    // listed with counts instead of being counted as differences, so a new field is visible without hiding old rows.
    const differing = [];
    const rerunOnlyFields = {};
    for (const [k, r] of map) {
      const m = mine.get(k);
      if (!m) continue;
      const fields = Object.keys(r).filter((x) => x !== "layout" && canon(r[x]) !== canon(m[x]));
      if (fields.length) differing.push({ key: k, fields });
      for (const x of Object.keys(m)) if (x !== "layout" && !(x in r)) rerunOnlyFields[x] = (rerunOnlyFields[x] ?? 0) + 1;
    }
    // The denominator is the rows actually joined; every stored row must find its rerun row.
    const joinedRows = [...map.keys()].filter((k) => mine.has(k)).length;
    if (joinedRows !== s.rows.length) failures.push(`stored ${s.name}: joined ${joinedRows} of ${s.rows.length} stored rows`);
    storedComparisons[s.name] = { role: s.role, storedRows: s.rows.length, joinedRows, structural: f, comparedFields: "all stored fields except layout", differing, rerunOnlyFields,
      storedTotals: benchTotals(s.rows), rerunTotals: benchByRole[s.role] ? benchTotals(benchByRole[s.role].rows) : null };
  }
  const attention = [];
  for (const [role, keys] of Object.entries(unstable)) if (keys.length) attention.push(`${role}: ${keys.length} keys held (repetitions disagree)`);
  for (const [role, b] of Object.entries(benchByRole)) if (!b.repsAgree) attention.push(`${role}: excerpt-bench repetitions differ`);
  for (const [name, c] of Object.entries(storedComparisons)) {
    if (c.structural.length) attention.push(`stored ${name}: ${c.structural.join("; ")}`);
    if (c.differing.length) attention.push(`stored ${name}: ${c.differing.length} rows differ`);
  }
  return { failures, attention, expectedKeys: expected.length, roles, runtime, unstable, pairs, roleSummaries, storedComparisons };
}

// Committed manifests vs regenerated ones: all fields equal except those listed, and every log file matches its hash.
export function compareManifests(generated, committed) {
  const diffs = [];
  const gs = new Map(generated.sessions.map((s) => [s.id, s]));
  for (const c of committed.sessions) {
    const g = gs.get(c.id);
    if (!g) { diffs.push({ id: c.id, missing: true }); continue; }
    const fields = Object.keys({ ...c, ...g }).filter((k) => canon(c[k]) !== canon(g[k]));
    if (fields.length) diffs.push({ id: c.id, fields });
  }
  if (generated.sessions.length !== committed.sessions.length) diffs.push({ countGenerated: generated.sessions.length, countCommitted: committed.sessions.length });
  return diffs;
}

const readJsonl = (p) => readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
  const config = JSON.parse(readFileSync(resolve(opt("--config")), "utf8"));
  const out = resolve(opt("--out"));
  if (existsSync(out)) throw new Error(`refusing to overwrite ${out}`);
  const manifests = {};
  const manifestCheck = {};
  for (const split of Object.keys(config.committedManifests)) {
    const genPath = resolve(config.sessions, split, "sessions.json");
    const gen = JSON.parse(readFileSync(genPath, "utf8"));
    const committed = JSON.parse(readFileSync(resolve(config.committedManifests[split]), "utf8"));
    manifests[split] = gen;
    const logs = gen.sessions.map((s) => ({ id: s.id, ok: sha256(readFileSync(resolve(config.sessions, split, s.log.file))) === s.log.sha256 }));
    manifestCheck[split] = { generatedSha256: sha256(readFileSync(genPath)), fieldDiffs: compareManifests(gen, committed), logsMatch: logs.filter((l) => l.ok).length, logs: logs.length };
  }
  const runs = config.runs.map((r) => ({ role: r.role, rep: r.rep, capture: readJsonl(resolve(r.capture)), bench: readJsonl(resolve(r.bench)) }));
  const stored = (config.stored ?? []).map((s) => ({ name: s.name, role: s.role, rows: readJsonl(resolve(s.rows)) }));
  const report = analyze({ manifests, expectedBundles: config.expectedBundles, runs, stored, reps: config.reps ?? [1, 2] });
  for (const [split, m] of Object.entries(manifestCheck)) {
    if (m.logsMatch !== m.logs) report.failures.push(`${split}: ${m.logs - m.logsMatch} log files do not match the manifest`);
    for (const d of m.fieldDiffs) if (d.missing || d.countGenerated !== undefined || (d.fields ?? []).some((f) => f !== "layout")) report.failures.push(`${split}: manifest differs beyond layout ${JSON.stringify(d)}`);
  }
  report.manifestCheck = manifestCheck;
  writeFileSync(out, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  const brief = { failures: report.failures, attention: report.attention, expectedKeys: report.expectedKeys, unstable: Object.fromEntries(Object.entries(report.unstable).map(([k, v]) => [k, v.length])),
    pairs: Object.fromEntries(Object.entries(report.pairs).map(([k, p]) => [k, { compared: p.compared, held: p.held, identical: p.identical, firstExcerptIdentical: p.firstExcerptIdentical }])) };
  console.log(JSON.stringify(brief, null, 2));
  process.exitCode = report.failures.length ? 1 : report.attention.length ? 2 : 0;
}

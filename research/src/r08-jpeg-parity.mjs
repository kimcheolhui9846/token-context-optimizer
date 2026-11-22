// R08: compare experiment 2 JPEG profile checks between the stored p612 probe and a re-run, and between the product entry
// point (src/r08-jpeg-entry.mjs) and the validator rows of the same bytes (no model calls).
// Usage: node src/r08-jpeg-parity.mjs --stored <p612 json> --current <p612 json> --entry <entry.jsonl> [--role latest]
//   --expect-bundle <role>=<sha256> [...] --dist <checkout with dist and tests/fixtures> --out <report.json>
// Exit 1 on duplicate, missing or extra files on either side, an entry capture that did not run the expected bundles,
// a slot ledger hash that differs between the probes or from the entry capture, or fixture calls that do not match the
// checked-in fixture files of --dist. Exit 2 when an attention item needs review: files not
// reproduced in both probe runs, probe columns that differ, or entry calls that disagree with the validator. The denominator is files whose bytes were reproduced
// (SHA-256 equal to the slot manifest) in both probe runs; RQ1 rows are reported apart and never enter these counts.
// --dist also checks the fixture calls against validateJpeg/validateJpegTolerant on the same fixture bytes.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIELDS = { file: 0, kind: 1, arms: 2, slotCount: 3, reproduced: 5, size: 6, app0First: 7, strict: 8, strictWithInsertedApp0: 9, tolerant: 10 };
const SHA = 4;

function index(rows, label, keyFn, failures) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (m.has(k)) failures.push(`${label}: duplicate ${k}`);
    else m.set(k, r);
  }
  return m;
}

export function compareProbeRows(stored, current) {
  const failures = [];
  const a = index(stored, "stored", (r) => r[SHA], failures);
  const b = index(current, "current", (r) => r[SHA], failures);
  const missing = [...a.keys()].filter((k) => !b.has(k));
  const extra = [...b.keys()].filter((k) => !a.has(k));
  if (missing.length) failures.push(`current: ${missing.length} missing files (first ${missing[0]})`);
  if (extra.length) failures.push(`current: ${extra.length} extra files (first ${extra[0]})`);
  const fieldDiffs = {};
  let compared = 0, identical = 0, reproducedBoth = 0;
  for (const [k, x] of a) {
    const y = b.get(k);
    if (!y) continue;
    compared++;
    const both = x[FIELDS.reproduced] === true && y[FIELDS.reproduced] === true;
    if (both) reproducedBoth++;
    const diff = Object.entries(FIELDS).filter(([, i]) => JSON.stringify(x[i]) !== JSON.stringify(y[i])).map(([f]) => f);
    for (const f of diff) fieldDiffs[f] = (fieldDiffs[f] ?? 0) + 1;
    if (both && diff.length === 0) identical++;
  }
  return { failures, stored: stored.length, current: current.length, compared, reproducedBoth, identical, fieldDiffs };
}

const label = (x) => (x === undefined ? "n/a" : x.ok ? "pass" : x.code ?? x.text ?? "error");
// p612 strict cell is "pass" or a code; tolerant cell is "coding:sampling" on pass or a code on reject.
const tolerantCell = (s) => (/^[a-z]+:/.test(s) && !/_/.test(s.split(":")[0]) ? "pass" : s);

export function compareEntry(entryRecords, probeRows, role) {
  const failures = [];
  const calls = index(entryRecords.filter((r) => r.kind === "call" && r.role === role && r.set === "exp2"), `${role} entry`, (r) => r.id, failures);
  const rows = new Map(probeRows.filter((r) => r[FIELDS.reproduced] === true).map((r) => [r[SHA], r]));
  const missing = [...rows.keys()].filter((k) => !calls.has(k));
  const extra = [...calls.keys()].filter((k) => !rows.has(k));
  if (missing.length) failures.push(`${role} entry: ${missing.length} missing calls (first ${missing[0]})`);
  if (extra.length) failures.push(`${role} entry: ${extra.length} extra calls (first ${extra[0]})`);
  const agree = { default: 0, tolerant: 0, app0Default: 0 };
  const disagreements = [];
  const outcomes = {};
  for (const [k, r] of rows) {
    const c = calls.get(k);
    if (!c) continue;
    const want = { default: r[FIELDS.strict], tolerant: tolerantCell(r[FIELDS.tolerant]), app0Default: r[FIELDS.strictWithInsertedApp0] };
    const got = { default: label(c.default), tolerant: label(c.tolerant), app0Default: label(c.app0Default) };
    const prof = (x) => (x?.validationProfile ? `(${x.validationProfile})` : "");
    const o = `default=${got.default}${prof(c.default)} tolerant=${got.tolerant}${prof(c.tolerant)} app0Default=${got.app0Default}${prof(c.app0Default)}`;
    outcomes[o] = (outcomes[o] ?? 0) + 1;
    const bad = Object.keys(agree).filter((f) => want[f] !== got[f]);
    for (const f of Object.keys(agree)) if (!bad.includes(f)) agree[f]++;
    if (bad.length) disagreements.push({ sha256: k, fields: bad, want, got });
  }
  return { failures, role, denominator: rows.size, calls: calls.size, agree, outcomes, disagreements };
}

// Structural checks on the entry capture: it ran the expected bundles, on the same slot ledger as the probe, and called
// every checked-in fixture exactly once per role.
export function checkEntryMeta({ entry, expectedBundles, slotsSha256, fixtureFiles, role }) {
  const f = [];
  const meta = entry.find((r) => r.kind === "meta");
  if (!meta) return ["entry: no meta record"];
  for (const [r, want] of Object.entries(expectedBundles)) {
    const got = meta.bundles?.find((b) => b.role === r)?.sha256;
    if (got !== want) f.push(`entry: bundle ${r} sha256 ${got} is not ${want}`);
  }
  if (meta.slotsSha256 !== slotsSha256) f.push(`entry: slots sha256 ${meta.slotsSha256} is not ${slotsSha256}`);
  const called = entry.filter((r) => r.kind === "call" && r.role === role && r.set.startsWith("fixture:")).map((r) => `${r.set.slice(8)}/${r.id}`).sort();
  const want = [...fixtureFiles].sort();
  if (JSON.stringify(called) !== JSON.stringify(want)) f.push(`entry: ${role} fixture calls ${called.length} do not match the ${want.length} fixture files`);
  return f;
}

export function attentionItems({ probe, entry, fixtures }) {
  const a = [];
  if (probe.compared > probe.reproducedBoth) a.push(`${probe.compared - probe.reproducedBoth} files not reproduced in both probe runs`);
  if (Object.keys(probe.fieldDiffs).length) a.push(`probe columns differ: ${JSON.stringify(probe.fieldDiffs)}`);
  if (entry.disagreements.length) a.push(`${entry.role} entry disagrees with the validator on ${entry.disagreements.length} files`);
  if (fixtures?.disagreements?.length) a.push(`${fixtures.disagreements.length} fixture calls disagree with the validator`);
  return a;
}

export async function compareFixtures(entryRecords, role, dist) {
  const jv = await import(pathToFileURL(resolve(dist, "dist/src/core/jpeg-validation.js")).href);
  const out = { role, fixtures: 0, agreeDefault: 0, agreeTolerant: 0, disagreements: [], outcomes: {} };
  const run = (fn, bytes) => { try { fn(bytes); return "pass"; } catch (e) { return e.code ?? String(e); } };
  for (const c of entryRecords.filter((r) => r.kind === "call" && r.role === role && r.set.startsWith("fixture:"))) {
    const dir = c.set.slice("fixture:".length);
    const bytes = readFileSync(resolve(dist, "tests/fixtures", dir, c.id));
    const want = { default: run(jv.validateJpeg, bytes), tolerant: run(jv.validateJpegTolerant, bytes) };
    const got = { default: label(c.default), tolerant: label(c.tolerant) };
    out.fixtures++;
    if (want.default === got.default) out.agreeDefault++;
    if (want.tolerant === got.tolerant) out.agreeTolerant++;
    if (want.default !== got.default || want.tolerant !== got.tolerant) out.disagreements.push({ fixture: `${dir}/${c.id}`, want, got });
    const k = `${dir}: default=${got.default} tolerant=${got.tolerant}`;
    out.outcomes[k] = (out.outcomes[k] ?? 0) + 1;
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const out = resolve(opt("--out"));
  if (existsSync(out)) throw new Error(`refusing to overwrite ${out}`);
  const stored = JSON.parse(readFileSync(resolve(opt("--stored")), "utf8"));
  const current = JSON.parse(readFileSync(resolve(opt("--current")), "utf8"));
  const entry = readFileSync(resolve(opt("--entry")), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const role = opt("--role", "latest");
  const probe = compareProbeRows(stored.exp2Files, current.exp2Files);
  const expectedBundles = Object.fromEntries(args.flatMap((a, i) => (a === "--expect-bundle" ? [args[i + 1].split("=")] : [])));
  if (!Object.keys(expectedBundles).length) throw new Error("missing --expect-bundle");
  if (!opt("--dist")) throw new Error("missing --dist (needed for the fixture list and validator check)");
  const dist = resolve(opt("--dist"));
  const fixtureFiles = dist ? ["jpeg", "jpeg-tolerant"].flatMap((d) => readdirSync(resolve(dist, "tests/fixtures", d)).filter((n) => n.endsWith(".jpg")).map((n) => `${d}/${n}`)) : [];
  const metaFailures = checkEntryMeta({ entry, expectedBundles, slotsSha256: current.exp2.slotsSha256, fixtureFiles: dist ? fixtureFiles : entry.filter((r) => r.kind === "call" && r.role === role && r.set.startsWith("fixture:")).map((r) => `${r.set.slice(8)}/${r.id}`), role });
  if (stored.exp2.slotsSha256 !== current.exp2.slotsSha256) metaFailures.push("probe: slots sha256 differs between stored and current");
  const entryCmp = compareEntry(entry, current.exp2Files, role);
  const report = {
    failures: [...probe.failures, ...entryCmp.failures, ...metaFailures], expectedBundles, fixtureFileCount: fixtureFiles.length,
    probe: { ...probe, storedValidatorSha256: stored.productJpegValidationSha256, currentValidatorSha256: current.productJpegValidationSha256,
      runtime: { stored: [stored.node, stored.sharp, stored.vips], current: [current.node, current.sharp, current.vips] },
      slotsSha256: [stored.exp2.slotsSha256, current.exp2.slotsSha256], jpegSlots: [stored.exp2.jpegSlots, current.exp2.jpegSlots],
      uniqueJpegFiles: [stored.exp2.uniqueJpegFiles, current.exp2.uniqueJpegFiles], strict: [stored.exp2.strict, current.exp2.strict],
      tolerant: [stored.exp2.tolerant, current.exp2.tolerant], strictWithInsertedApp0: [stored.exp2.strictWithInsertedApp0, current.exp2.strictWithInsertedApp0] },
    entry: entryCmp,
    otherRoles: [...new Set(entry.filter((r) => r.kind === "call" && r.role !== role).map((r) => r.role))].map((r) => compareEntry(entry, current.exp2Files, r)),
    rq1SettingsOnly: { note: "RQ1 originals were not kept; settings re-created, excluded from every experiment 2 denominator",
      stored: { strict: stored.rq1.strict, tolerant: stored.rq1.tolerant, strictWithInsertedApp0: stored.rq1.strictWithInsertedApp0 },
      current: { strict: current.rq1.strict, tolerant: current.rq1.tolerant, strictWithInsertedApp0: current.rq1.strictWithInsertedApp0 },
      rowsIdentical: JSON.stringify(stored.rq1.rows) === JSON.stringify(current.rq1.rows) },
    meta: entry.find((r) => r.kind === "meta"),
  };
  if (opt("--dist")) report.fixtures = await compareFixtures(entry, role, resolve(opt("--dist")));
  report.attention = attentionItems({ probe, entry: entryCmp, fixtures: report.fixtures });
  writeFileSync(out, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ failures: report.failures, attention: report.attention, probe: { compared: probe.compared, reproducedBoth: probe.reproducedBoth, identical: probe.identical, fieldDiffs: probe.fieldDiffs },
    entry: { denominator: entryCmp.denominator, agree: entryCmp.agree, disagreements: entryCmp.disagreements.length, outcomes: entryCmp.outcomes },
    otherRoles: report.otherRoles.map((o) => ({ role: o.role, agree: o.agree, outcomes: o.outcomes })), rq1RowsIdentical: report.rq1SettingsOnly.rowsIdentical,
    fixtures: report.fixtures && { fixtures: report.fixtures.fixtures, agreeDefault: report.fixtures.agreeDefault, agreeTolerant: report.fixtures.agreeTolerant } }, null, 2));
  process.exitCode = report.failures.length ? 1 : report.attention.length ? 2 : 0;
}

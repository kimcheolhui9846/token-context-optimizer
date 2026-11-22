// R08: check freshly built evidence (r08-evidence.mjs output) against the committed evidence. No model calls.
// Usage (from research/): node src/r08-evidence-check.mjs --scratch <S> --fresh <S>/evidence [--rev HEAD | --committed <dir>]
// Every field of excerpt-keys.jsonl, excerpt-summary.json and jpeg-summary.json must be equal after JSON parsing
// (so CRLF in a working copy does not matter), except the 8 raw capture hashes rawSha256["capture-<role>-<rep>.jsonl"]:
// a capture embeds the checkout's absolute path, so those are instead checked against the actual files in <S>/runs.
// Exit 0 only when every required check passes; 1 otherwise (each failure is printed).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const FILES = ["excerpt-keys.jsonl", "excerpt-summary.json", "jpeg-summary.json"];
const PATH_DEPENDENT = /^capture-[a-z0-9]+-\d+\.jsonl$/;

const parse = (name, text) => (name.endsWith(".jsonl")
  ? text.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l))
  : JSON.parse(text));

// First differing JSON path between a and b, or null.
function firstDiff(a, b, path = "$") {
  if (isDeepStrictEqual(a, b)) return null;
  if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    for (const k of keys) {
      const d = firstDiff(a[k], b[k], `${path}[${JSON.stringify(k)}]`);
      if (d) return d;
    }
  }
  return `${path}: committed ${JSON.stringify(a)?.slice(0, 120)} / fresh ${JSON.stringify(b)?.slice(0, 120)}`;
}

// committed, fresh: { file name -> text }. captureSha: { "capture-<role>-<rep>.jsonl" -> sha256 of the actual file }.
export function checkEvidence({ committed, fresh, captureSha }) {
  const failures = [];
  for (const name of FILES) {
    if (committed[name] === undefined) { failures.push(`${name}: committed file missing`); continue; }
    if (fresh[name] === undefined) { failures.push(`${name}: fresh file missing`); continue; }
    let c, f;
    try { c = parse(name, committed[name]); f = parse(name, fresh[name]); } catch (e) { failures.push(`${name}: ${e.message}`); continue; }
    if (name === "excerpt-summary.json") {
      const cr = c.rawSha256 ?? {}, fr = f.rawSha256 ?? {};
      const capKeys = (o) => Object.keys(o).filter((k) => PATH_DEPENDENT.test(k)).sort();
      if (!isDeepStrictEqual(capKeys(cr), capKeys(fr))) failures.push(`${name}: capture hash keys differ`);
      if (capKeys(fr).length !== 8) failures.push(`${name}: expected 8 capture hashes, found ${capKeys(fr).length}`);
      for (const k of capKeys(fr)) {
        if (captureSha[k] === undefined) failures.push(`${name}: rawSha256 ${k}: actual file missing`);
        else if (captureSha[k] !== fr[k]) failures.push(`${name}: rawSha256 ${k} does not match the actual file`);
      }
      const strip = (o) => ({ ...o, rawSha256: Object.fromEntries(Object.entries(o.rawSha256 ?? {}).filter(([k]) => !PATH_DEPENDENT.test(k))) });
      c = strip(c); f = strip(f);
    }
    const d = firstDiff(c, f);
    if (d) failures.push(`${name}: ${d}`);
  }
  return failures;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2);
  const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
  const S = opt("--scratch"), freshDir = opt("--fresh"), dir = opt("--committed"), rev = opt("--rev") ?? "HEAD";
  if (!S || !freshDir) { console.error("usage: --scratch <S> --fresh <dir> [--rev <rev> | --committed <dir>]"); process.exit(1); }
  const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : undefined);
  const committed = {}, fresh = {}, captureSha = {};
  for (const name of FILES) {
    fresh[name] = read(join(resolve(freshDir), name));
    if (dir) committed[name] = read(join(resolve(dir), name));
    else {
      try { committed[name] = execFileSync("git", ["show", `${rev}:research/results/r08-parity/${name}`], { encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "pipe"] }); }
      catch { committed[name] = undefined; }
    }
  }
  for (const role of ["exp3", "pre002", "post002", "latest"]) for (const n of [1, 2]) {
    const p = join(resolve(S), "runs", `capture-${role}-${n}.jsonl`);
    if (existsSync(p)) captureSha[`capture-${role}-${n}.jsonl`] = createHash("sha256").update(readFileSync(p)).digest("hex");
  }
  const failures = checkEvidence({ committed, fresh, captureSha });
  for (const f of failures) console.error(`FAIL ${f}`);
  console.log(failures.length ? `evidence check FAILED (${failures.length})` : `evidence check passed: ${FILES.join(", ")} equal; 8 capture hashes match ${join(S, "runs")}`);
  process.exit(failures.length ? 1 : 0);
}

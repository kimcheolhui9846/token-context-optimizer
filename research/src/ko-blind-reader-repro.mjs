// ko-blind-reader: compare a reproduced mock run with the committed mock evidence across LF and CRLF checkouts.
// Usage (from research/): node src/ko-blind-reader-repro.mjs --expected results/ko-blind-reader/mock --work <mock work dir>
//
// Every file listed in <expected>/SHA256SUMS must have the same SHA-256 in <work>, with two documented exceptions:
//  - stdout.jsonl holds absolute output paths of the machine that ran it; it is excluded (counted, not compared).
//  - ocr/guard-summary.json records researchLockSha256 = SHA-256 of the raw bytes of research/package-lock.json as checked
//    out. Git stores the pinned blob 6b103b97 with LF; a core.autocrlf=true checkout writes CRLF. The field is therefore
//    allowed to be the LF or the CRLF hash of the pinned blob (both recomputed here from the Git object) and is reported
//    as such for each side; every other field, including researchLockBlob (the line-ending independent Git blob id), must
//    be equal. The work side must also match the raw bytes of the current checkout (its own provenance).
// stdout: one safeLine with counts and the lock variants. Nothing else is hidden or rewritten.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson, safeLine } from "./ko-blind-reader-lib.mjs";
import { FIXED_CODE, pinnedBytes, researchDir } from "./ko-blind-reader-fixed.mjs";

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
export const EXCLUDED = ["stdout.jsonl"];
export const LOCK_FIELD_FILE = "ocr/guard-summary.json";

/** LF and CRLF raw SHA-256 of the pinned research/package-lock.json blob (the blob itself has LF only). */
export function lockVariants() {
  const spec = FIXED_CODE.researchLock;
  const lf = pinnedBytes(spec);
  if (lf.includes(13)) throw new Error("pinned lock blob has CR");
  const crlf = Buffer.from(lf.toString("latin1").replace(/\n/g, "\r\n"), "latin1");
  return { blob: spec.blob, lf: sha256(lf), crlf: sha256(crlf) };
}

export function compareEvidence(expectedDir, workDir) {
  const v = lockVariants();
  const variant = (h) => (h === v.lf ? "lf" : h === v.crlf ? "crlf" : "other");
  const sums = readFileSync(join(expectedDir, "SHA256SUMS"), "utf8").split("\n").filter(Boolean).map((l) => [l.slice(0, 64), l.slice(66)]);
  const res = { ok: false, total: sums.length, equal: 0, differ: 0, excluded: 0, expectedDamaged: 0, lockExpected: null, lockWork: null, differing: [] };
  for (const [h, rel] of sums) {
    if (EXCLUDED.includes(rel)) { res.excluded++; continue; }
    const e = join(expectedDir, rel), w = join(workDir, rel);
    if (!existsSync(e) || sha256(readFileSync(e)) !== h) { res.expectedDamaged++; res.differing.push(rel); continue; }
    if (!existsSync(w)) { res.differ++; res.differing.push(rel); continue; }
    if (rel === LOCK_FIELD_FILE) {
      const ej = JSON.parse(readFileSync(e, "utf8")), wj = JSON.parse(readFileSync(w, "utf8"));
      res.lockExpected = variant(ej.researchLockSha256);
      res.lockWork = variant(wj.researchLockSha256);
      const strip = (o) => { const c = { ...o }; delete c.researchLockSha256; return canonicalJson(c); };
      const same = strip(ej) === strip(wj) && ej.researchLockBlob === v.blob && wj.researchLockBlob === v.blob && res.lockExpected !== "other" && res.lockWork !== "other";
      if (same) res.equal++; else { res.differ++; res.differing.push(rel); }
      continue;
    }
    if (sha256(readFileSync(w)) === h) res.equal++; else { res.differ++; res.differing.push(rel); }
  }
  res.ok = res.differ === 0 && res.expectedDamaged === 0 && res.equal + res.excluded === res.total;
  return res;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const arg = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
  let line;
  try {
    const r = compareEvidence(resolve(arg("--expected")), resolve(arg("--work")));
    const v = lockVariants();
    const raw = sha256(readFileSync(join(researchDir, "package-lock.json")));
    const checkout = raw === v.lf ? "lf" : raw === v.crlf ? "crlf" : "other";
    const provenance = r.lockWork === checkout;
    line = { ok: r.ok && provenance, total: r.total, equal: r.equal, differ: r.differ, excluded: r.excluded, failed: r.expectedDamaged, code: `lock_${r.lockExpected}_${r.lockWork}_checkout_${checkout}` };
  } catch {
    line = { ok: false, code: "error" };
  }
  console.log(safeLine(line));
  process.exitCode = line.ok ? 0 : 1;
}

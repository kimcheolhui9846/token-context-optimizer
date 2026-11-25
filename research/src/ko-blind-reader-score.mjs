// ko-blind-reader: local scorer with submission lock (protocol research/plans/2026-11-25-ko-blind-reader-protocol.md, 6.3;
// Opus milestone review of 130be80: M1, m1, m2, m3). Node built-in modules only; copied with ko-blind-reader-lib.mjs into
// <admin>/scorer/.
// Usage: node ko-blind-reader-score.mjs --response <final response file> [--admin <admin dir>] [--check-only]
//        node ko-blind-reader-score.mjs --self-check [--admin <admin dir>]
//   default admin dir = the parent of this file's folder.
// Order: 1. answer-free packet record <admin>/packet-record.json against the frozen <admin>/packet/start.html (file SHA-256,
//        payload packetHash, displayed) and its kbr-packet commitment; 2. the response against the record (format, kind,
//        packetId, packetHash, digest, positions, fields, reader states) - the key is not opened; 3. the first valid response is
//        locked no-clobber (temporary file + hard link) in <admin>/responses/locked.json with locked.sha256; 4. only then the key
//        bytes are checked against the kbr-key commitment and the key structure against the record; 5. score files are written
//        by rename. Every run except --check-only writes <admin>/score/last-run.json with ok/code.
// stdout: one safeLine (ok/fail code, lock state, SHA-256, output folder). Never answers, scores or error text.
import { createHash, randomBytes } from "node:crypto";
import { closeSync, existsSync, fsyncSync, linkSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RECORD_SCOPES, checkPacketRecord, commitment, safeLine, scoreResponse, scoreTable, validateKey, validateResponseRecord } from "./ko-blind-reader-lib.mjs";

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
class Code extends Error { constructor(code) { super(code); this.code = code; } }
const fail = (code) => { throw new Code(code); };

function readOr(path, code) {
  try { return readFileSync(path); } catch { return fail(code); }
}
function salt(adminDir, label) {
  let s;
  try { s = Buffer.from(JSON.parse(readFileSync(join(adminDir, "salts", `${label}.salt.json`), "utf8")).saltHex, "hex"); } catch { return fail("salt"); }
  return s.length >= 32 ? s : fail("salt");
}
/** New file with exactly `data`, written to a temporary name, flushed and hard-linked: never a partial file, never a clobber. */
function linkNew(target, data, beforeLink) {
  const tmp = join(dirname(target), `.${randomBytes(8).toString("hex")}.tmp`);
  const fd = openSync(tmp, "wx");
  try { writeSync(fd, data); fsyncSync(fd); } finally { closeSync(fd); }
  try {
    if (beforeLink) beforeLink();
    linkSync(tmp, target);
    return true;
  } catch (e) {
    if (e && e.code === "EEXIST") return false;
    throw e;
  } finally {
    try { unlinkSync(tmp); } catch { /* already gone */ }
  }
}
/** Replace a derived output file by rename (score files only). */
function writeByRename(target, text) {
  const tmp = join(dirname(target), `.${randomBytes(8).toString("hex")}.tmp`);
  const fd = openSync(tmp, "wx");
  try { writeSync(fd, text); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(tmp, target);
}

/** Step 1: record, frozen packet and kbr-packet commitment. No response, no key. */
function packetStage(adminDir) {
  let record;
  try { record = JSON.parse(readFileSync(join(adminDir, "packet-record.json"), "utf8")); } catch { fail("packet_record"); }
  const html = readOr(join(adminDir, "packet", "start.html"), "packet_file");
  const c = checkPacketRecord(record, html);
  if (!c.ok) fail(c.code);
  if (commitment(salt(adminDir, "kbr-packet"), "kbr-packet", html) !== record.commitments.packet.value) fail("packet_commitment");
  return { record, htmlSha256: sha256(html) };
}
/** Step 4: key bytes against kbr-key, then structure against the record. */
function keyStage(adminDir, record) {
  const bytes = readOr(join(adminDir, "key.json"), "key_missing");
  if (commitment(salt(adminDir, "kbr-key"), "kbr-key", bytes) !== record.commitments.key.value) fail("key_commitment");
  let key;
  try { key = JSON.parse(bytes.toString("utf8")); } catch { fail("key_format"); }
  if (!validateKey(key, record).ok) fail("key_format");
  return key;
}
/** Step 3: lock. Returns "new" or "same"; lock_different / lock_corrupt otherwise. A missing locked.sha256 is restored. */
function lockStage(adminDir, bytes, respSha, faults) {
  const dir = join(adminDir, "responses");
  mkdirSync(dir, { recursive: true });
  const lockFile = join(dir, "locked.json"), shaFile = join(dir, "locked.sha256");
  let lock = "same";
  if (!existsSync(lockFile) && linkNew(lockFile, bytes, faults.beforeLink)) lock = "new";
  const lockedSha = sha256(readFileSync(lockFile));
  if (existsSync(shaFile)) {
    if (readFileSync(shaFile, "utf8").slice(0, 64) !== lockedSha) fail("lock_corrupt");
  } else {
    linkNew(shaFile, `${lockedSha}  locked.json\n`);
    if (readFileSync(shaFile, "utf8").slice(0, 64) !== lockedSha) fail("lock_corrupt");
  }
  if (lockedSha !== respSha) fail("lock_different");
  return lock;
}

export function selfCheck({ adminDir }) {
  try {
    const { record, htmlSha256 } = packetStage(adminDir);
    const bytes = readOr(join(adminDir, "key.json"), "key_missing");
    if (commitment(salt(adminDir, "kbr-key"), "kbr-key", bytes) !== record.commitments.key.value) fail("key_commitment");
    return { ok: true, packetSha256: htmlSha256 };
  } catch (e) {
    return { ok: false, code: e instanceof Code ? e.code : "io" };
  }
}

export function lockAndScore({ adminDir, responsePath, checkOnly = false, faults = {} }) {
  const result = { ok: false };
  try {
    const { record, htmlSha256 } = packetStage(adminDir);
    const bytes = readOr(responsePath, "response_missing");
    let resp;
    try { resp = JSON.parse(bytes.toString("utf8")); } catch { fail("json"); }
    const v = validateResponseRecord(resp, record);
    if (!v.ok) fail(v.code);
    const respSha = sha256(bytes);
    result.responseSha256 = respSha;
    if (checkOnly) {
      const lf = join(adminDir, "responses", "locked.json");
      result.lock = existsSync(lf) ? (sha256(readFileSync(lf)) === respSha ? "same" : "other") : "none";
      result.ok = true;
      return result;
    }
    result.lock = lockStage(adminDir, bytes, respSha, faults);
    if (faults.afterLock) faults.afterLock();
    const key = keyStage(adminDir, record);
    const score = scoreResponse(resp, key);
    const out = join(adminDir, "score");
    mkdirSync(out, { recursive: true });
    const integrity = {
      packetFile: { scope: RECORD_SCOPES.packetFile, sha256: htmlSha256, commitmentOk: true, commitmentScope: RECORD_SCOPES.packetCommitment },
      packetPayload: { scope: RECORD_SCOPES.payload, packetHash: record.packetHash, equalToResponse: true },
      key: { scope: RECORD_SCOPES.keyCommitment, commitmentOk: true },
      response: { scope: RECORD_SCOPES.response, sha256: respSha, digestOk: true, digestScope: RECORD_SCOPES.digest },
      recordSource: record.source ?? null,
    };
    writeByRename(join(out, "score.json"), `${JSON.stringify({ ...score, responseSha256: respSha, integrity }, null, 1)}\n`);
    writeByRename(join(out, "score-table.md"), scoreTable(score, { responseSha256: respSha }));
    result.ok = true;
    result.out = out;
    return result;
  } catch (e) {
    result.ok = false;
    result.code = e instanceof Code ? e.code : "io";
    return result;
  } finally {
    if (!checkOnly) {
      try {
        const out = join(adminDir, "score");
        mkdirSync(out, { recursive: true });
        writeByRename(join(out, "last-run.json"), `${JSON.stringify({ ok: result.ok, code: result.code ?? null, lock: result.lock ?? null, responseSha256: result.responseSha256 ?? null })}\n`);
      } catch { /* the stdout line still reports the failure */ }
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let line;
  try {
    const argv = process.argv.slice(2);
    const arg = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
    const adminDir = resolve(arg("--admin") ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
    if (argv.includes("--self-check")) {
      line = selfCheck({ adminDir });
    } else if (!arg("--response")) {
      line = { ok: false, code: "usage" };
    } else {
      const r = lockAndScore({ adminDir, responsePath: resolve(arg("--response")), checkOnly: argv.includes("--check-only") });
      line = { ok: r.ok };
      if (r.code) line.code = r.code;
      if (r.lock) line.lock = r.lock;
      if (r.responseSha256) line.responseSha256 = r.responseSha256;
      if (r.out) line.out = r.out.split("\\").join("/");
    }
  } catch {
    line = { ok: false, code: "io" };
  }
  let text;
  try { text = safeLine(line); } catch { text = safeLine({ ok: false, code: "output_policy" }); }
  console.log(text);
  process.exitCode = line.ok ? 0 : 1;
}

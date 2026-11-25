// ko-blind-reader: local scorer with submission lock (protocol research/plans/2026-11-25-ko-blind-reader-protocol.md, 6.3).
// Node built-in modules only; copied with ko-blind-reader-lib.mjs into <admin>/scorer/ for the real run.
// Usage: node ko-blind-reader-score.mjs --response <final response file> [--admin <admin dir>]
//   default admin dir = the parent of this file's folder. Reads <admin>/key.json.
//   Writes <admin>/responses/locked.json (first valid response only), <admin>/score/score.json and score-table.md.
// stdout: one line with ok/fail code, lock state, SHA-256 and the output folder. Never answers or scores.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { safeLine, scoreResponse, scoreTable, validateResponse } from "./ko-blind-reader-lib.mjs";

const sha256 = (b) => createHash("sha256").update(b).digest("hex");

export function lockAndScore({ adminDir, responsePath }) {
  const keyPath = join(adminDir, "key.json");
  if (!existsSync(keyPath)) return { ok: false, code: "key_missing" };
  let key;
  try { key = JSON.parse(readFileSync(keyPath, "utf8")); } catch { return { ok: false, code: "key_format" }; }
  let bytes;
  try { bytes = readFileSync(responsePath); } catch { return { ok: false, code: "response_missing" }; }
  let resp;
  try { resp = JSON.parse(bytes.toString("utf8")); } catch { return { ok: false, code: "json" }; }
  const v = validateResponse(resp, key);
  if (!v.ok) return { ok: false, code: v.code };
  const respSha = sha256(bytes);
  const lockDir = join(adminDir, "responses");
  const lockFile = join(lockDir, "locked.json");
  let lock;
  if (existsSync(lockFile)) {
    if (sha256(readFileSync(lockFile)) !== respSha) return { ok: false, code: "lock_different", responseSha256: respSha };
    lock = "same";
  } else {
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(lockFile, bytes, { flag: "wx" });
    writeFileSync(join(lockDir, "locked.sha256"), `${respSha}  locked.json\n`, { flag: "wx" });
    lock = "new";
  }
  const score = scoreResponse(resp, key);
  const out = join(adminDir, "score");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "score.json"), `${JSON.stringify({ ...score, responseSha256: respSha }, null, 1)}\n`);
  writeFileSync(join(out, "score-table.md"), scoreTable(score, { responseSha256: respSha }));
  return { ok: true, lock, responseSha256: respSha, out };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
  const adminDir = resolve(arg("--admin") ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
  const responsePath = arg("--response");
  if (!responsePath) {
    console.log(safeLine({ ok: false, code: "usage" }));
    process.exit(2);
  }
  const r = lockAndScore({ adminDir, responsePath: resolve(responsePath) });
  const line = { ok: r.ok };
  if (r.code) line.code = r.code;
  if (r.lock) line.lock = r.lock;
  if (r.responseSha256) line.responseSha256 = r.responseSha256;
  if (r.out) line.out = r.out.split("\\").join("/");
  console.log(safeLine(line));
  process.exit(r.ok ? 0 : 1);
}

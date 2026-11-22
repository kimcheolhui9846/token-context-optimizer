// R08: capture raw query_artifact responses of one plugin bundle on the experiment 3 log questions (no model calls).
// Usage: node src/r08-excerpt-capture.mjs --bundle <plugin .mjs> --role <name> --rep <n> --out <file.jsonl>
//   [--sessions <dir with heldout/calibration/dev>] [--splits heldout,calibration,dev]
// The query rules and tool arguments are those of src/excerpt-bench.mjs (maxTokens 400, contextLines 1, maxExcerpts omitted).
// They are copied, not imported, because excerpt-bench.mjs is a script; r08-excerpt-parity.mjs checks that every captured
// query string and excerpt range equals the excerpt-bench row of the same run, so a drift in this copy fails the comparison.
// Line 1 is a meta record (bundle hash, runtime); each later line is one key split/session/turn/variant with the raw
// structured response or the thrown error. --out must not exist yet, so earlier evidence is never overwritten.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { outDir } from "./env.mjs";
import { startPlugin } from "./mcp-client.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const need = (k) => { const v = opt(k); if (v === undefined) throw new Error(`missing ${k}`); return v; };
const bundle = resolve(need("--bundle"));
const role = need("--role");
const rep = Number(need("--rep"));
const out = resolve(need("--out"));
const splits = opt("--splits", "heldout,calibration,dev").split(",");
const root = resolve(opt("--sessions", join(outDir, "sessions")));
if (existsSync(out)) throw new Error(`refusing to overwrite ${out}`);

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const norm = (s) => s.normalize("NFKC").toLocaleLowerCase();
const tokenize = (s) => [...norm(s).matchAll(/[\p{L}\p{N}_./:-]+/gu)].map((m) => m[0]);
const STOP = new Set("a an and answer are as at by does for from given in is it line lines log notes of on or that the this to was what which with".split(" "));
const QUERIES = {
  full: (q) => q,
  keywords: (q) => tokenize(q).filter((t) => !STOP.has(t.replace(/[.:?]+$/, ""))).map((t) => t.replace(/[.:?]+$/, "")).join(" "),
  entity: (q) => { const ids = tokenize(q).map((t) => t.replace(/[.:?]+$/, "")).filter((t) => /\d/.test(t)); return ids.length ? ids.join(" ") : null; },
};
const TOOL_ARGS = { maxTokens: 400, contextLines: 1 };

const bundleBytes = readFileSync(bundle);
const plugin = await startPlugin({ allowedRoots: [root], bundle });
const tools = await plugin.listTools();
const records = [{
  kind: "meta", role, rep, bundleSha256: sha256(bundleBytes), bundleBytes: bundleBytes.length,
  node: process.version, platform: `${process.platform}-${process.arch}`,
  locale: Intl.DateTimeFormat().resolvedOptions().locale, serverInfo: plugin.serverInfo, tools,
  toolArgs: TOOL_ARGS, splits,
}];
for (const split of splits) {
  const manifestBytes = readFileSync(join(root, split, "sessions.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  for (const s of manifest.sessions) {
    const logPath = join(root, split, s.log.file);
    const logBytes = readFileSync(logPath);
    const index = await plugin.call("index_artifact", { path: logPath });
    for (const [i, t] of s.turns.entries()) {
      if (typeof t.evidence?.log !== "number") continue;
      for (const [variant, make] of Object.entries(QUERIES)) {
        const query = make(t.q);
        const rec = { kind: "query", split, session: s.id, turn: i + 1, variant, type: t.type, goldLine: t.evidence.log,
          answers: t.answers, query, logSha256: sha256(logBytes), manifestLogSha256: s.log.sha256, indexSha256: index.sha256 };
        if (query === null) { rec.applicable = false; records.push(rec); continue; }
        rec.applicable = true;
        try {
          rec.response = await plugin.call("query_artifact", { artifactId: index.artifactId, query, ...TOOL_ARGS });
        } catch (e) {
          rec.error = String(e?.message ?? e);
        }
        records.push(rec);
      }
    }
  }
}
plugin.close();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, records.map((r) => JSON.stringify(r)).join("\n") + "\n", { flag: "wx" });
console.log(JSON.stringify({ role, rep, out, queries: records.length - 1, errors: records.filter((r) => r.error).length }));

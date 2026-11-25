// ko-blind-reader: run driver (protocol research/plans/2026-11-25-ko-blind-reader-protocol.md, sections 4, 5, 7, 8, 10).
// Usage (from research/):
//   node src/ko-blind-reader-run.mjs mock --work <new dir> [--publish <new dir>]
//       public mock seed: generate, render, OCR (offline guard), W1/W4/W5, packet, QA, synthetic responses, scorer, recount,
//       stdout leak check; --publish copies the public mock evidence (no PNG folders; the packet holds the method images).
//   node src/ko-blind-reader-run.mjs real-prepare --admin <new dir> --public <commitments json>
//       new real seed (OS CSPRNG), generation, render, plan check, seed and assignment commitments. Run before any OCR.
//   node src/ko-blind-reader-run.mjs real-finish --admin <dir> --reader <new dir> --mock-packet <mock start.html> --public <json>
//       OCR, predictions, W1/W4/W5, packet and key, QA (template part equal to the mock packet), reader folder,
//       scorer install, packet and key commitments.
// Real modes print one line of counts, pass flags and SHA-256 only; child output is kept in the admin folder.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as L from "./ko-blind-reader-lib.mjs";
import { lockAndScore } from "./ko-blind-reader-score.mjs";
import { REG, researchDir } from "./ko-blind-reader-fixed.mjs";

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const pretty = (o) => `${JSON.stringify(o, null, 1)}\n`;
const argv = process.argv.slice(2);
const mode = argv[0];
const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
const FONT = opt("--font") ?? `C:/Windows/Fonts/${REG.fixed.font.file}`;
const GUARD = join(researchDir, "tools", "d03", "guard", "node-netguard.cjs");
const PIPE = join(researchDir, "src", "ko-blind-reader-pipeline.mjs");
const GEN = join(researchDir, "tools", "ko-blind-reader", "generate.py");
const RECOUNT = join(researchDir, "tools", "ko-blind-reader", "recount.py");
const slash = (p) => resolve(p).split("\\").join("/");

class Stop extends Error { constructor(code) { super(code); this.code = code; } }
const stop = (code) => { throw new Stop(code); };

/** Run one child hidden; keep its stdout lines (JSON) in `log`. Returns the parsed last line. */
function child(log, label, file, args, env = {}) {
  const exe = file.endsWith(".py") ? "python" : process.execPath;
  let out = "", status = 0;
  try {
    out = execFileSync(exe, [file, ...args], { cwd: researchDir, windowsHide: true, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PYTHONIOENCODING: "utf-8", ...env }, maxBuffer: 64 * 1024 * 1024 });
  } catch (e) { out = String(e.stdout ?? ""); status = e.status ?? 1; }
  const lines = out.split(/\r?\n/).filter(Boolean);
  log.push({ label, status, lines });
  let last = null;
  try { last = JSON.parse(lines[lines.length - 1]); } catch { /* below */ }
  if (status !== 0 || !last || last.ok !== true) stop(`child_${label}`);
  return last;
}

function guardEnv(dir, step) {
  return { NODE_OPTIONS: `--require=${GUARD}`, D03_NET_LOG: join(dir, "net-guard.jsonl"), D03_STEP: step };
}

function payloadOf(html) {
  const m = /<script type="application\/json" id="kbr-payload">([\s\S]*?)<\/script>/.exec(html);
  if (!m) stop("payload");
  return JSON.parse(m[1]);
}

/** Generation through packet and QA, shared by mock and real. */
function produce(log, { gen, practice, work, admin, packetHtml, keyPath, qaPath, templateOf, ocrStep }) {
  child(log, "render", PIPE, ["render", "--set", gen, "--font", FONT]);
  child(log, "render_practice", PIPE, ["render", "--set", practice, "--font", FONT]);
  child(log, "ocr", PIPE, ["ocr", "--set", gen, "--out", join(work, "ocr")], guardEnv(work, ocrStep));
  child(log, "predict", PIPE, ["predict", "--set", gen, "--ocr", join(work, "ocr"), "--out", join(work, "pred")]);
  child(log, "build", PIPE, ["build", "--set", gen, "--pred", join(work, "pred"), "--practice", practice, "--out", join(work, "build")]);
  child(log, "packet", PIPE, ["packet", "--set", gen, "--build", join(work, "build"), "--html", packetHtml, "--key", keyPath]);
  return child(log, "qa", PIPE, ["qa", "--set", gen, "--build", join(work, "build"), "--html", packetHtml, "--key", keyPath, "--out", qaPath, "--template-of", templateOf ?? packetHtml]);
}

// ---------------------------------------------------------------- mock
const UNIT = { time: "", count: "명", pages: "쪽" };
function synthetic(payload, key, kind) {
  const run = (s, ...acts) => acts.reduce((st, a) => L.step(st, a), s);
  let s = run(L.initState(payload), { type: "selfReport", value: "no" }, { type: "begin" }, { type: "toPractice" },
    { type: "practiceSet", column: "L", value: "11:40" }, { type: "practiceCheck" }, { type: "toItems" });
  for (let i = 0; i < key.items.length; i++) {
    const k = key.items[i];
    if (kind === "aborted" && i === 5) return L.finalResponse(run(s, { type: "abortRequest" }, { type: "abortConfirm" }));
    if (kind === "mixed" && i % 6 === 5) { s = run(s, { type: "skipRequest" }, { type: "skipConfirm" }); continue; }
    if (s.items[s.index].displayed) {
      const other = k.side === "L" ? "R" : "L";
      const value = `${k.answer}${UNIT[k.qtype]}`;
      const a = kind === "mixed"
        ? [{ column: k.side, value }, { column: other, value }, { column: k.side, value: "1" }, { column: "unknown", valueUnknown: true }, { column: other, value: "2" }][i % 6]
        : { column: k.side, value };
      s = run(s, { type: "set", ...a });
    }
    s = L.step(s, { type: "next" });
  }
  return L.finalResponse(run(s, { type: "finalizeRequest" }, { type: "finalizeConfirm" }));
}

function stdoutLeaks(log, design, plan) {
  const canaries = new Set();
  const hasHangul = (x) => /[가-힣]/.test(x);
  for (const im of design.images) for (const it of im.items) if (hasHangul(it.text) || /[:명쪽]/.test(it.text)) canaries.add(it.text);
  for (const s of plan.sources) { canaries.add(s.question); canaries.add(s.imageId); if (s.answer.includes(":")) canaries.add(s.answer); }
  let lines = 0, leaks = 0, policy = 0;
  for (const c of log) for (const l of c.lines) {
    lines++;
    for (const x of canaries) if (l.includes(x)) leaks++;
    if (!c.label.startsWith("gen") && !c.label.startsWith("render")) {
      try { L.safeLine(JSON.parse(l)); } catch { policy++; }
    }
  }
  return { lines, canaries: canaries.size, leaks, policy };
}

function mock() {
  const work = opt("--work") ?? stop("usage_work");
  if (existsSync(work)) stop("exists");
  mkdirSync(work, { recursive: true });
  const log = [];
  const gen = join(work, "gen"), practice = join(work, "practice"), admin = join(work, "admin");
  child(log, "gen", GEN, ["--mock", "--font", FONT, "--out", gen]);
  child(log, "gen_practice", GEN, ["--practice", "--out", practice]);
  const packetHtml = join(work, "packet", "start.html"), keyPath = join(admin, "key.json");
  produce(log, { gen, practice, work, admin, packetHtml, keyPath, qaPath: join(admin, "qa.json"), ocrStep: "kbr-mock-ocr" });
  child(log, "install_admin", PIPE, ["install-admin", "--admin", admin]);
  const html = readFileSync(packetHtml, "utf8");
  const payload = payloadOf(html);
  const key = JSON.parse(readFileSync(keyPath, "utf8"));
  // synthetic final responses (mock only): each scored in its own copy of the admin folder, then recounted in Python
  const results = {};
  for (const kind of ["correct", "mixed", "aborted"]) {
    const resp = synthetic(payload, key, kind);
    const respPath = join(work, "responses", `${kind}.json`);
    mkdirSync(dirname(respPath), { recursive: true });
    writeFileSync(respPath, pretty(resp));
    const dir = join(work, "score", kind);
    mkdirSync(dir, { recursive: true });
    copyFileSync(keyPath, join(dir, "key.json"));
    const r1 = lockAndScore({ adminDir: dir, responsePath: respPath });
    const r2 = lockAndScore({ adminDir: dir, responsePath: respPath });
    const rc = child(log, `recount_${kind}`, RECOUNT, ["--response", join(dir, "responses", "locked.json"), "--key", keyPath, "--score", join(dir, "score", "score.json"), "--out", join(dir, "score", "recount.json")]);
    results[kind] = { first: r1.lock, again: r2.lock, ok: r1.ok && r2.ok && rc.ok, recountChecks: rc.checks, recountFailed: rc.failed };
  }
  // the installed admin scorer (CLI) on the mixed response, then a different response is refused
  const cli = child(log, "scorer_cli", join(admin, "scorer", "ko-blind-reader-score.mjs"), ["--admin", admin, "--response", join(work, "responses", "mixed.json")]);
  let refused = false;
  try { child(log, "scorer_cli_other", join(admin, "scorer", "ko-blind-reader-score.mjs"), ["--admin", admin, "--response", join(work, "responses", "correct.json")]); } catch { refused = log[log.length - 1].lines.some((l) => l.includes("lock_different")); }
  const design = JSON.parse(readFileSync(join(gen, "design.json"), "utf8"));
  const plan = JSON.parse(readFileSync(join(gen, "plan.json"), "utf8"));
  const leak = stdoutLeaks(log, design, plan);
  const summary = { version: "ko-blind-reader-mock-run-1", set: "mock", results, scorerCli: { lock: cli.lock, otherRefused: refused }, stdout: leak, packetSha256: sha256(Buffer.from(html)), keySha256: sha256(readFileSync(keyPath)) };
  summary.pass = Object.values(results).every((r) => r.ok && r.first === "new" && r.again === "same" && r.recountFailed === 0) && refused && leak.leaks === 0 && leak.policy === 0;
  writeFileSync(join(work, "mock-run.json"), pretty(summary));
  writeFileSync(join(work, "stdout.jsonl"), log.map((c) => JSON.stringify(c)).join("\n") + "\n");
  const pub = opt("--publish");
  if (pub) publishMock(work, pub);
  return { ok: summary.pass, pass: summary.pass, set: "mock", lines: leak.lines, leaks: leak.leaks, sha256: sha256(readFileSync(join(work, "mock-run.json"))) };
}

function publishMock(work, pub) {
  if (existsSync(pub)) stop("exists");
  const copy = (rel, to = rel) => { const d = join(pub, to); mkdirSync(dirname(d), { recursive: true }); copyFileSync(join(work, rel), d); };
  for (const f of ["gen/design.json", "gen/plan.json", "gen/summary.json", "gen/selector/questions.json", "gen/render/render.json", "gen/render/gold.json", "gen/render/render-check.json",
    "practice/design.json", "practice/render/render.json", "practice/render/render-check.json",
    "ocr/ocr.jsonl", "ocr/k1.jsonl", "ocr/freeze.json", "ocr/guard-summary.json", "pred/predictions.jsonl", "pred/freeze.json",
    "build/manifest.json", "build/coords.jsonl", "packet/start.html", "admin/key.json", "admin/qa.json", "mock-run.json", "stdout.jsonl"]) copy(f);
  for (const kind of ["correct", "mixed", "aborted"]) {
    copy(`responses/${kind}.json`);
    for (const f of ["responses/locked.json", "score/score.json", "score/score-table.md", "score/recount.json"]) copy(`score/${kind}/${f}`);
  }
  const files = [];
  const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(join(d, e.name)) : files.push(join(d, e.name))));
  walk(pub);
  writeFileSync(join(pub, "SHA256SUMS"), files.map((f) => `${sha256(readFileSync(f))}  ${f.slice(pub.length + 1).split("\\").join("/")}`).sort((a, b) => a.slice(66).localeCompare(b.slice(66))).join("\n") + "\n");
}

// ---------------------------------------------------------------- real
function realPrepare() {
  const admin = opt("--admin") ?? stop("usage_admin"), pub = opt("--public") ?? stop("usage_public");
  if (existsSync(admin)) stop("admin_exists");
  if (existsSync(REG.reader.folder)) stop("reader_exists");
  mkdirSync(admin, { recursive: true });
  const log = [];
  child(log, "seed", GEN, ["--new-seed", join(admin, "seed.json")]);
  const gen = join(admin, "gen"), practice = join(admin, "practice");
  const g = child(log, "gen", GEN, ["--seed-file", join(admin, "seed.json"), "--font", FONT, "--out", gen]);
  child(log, "gen_practice", GEN, ["--practice", "--out", practice]);
  const plan = JSON.parse(readFileSync(join(gen, "plan.json"), "utf8"));
  const planProblems = L.checkPlan(plan).length;
  if (planProblems) stop("plan");
  const salts = join(admin, "salts");
  const c1 = child(log, "commit_seed", PIPE, ["commit", "--label", "kbr-seed", "--file", join(admin, "seed.json"), "--salts", salts, "--public", pub]);
  const c2 = child(log, "commit_assignment", PIPE, ["commit", "--label", "kbr-assignment", "--file", join(gen, "plan.json"), "--salts", salts, "--public", pub]);
  writeFileSync(join(admin, "logs-prepare.jsonl"), log.map((c) => JSON.stringify(c)).join("\n") + "\n", { flag: "wx" });
  return { ok: true, sources: g.sources, problems: planProblems, commitments: c2.commitments, sha256: sha256(readFileSync(pub)) };
}

function realFinish() {
  const admin = opt("--admin") ?? stop("usage_admin"), reader = opt("--reader") ?? stop("usage_reader");
  const mockPacket = opt("--mock-packet") ?? stop("usage_mock_packet"), pub = opt("--public") ?? stop("usage_public");
  if (!existsSync(join(admin, "seed.json"))) stop("admin_missing");
  if (existsSync(reader)) stop("reader_exists");
  for (const d of ["ocr", "pred", "build", "packet", "key.json", "qa"]) if (existsSync(join(admin, d))) stop("admin_step_exists");
  const log = [];
  const gen = join(admin, "gen"), practice = join(admin, "practice");
  const packetHtml = join(admin, "packet", "start.html"), keyPath = join(admin, "key.json");
  let qa;
  try {
    // render outputs already exist only if a previous finish failed after rendering; then do not render again
    if (existsSync(join(gen, "render"))) stop("render_exists");
    qa = produce(log, { gen, practice, work: admin, admin, packetHtml, keyPath, qaPath: join(admin, "qa", "qa.json"), templateOf: mockPacket, ocrStep: "kbr-real-ocr" });
  } finally {
    writeFileSync(join(admin, "logs-finish.jsonl"), log.map((c) => JSON.stringify(c)).join("\n") + "\n");
  }
  const ocrMeta = log.find((c) => c.label === "ocr");
  const ocrLine = JSON.parse(ocrMeta.lines[ocrMeta.lines.length - 1]);
  mkdirSync(reader, { recursive: true });
  copyFileSync(packetHtml, join(reader, "start.html"), 1);
  const pktSha = sha256(readFileSync(packetHtml));
  const rv = child(log, "reader_verify", PIPE, ["reader-verify", "--dir", reader, "--sha256", pktSha]);
  child(log, "install_admin", PIPE, ["install-admin", "--admin", admin]);
  const salts = join(admin, "salts");
  child(log, "commit_packet", PIPE, ["commit", "--label", "kbr-packet", "--file", join(reader, "start.html"), "--salts", salts, "--public", pub]);
  const c4 = child(log, "commit_key", PIPE, ["commit", "--label", "kbr-key", "--file", keyPath, "--salts", salts, "--public", pub]);
  writeFileSync(join(admin, "logs-finish.jsonl"), log.map((c) => JSON.stringify(c)).join("\n") + "\n");
  return { ok: qa.pass && rv.pass, pass: qa.pass && rv.pass, rows: ocrLine.rows, failed: ocrLine.failed, blocked: ocrLine.blocked, images: qa.images, checks: qa.checks, files: rv.files, commitments: c4.commitments, reader: slash(reader) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let line;
  try {
    const f = { mock, "real-prepare": realPrepare, "real-finish": realFinish }[mode] ?? stop("usage");
    line = { step: mode.replace("-", "_"), ...f() };
  } catch (e) {
    line = { ok: false, step: String(mode ?? "none").replace(/[^a-z]/g, "_").slice(0, 20) || "none", code: e instanceof Stop ? e.code : "error" };
    if (mode === "mock") console.error(e);
  }
  let text;
  try { text = L.safeLine(line); } catch { text = L.safeLine({ ok: false, code: "output_policy" }); }
  console.log(text);
  process.exitCode = line.ok ? 0 : 1;
}

// Experiment 3 session generator: scripted 8-turn agent sessions with two images and one text log each.
// Usage: node src/sessions.mjs --split dev|calibration|heldout
// Images reuse the dev2 template builders with split-specific seeds; logs/notes come from a deterministic generator.
// Gold answers and evidence pointers (image question id, log line number) are recorded at generation time.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { outDir } from "./env.mjs";
import { TEMPLATES } from "./families-dev2.mjs";
import { TEMPLATES_V2 } from "./families-v2.mjs";
import { int, pick, rng } from "./families.mjs";
import { sha256, writeJson } from "./common.mjs";

const args = process.argv.slice(2);
const split = args.includes("--split") ? args[args.indexOf("--split") + 1] : "dev";
// Seed bases never overlap pilot sets (101–606, 2000s, 3000s) or each other.
const SPLITS = { dev: { base: 5000, perTemplate: 1 }, calibration: { base: 6000, perTemplate: 2 }, heldout: { base: 7000, perTemplate: 8 } };
if (!SPLITS[split]) throw new Error(`unknown split ${split}`);
const tpl = Object.fromEntries(TEMPLATES.map(([name, , build]) => [name, build]));
// Held-out only: the second half of each template's sessions uses the new layout variants (pre-registration §2).
const tplV2 = Object.fromEntries(TEMPLATES_V2.map(([name, , build]) => [name, build]));

const NOISE = {
  ui: ["INFO [http] GET /api/status 200 12ms", "INFO [cache] hit ratio 0.93", "DEBUG [ui] render frame 16ms", "INFO [auth] token refreshed", "INFO [sync] heartbeat ok", "DEBUG [net] socket keepalive"],
  doc: ["INFO [ledger] posted entry status=ok", "INFO [ledger] reconciled batch status=ok", "DEBUG [ocr] page parsed", "INFO [mail] notice queued status=ok", "INFO [ledger] fx rate cached", "DEBUG [audit] checksum verified"],
  chart: ["- reviewed axis labels, no change", "- legend colors confirmed", "- data export refreshed", "- footnote wording kept", "- gridlines unchanged", "- chart title approved"],
};
const reqId = (r) => `${int(r, 0x1000, 0xffff).toString(16)}${int(r, 0x10, 0xff).toString(16)}`;

// Build ~150 noise lines and insert the key lines at fixed random positions; returns text and key line numbers (1-based).
function makeLog(r, kind, keys) {
  const lines = [];
  for (let i = 0; i < 150; i++) {
    const t = `2026-03-${String(int(r, 10, 28)).padStart(2, "0")}T${String(int(r, 0, 23)).padStart(2, "0")}:${String(int(r, 0, 59)).padStart(2, "0")}:${String(int(r, 0, 59)).padStart(2, "0")}Z`;
    lines.push(kind === "chart" ? pick(r, NOISE[kind]) : `${t} ${pick(r, NOISE[kind])} req=${reqId(r)}`);
  }
  const at = {};
  const used = new Set();
  for (const [name, text] of Object.entries(keys)) {
    let pos;
    do pos = int(r, 10, 140); while (used.has(pos));
    used.add(pos);
    lines[pos] = text;
    at[name] = pos + 1;
  }
  return { text: `${lines.join("\n")}\n`, at };
}

function uiSession(r, seedA, seedB, T = tpl) {
  const A = T["ui-settings-dense"](seedA);
  const B = T["ui-dashboard-dense"](seedB);
  const node = `edge-${int(r, 10, 99)}`;
  const code = `E${int(r, 1000, 9999)}`;
  const rid = reqId(r);
  const toggle = A.questions[0].text.match(/^Is (.+) turned on or off\?$/)[1];
  const extraErrors = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`e${i}`, `2026-03-2${i}T0${i}:1${i}:0${i}Z ERROR [sync] retry scheduled node=edge-${int(r, 10, 99)} req=${reqId(r)}`]));
  const log = makeLog(r, "ui", {
    fail: `2026-03-21T04:12:09Z ERROR [sync] upload failed code=${code} node=${node} req=${rid}`,
    toggle: `2026-03-21T04:12:11Z WARN [settings] change rejected for "${toggle}" (policy lock) req=${reqId(r)}`,
    ...extraErrors,
  });
  return {
    template: "ui-debugging",
    images: [{ key: "A", title: "Device settings screenshot", ...A }, { key: "B", title: "Service dashboard screenshot", ...B }],
    log: { title: "Service error log", ...log },
    turns: [
      { show: "A", type: "immediate-small", q: A.questions[1].text, answers: A.questions[1].answers, evidence: { image: "A", question: "q2" } },
      { show: "log", type: "immediate-log", q: `The log reports an upload failure for node ${node}. What error code is on that line?`, answers: [code], evidence: { log: log.at.fail } },
      { show: "B", type: "immediate", q: B.questions[1].text, answers: B.questions[1].answers, evidence: { image: "B", question: "q2" } },
      { type: "cross", q: "The log mentions a settings change that was rejected. In the settings screenshot, is that setting on or off?", answers: A.questions[0].answers, evidence: { image: "A", question: "q1", log: log.at.toggle } },
      { type: "gist", q: "Which subsystem tag appears on most of the ERROR lines in the log? Answer with the tag only.", answers: ["sync"], evidence: { log: "ERROR lines" } },
      { type: "late-small", q: A.questions[2].text, answers: A.questions[2].answers, evidence: { image: "A", question: "q3" } },
      { type: "late-log", q: `What is the request id (req=) on the log line with error code ${code}?`, answers: [rid], evidence: { log: log.at.fail } },
      { type: "late-small", q: B.questions[2].text, answers: B.questions[2].answers, evidence: { image: "B", question: "q3" } },
    ],
  };
}

function docSession(r, seedA, seedB, T = tpl) {
  const A = T["doc-invoice-dense"](seedA);
  const B = T["doc-memo-dense"](seedB);
  const inv = A.questions[0].answers[0];
  const item = A.questions[1].text.match(/"(.+)"/)[1];
  const amount = A.questions[1].answers[0];
  const batch = `B-${int(r, 1000, 9999)}`;
  const flagReq = reqId(r);
  const log = makeLog(r, "doc", {
    posted: `2026-03-22T09:30:00Z INFO [ledger] posted invoice=${inv} batch=${batch} status=ok req=${reqId(r)}`,
    flag: `2026-03-22T09:30:04Z WARN [ledger] FLAG over_limit amount=${amount} invoice=${inv} req=${flagReq}`,
  });
  return {
    template: "document-review",
    images: [{ key: "A", title: "Supplier invoice scan", ...A }, { key: "B", title: "Operations notice scan", ...B }],
    log: { title: "Ledger processing log", ...log },
    turns: [
      { show: "A", type: "immediate-small", q: A.questions[0].text, answers: A.questions[0].answers, evidence: { image: "A", question: "q1" } },
      { show: "log", type: "immediate-log", q: `Which batch id is on the log line that posted invoice ${inv}?`, answers: [batch], evidence: { log: log.at.posted } },
      { show: "B", type: "immediate", q: B.questions[1].text, answers: B.questions[1].answers, evidence: { image: "B", question: "q2" } },
      { type: "cross", q: "The log flags one amount as over_limit. Which line item on the invoice has that amount? Answer with the item name.", answers: [item], evidence: { image: "A", question: "q2", log: log.at.flag } },
      { type: "gist", q: "What status value appears on most lines of the ledger log? Answer with the status word only.", answers: ["ok"], evidence: { log: "status fields" } },
      { type: "late", q: A.questions[2].text, answers: A.questions[2].answers, evidence: { image: "A", question: "q3" } },
      { type: "late-log", q: "What is the request id (req=) on the over_limit FLAG line of the log?", answers: [flagReq], evidence: { log: log.at.flag } },
      { type: "late-small", q: B.questions[0].text, answers: B.questions[0].answers, evidence: { image: "B", question: "q1" } },
    ],
  };
}

function chartSession(r, seedA, seedB, T = tpl) {
  const A = T["chart-bar12"](seedA);
  const B = T["chart-line-small"](seedB);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const postponed = pick(r, months);
  const deadline = `${int(r, 2, 28)} ${pick(r, months)} 2026`;
  const target = A.questions[0].text.match(/on the (\w+) bar/)[1];
  const actual = A.questions[0].answers[0];
  const mismatch = r() < 0.5;
  const noted = mismatch ? String(Number(actual) + int(r, 11, 90)) : actual;
  const log = makeLog(r, "chart", {
    postponed: `- inspection audit postponed to ${postponed}`,
    noted: `- ${target} inspection count recorded as ${noted}`,
    deadline: `- recalibration deadline: ${deadline}`,
  });
  return {
    template: "report-check",
    images: [{ key: "A", title: "Monthly inspection bar chart", ...A }, { key: "B", title: "Hourly output line chart", ...B }],
    log: { title: "Report review notes", ...log },
    turns: [
      { show: "A", type: "immediate-small", q: A.questions[1].text, answers: A.questions[1].answers, evidence: { image: "A", question: "q2" } },
      { show: "log", type: "immediate-log", q: "According to the review notes, to which month was the inspection audit postponed?", answers: [postponed], evidence: { log: log.at.postponed } },
      { show: "B", type: "immediate", q: B.questions[1].text, answers: B.questions[1].answers, evidence: { image: "B", question: "q2" } },
      { type: "cross", q: `The notes record an inspection count for ${target}. Does it match the value labeled on the ${target} bar in the bar chart? Answer yes or no.`, answers: [mismatch ? "no" : "yes"], evidence: { image: "A", question: "q1", log: log.at.noted } },
      { type: "gist", q: "How many lines in the review notes mention the legend? Answer with a number.", answers: [String((log.text.match(/legend/g) || []).length)], evidence: { log: "legend lines" } },
      { type: "late", q: A.questions[2].text, answers: A.questions[2].answers, evidence: { image: "A", question: "q3" } },
      { type: "late-log", q: "What recalibration deadline is given in the review notes? Answer as day month year.", answers: [deadline], evidence: { log: log.at.deadline } },
      { type: "late-small", q: B.questions[2].text, answers: B.questions[2].answers, evidence: { image: "B", question: "q3" } },
    ],
  };
}

const BUILDERS = [uiSession, docSession, chartSession];
const dir = join(outDir, "sessions", split);
const sessions = [];
for (let t = 0; t < BUILDERS.length; t++) {
  for (let k = 0; k < SPLITS[split].perTemplate; k++) {
    const seed = SPLITS[split].base + t * 100 + k * 2;
    const layout = split === "heldout" && k >= SPLITS[split].perTemplate / 2 ? "v2" : "base";
    const s = BUILDERS[t](rng(seed), seed + 1, seed + 2, layout === "v2" ? tplV2 : tpl);
    const id = `${split}-${s.template}-${k + 1}${layout === "v2" ? "-v2" : ""}`;
    const sdir = join(dir, id);
    mkdirSync(sdir, { recursive: true });
    const images = [];
    for (const img of s.images) {
      const png = await sharp(Buffer.from(img.svg)).removeAlpha().png({ compressionLevel: 9 }).toBuffer();
      const meta = await sharp(png).metadata();
      const file = join(sdir, `${img.key}.png`);
      writeFileSync(file, png);
      images.push({ key: img.key, title: img.title, file: `${id}/${img.key}.png`, width: meta.width, height: meta.height, bytes: png.length, sha256: sha256(png), questions: img.questions });
    }
    writeFileSync(join(sdir, "log.txt"), s.log.text);
    sessions.push({ id, template: s.template, layout, seed, images, log: { title: s.log.title, file: `${id}/log.txt`, lines: s.log.text.split("\n").length - 1, sha256: sha256(Buffer.from(s.log.text)), keyLines: s.log.at }, turns: s.turns });
    console.log(`${id}: ${images.map((i) => `${i.width}x${i.height}`).join(", ")}, log ${s.log.text.length} chars`);
  }
}
writeJson(join(dir, "sessions.json"), { split, purpose: "experiment 3 scripted agent sessions", sessions });

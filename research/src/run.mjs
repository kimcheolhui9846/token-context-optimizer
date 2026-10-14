// Run the thin-slice slots against one OpenAI model. Resumable: completed slots in responses.jsonl are skipped.
// Usage: node src/run.mjs [--set dev1|dev2] [--provider openai|anthropic] [--dry-run] [--run-id <id>] [--limit <n>]
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getSet, loadEnv } from "./env.mjs";
import { readJson, writeJson } from "./common.mjs";
import { cropTransform } from "./transforms.mjs";
import sharp from "sharp";

// Prices from docs/research/image-token-cost-models.md L25-L26 (list prices). Used for the budget guard and cost estimates.
export const PROVIDERS = {
  openai: { model: "gpt-4o-2024-11-20", detail: "high", price: { inputPerM: 2.5, outputPerM: 10 } },
  anthropic: { model: "claude-haiku-4-5-20251001", detail: null, price: { inputPerM: 1, outputPerM: 5 } },
};
const MAX_TOKENS = 40;
// C2 stage 1 (pilot-003): locate the needed region on the whole variant at OpenAI detail low (fixed 85 image tokens).
const LOCATE_SYSTEM = "You locate the part of an image that is needed to answer a question. Reply with JSON only: {\"x0\": n, \"y0\": n, \"x1\": n, \"y1\": n}, coordinates as integers from 0 to 1000 relative to the image width and height. Include the label and the value the question asks about.";
const LOCATE_MARGIN = { frac: 0.06, minPx: 48 };
const SYSTEM = "You answer a question about the attached image. Reply with only the answer value, without explanation or extra words. If the answer cannot be read in the image, reply UNREADABLE.";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const dryRun = flag("--dry-run");
const runId = opt("--run-id", "pilot-001");
const set = getSet(args);
const outDir = set.dir;
const providerName = opt("--provider", "openai");
const provider = PROVIDERS[providerName];
if (!provider) throw new Error(`unknown provider ${providerName}`);
const { model: MODEL, detail: DETAIL, price: PRICE } = provider;
const limit = Number(opt("--limit", "0"));

// GPT-4o high/auto tile rule (same document, L31): fit in 2048x2048, short side to 768, no upscaling.
export function predictedImageTokens(width, height) {
  let w = width, h = height;
  const fit = Math.min(1, 2048 / Math.max(w, h));
  w = Math.floor(w * fit); h = Math.floor(h * fit);
  if (Math.min(w, h) > 768) {
    const s = 768 / Math.min(w, h);
    w = Math.floor(w * s); h = Math.floor(h * s);
  }
  return 85 + 170 * Math.ceil(w / 512) * Math.ceil(h / 512);
}

// Haiku 4.5 standard tier (same document, L54): ceil(w/28) x ceil(h/28), long side <= 1568 and at most 1568 patches.
// The official reference binary-searches the largest fitting size; this linear search over the long side is an approximation.
export function predictedAnthropicTokens(width, height) {
  const patches = (w, h) => Math.ceil(w / 28) * Math.ceil(h / 28);
  const long = Math.max(width, height), ratio = Math.min(width, height) / long;
  if (long <= 1568 && patches(width, height) <= 1568) return patches(width, height);
  for (let L = Math.min(1568, long); L > 0; L--) {
    const short = Math.round(L * ratio);
    if (patches(L, short) <= 1568) return patches(L, short);
  }
  return 0;
}
const predictTokens = (w, h) => (providerName === "anthropic" ? predictedAnthropicTokens(w, h) : predictedImageTokens(w, h));

function shuffle(list, seed) {
  const out = [...list];
  let a = seed;
  const r = () => ((a = (a * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const families = Object.fromEntries(readJson(join(outDir, "families.json")).families.map((f) => [f.id, f]));
const { slots } = readJson(join(outDir, "slots.json"));
const slotKey = (s) => `${s.family}/${s.question}/${s.condition}/${s.arm}`;
const ordered = shuffle(slots, 20261014);

const runDir = join(outDir, "runs", runId);
const responsesFile = join(runDir, "responses.jsonl");
const done = new Set();
let spent = 0;
if (existsSync(responsesFile)) {
  for (const line of readFileSync(responsesFile, "utf8").split("\n").filter(Boolean)) {
    const rec = JSON.parse(line);
    spent += rec.costUsd || 0;
    if (rec.status === "ok") done.add(rec.key);
  }
}

const armFilter = opt("--arm", null);
const todo = ordered.filter((s) => !done.has(slotKey(s)) && (!armFilter || s.arm === armFilter)).slice(0, limit || undefined);
const estimate = (s) => ((predictTokens(s.width, s.height) + 120) * PRICE.inputPerM + MAX_TOKENS * PRICE.outputPerM) / 1e6;
const estTotal = todo.reduce((a, s) => a + estimate(s), 0);
const env = loadEnv();
console.log(`run ${runId}: ${todo.length} slots to run (${done.size} done), estimated upper cost $${estTotal.toFixed(3)}, spent so far $${spent.toFixed(4)}, budget $${env.budgetUsd}`);
if (dryRun) process.exit(0);
const apiKey = providerName === "anthropic" ? env.anthropicKey : env.apiKey;
if (!apiKey) throw new Error(`${providerName === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"} missing (research/.env.local)`);
if (!(env.budgetUsd > 0)) throw new Error("RESEARCH_BUDGET_USD must be set");

writeJson(join(runDir, "config.json"), { runId, set: set.name, provider: providerName, model: MODEL, detail: DETAIL, temperature: 0, maxTokens: MAX_TOKENS, system: SYSTEM, price: PRICE, orderSeed: 20261014, startedAt: new Date().toISOString() });

async function call(slot) {
  const q = families[slot.family].questions.find((x) => x.id === slot.question);
  const b64 = readFileSync(join(outDir, slot.file)).toString("base64");
  if (slot.arm === "C2") return twoStage(slot, q);
  if (providerName === "anthropic") return callAnthropic(q, b64, slot.mime);
  const body = {
    model: MODEL,
    temperature: 0,
    max_tokens: MAX_TOKENS,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: [{ type: "text", text: q.text }, { type: "image_url", image_url: { url: `data:${slot.mime};base64,${b64}`, detail: DETAIL } }] },
    ],
  };
  const attempts = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    const t0 = performance.now();
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
      const latencyMs = Math.round(performance.now() - t0);
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        const u = json.usage || {};
        return { status: "ok", attempts: [...attempts, { attempt, http: res.status, latencyMs }], latencyMs, answer: json.choices?.[0]?.message?.content ?? "", finishReason: json.choices?.[0]?.finish_reason, usage: u, responseModel: json.model, systemFingerprint: json.system_fingerprint ?? null, costUsd: ((u.prompt_tokens || 0) * PRICE.inputPerM + (u.completion_tokens || 0) * PRICE.outputPerM) / 1e6 };
      }
      attempts.push({ attempt, http: res.status, latencyMs, error: json.error?.type || json.error?.code || "http_error" });
      if (res.status !== 429 && res.status < 500) break;
    } catch (e) {
      attempts.push({ attempt, error: e.name || "fetch_error", latencyMs: Math.round(performance.now() - t0) });
    }
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  return { status: "failed", attempts, costUsd: 0 };
}

async function postOpenAI(body) {
  const attempts = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    const t0 = performance.now();
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
      const latencyMs = Math.round(performance.now() - t0);
      const json = await res.json().catch(() => ({}));
      if (res.ok) return { ok: true, json, latencyMs, attempts: [...attempts, { attempt, http: res.status, latencyMs }] };
      attempts.push({ attempt, http: res.status, latencyMs, error: json.error?.type || json.error?.code || "http_error" });
      if (res.status !== 429 && res.status < 500) break;
    } catch (e) {
      attempts.push({ attempt, error: e.name || "fetch_error", latencyMs: Math.round(performance.now() - t0) });
    }
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  return { ok: false, attempts };
}

const costOf = (u) => ((u.prompt_tokens || 0) * PRICE.inputPerM + (u.completion_tokens || 0) * PRICE.outputPerM) / 1e6;

// Two-stage selector: stage 1 asks for a box at detail low; stage 2 answers on the crop at detail high.
// An unparsable or empty box sends the full variant through the arm transform instead (recorded as locate.fallback).
async function twoStage(slot, q) {
  if (providerName !== "openai") throw new Error("C2 is implemented for OpenAI only");
  const variant = readFileSync(join(outDir, slot.file));
  const s1 = await postOpenAI({
    model: MODEL, temperature: 0, max_tokens: 60,
    messages: [{ role: "system", content: LOCATE_SYSTEM }, { role: "user", content: [{ type: "text", text: q.text }, { type: "image_url", image_url: { url: `data:${slot.mime};base64,${variant.toString("base64")}`, detail: "low" } }] }],
  });
  if (!s1.ok) return { status: "failed", stage: 1, attempts: s1.attempts, costUsd: 0 };
  const u1 = s1.json.usage || {};
  const text1 = s1.json.choices?.[0]?.message?.content ?? "";
  let box = null;
  try {
    const m = JSON.parse(text1.slice(text1.indexOf("{"), text1.lastIndexOf("}") + 1));
    const [x0, y0, x1, y1] = [m.x0, m.y0, m.x1, m.y1].map(Number);
    if ([x0, y0, x1, y1].every(Number.isFinite) && x1 > x0 && y1 > y0) {
      const W = slot.width, H = slot.height;
      const mx = Math.max(LOCATE_MARGIN.minPx, LOCATE_MARGIN.frac * W), my = Math.max(LOCATE_MARGIN.minPx, LOCATE_MARGIN.frac * H);
      const left = Math.max(0, Math.floor((x0 / 1000) * W - mx)), top = Math.max(0, Math.floor((y0 / 1000) * H - my));
      const right = Math.min(W, Math.ceil((x1 / 1000) * W + mx)), bottom = Math.min(H, Math.ceil((y1 / 1000) * H + my));
      if (right - left >= 16 && bottom - top >= 16) box = { left, top, width: right - left, height: bottom - top };
    }
  } catch {
    box = null;
  }
  const crop = box ? await cropTransform(variant, box) : await cropTransform(variant, { left: 0, top: 0, width: slot.width, height: slot.height });
  const meta = await sharp(crop.bytes).metadata();
  const s2 = await postOpenAI({
    model: MODEL, temperature: 0, max_tokens: MAX_TOKENS,
    messages: [{ role: "system", content: SYSTEM }, { role: "user", content: [{ type: "text", text: q.text }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${crop.bytes.toString("base64")}`, detail: DETAIL } }] }],
  });
  const ev = slot.evidenceInVariant;
  const covered = box ? ev[0] >= box.left && ev[1] >= box.top && ev[0] + ev[2] <= box.left + box.width && ev[1] + ev[3] <= box.top + box.height : true;
  const locate = { answer: text1, usage: u1, box, fallback: !box, evidenceCovered: covered, cropWidth: meta.width, cropHeight: meta.height, cropBytes: crop.bytes.length, ops: crop.ops };
  if (!s2.ok) return { status: "failed", stage: 2, attempts: [...s1.attempts, ...s2.attempts], locate, costUsd: costOf(u1) };
  const u2 = s2.json.usage || {};
  const usage = { prompt_tokens: (u1.prompt_tokens || 0) + (u2.prompt_tokens || 0), completion_tokens: (u1.completion_tokens || 0) + (u2.completion_tokens || 0), stage1: u1, stage2: u2 };
  return { status: "ok", attempts: [...s1.attempts, ...s2.attempts], latencyMs: s1.latencyMs + s2.latencyMs, answer: s2.json.choices?.[0]?.message?.content ?? "", finishReason: s2.json.choices?.[0]?.finish_reason, usage, locate, responseModel: s2.json.model, systemFingerprint: s2.json.system_fingerprint ?? null, costUsd: costOf(u1) + costOf(u2) };
}

async function callAnthropic(q, b64, mime) {
  const body = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: 0,
    system: SYSTEM,
    messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: mime, data: b64 } }, { type: "text", text: q.text }] }],
  };
  const attempts = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    const t0 = performance.now();
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
      const latencyMs = Math.round(performance.now() - t0);
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        const u = json.usage || {};
        const usage = { prompt_tokens: u.input_tokens, completion_tokens: u.output_tokens, raw: u };
        return { status: "ok", attempts: [...attempts, { attempt, http: res.status, latencyMs }], latencyMs, answer: (json.content || []).filter((c) => c.type === "text").map((c) => c.text).join(""), finishReason: json.stop_reason, usage, responseModel: json.model, systemFingerprint: null, costUsd: ((u.input_tokens || 0) * PRICE.inputPerM + (u.output_tokens || 0) * PRICE.outputPerM) / 1e6 };
      }
      attempts.push({ attempt, http: res.status, latencyMs, error: json.error?.type || "http_error" });
      if (res.status !== 429 && res.status !== 529 && res.status < 500) break;
    } catch (e) {
      attempts.push({ attempt, error: e.name || "fetch_error", latencyMs: Math.round(performance.now() - t0) });
    }
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  return { status: "failed", attempts, costUsd: 0 };
}

let n = 0;
for (const slot of todo) {
  if (spent + estimate(slot) > env.budgetUsd) {
    console.log(`budget guard: stopping before ${slotKey(slot)} (spent $${spent.toFixed(4)})`);
    break;
  }
  const result = await call(slot);
  spent += result.costUsd;
  const rec = { key: slotKey(slot), family: slot.family, domain: slot.domain, question: slot.question, smallText: slot.smallText, condition: slot.condition, arm: slot.arm, width: slot.width, height: slot.height, bytes: slot.bytes, mime: slot.mime, provider: providerName, predictedImageTokens: predictTokens(slot.width, slot.height), fallback: slot.fallback, selection: slot.selection ? { matched: slot.selection.matched, evidenceCovered: slot.selection.evidenceCovered } : undefined, at: new Date().toISOString(), ...result };
  // Two-stage calls: stage 1 is detail low (85 image tokens), stage 2 is the crop at detail high.
  if (result.locate) {
    rec.twoStage = true;
    rec.predictedImageTokens = 85 + predictTokens(result.locate.cropWidth, result.locate.cropHeight);
  }
  appendFileSync(responsesFile, `${JSON.stringify(rec)}\n`);
  n++;
  if (n % 12 === 0 || result.status !== "ok") console.log(`${n}/${todo.length} ${rec.key} ${result.status} spent $${spent.toFixed(4)}`);
}
console.log(`finished: ${n} calls, spent $${spent.toFixed(4)}`);

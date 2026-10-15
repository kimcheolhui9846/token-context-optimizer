// RQ1 accounting sweep: billed image tokens across sizes and aspect ratios for GPT-4o (detail high and low) and Claude Haiku 4.5,
// compared with the published formulas in run.mjs. One minimal call per image (max output 1 token); image tokens are the
// prompt tokens minus a text-only baseline call with the same text. Anthropic also gets a free count_tokens check.
// Usage: node src/rq1-sweep.mjs [--run-id rq1-sweep-001] [--dry-run]
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { loadEnv, outDir } from "./env.mjs";
import { predictedAnthropicTokens, predictedImageTokens } from "./token-formulas.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const runId = opt("--run-id", "rq1-sweep-001");
const dryRun = args.includes("--dry-run");
const env = loadEnv();
const runDir = join(outDir, "rq1-runs", runId);
mkdirSync(runDir, { recursive: true });

const OPENAI_MODEL = "gpt-4o-2024-11-20";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const PRICE = { openai: 2.5, anthropic: 1 }; // $ per M input tokens (verified 2026-10-15)
const TEXT = "Reply with the single letter A.";
const LONG = [256, 512, 768, 1024, 1536, 2048, 3072];
const RATIOS = [[1, 1], [4, 3], [3, 4], [16, 9], [9, 16], [3, 1], [1, 3]];
// Boundary cases around each provider's resize and tile thresholds.
const EDGES = [[512, 512], [513, 513], [768, 768], [769, 769], [1092, 1092], [1568, 1176], [1569, 1177], [2048, 2048], [2049, 1000], [1000, 2049]];

const sizes = [];
for (const L of LONG) for (const [a, b] of RATIOS) {
  const w = a >= b ? L : Math.round((L * a) / b);
  const h = a >= b ? Math.round((L * b) / a) : L;
  sizes.push({ w, h, group: `grid ${a}:${b}` });
}
for (const [w, h] of EDGES) sizes.push({ w, h, group: "edge" });
// Format check: the same sizes as JPEG q75 for the 4:3 row (tokens should not depend on format).
const items = [...sizes.map((s) => ({ ...s, format: "png" })), ...sizes.filter((s) => s.group === "grid 4:3").map((s) => ({ ...s, format: "jpeg" }))];

// Content does not affect billed tokens; a simple grid with text keeps files small and valid.
async function makeImage(w, h, format) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#f4f4f4"/><g stroke="#999" stroke-width="1">${Array.from({ length: 8 }, (_, i) => `<line x1="${(w * i) / 8}" y1="0" x2="${(w * i) / 8}" y2="${h}"/>`).join("")}</g><text x="10" y="${Math.min(40, h - 4)}" font-size="${Math.max(8, Math.min(32, h / 4))}" fill="#222">${w}x${h}</text></svg>`;
  const img = sharp(Buffer.from(svg)).removeAlpha();
  return format === "jpeg" ? img.jpeg({ quality: 75 }).toBuffer() : img.png().toBuffer();
}

const predictedOpenAIHigh = (w, h) => predictedImageTokens(w, h);
const est = items.reduce((a, it) => a + (predictedOpenAIHigh(it.w, it.h) + 85 + 60) * PRICE.openai / 1e6 + (predictedAnthropicTokens(it.w, it.h) + 30) * PRICE.anthropic / 1e6, 0);
console.log(`${items.length} images; estimated cost $${est.toFixed(3)} (plus baselines)`);
if (est > 1) throw new Error("estimated cost above $1; stop");
if (dryRun) process.exit(0);
if (!env.apiKey || !env.anthropicKey) throw new Error("API keys missing");

async function openai(content, detail) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.apiKey}` },
      body: JSON.stringify({ model: OPENAI_MODEL, max_tokens: 1, temperature: 0, messages: [{ role: "user", content }] }),
    });
    const json = await res.json();
    if (res.ok) return json.usage;
    if (json.error?.code === "insufficient_quota" || res.status === 400) throw new Error(`openai ${res.status} ${json.error?.code}: ${json.error?.message}`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
  throw new Error("openai retries exhausted");
}
const anthropic = new Anthropic({ apiKey: env.anthropicKey, maxRetries: 4 });
const aMsg = (content) => [{ role: "user", content }];

const outFile = join(runDir, "rows.jsonl");
const done = new Set(existsSync(outFile) ? readFileSync(outFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).key) : []);
const baseline = {
  openai: (await openai([{ type: "text", text: TEXT }])).prompt_tokens,
  anthropic: (await anthropic.messages.create({ model: ANTHROPIC_MODEL, max_tokens: 1, messages: aMsg([{ type: "text", text: TEXT }]) })).usage.input_tokens,
  anthropicCount: (await anthropic.messages.countTokens({ model: ANTHROPIC_MODEL, messages: aMsg([{ type: "text", text: TEXT }]) })).input_tokens,
};
writeFileSync(join(runDir, "config.json"), `${JSON.stringify({ runId, models: { openai: OPENAI_MODEL, anthropic: ANTHROPIC_MODEL }, text: TEXT, baseline, startedAt: new Date().toISOString() }, null, 2)}\n`);
console.log("baseline", baseline);

for (const it of items) {
  const key = `${it.w}x${it.h}.${it.format}`;
  if (done.has(key)) continue;
  const bytes = await makeImage(it.w, it.h, it.format);
  const mime = it.format === "jpeg" ? "image/jpeg" : "image/png";
  const url = `data:${mime};base64,${bytes.toString("base64")}`;
  const hi = await openai([{ type: "text", text: TEXT }, { type: "image_url", image_url: { url, detail: "high" } }], "high");
  const lo = await openai([{ type: "text", text: TEXT }, { type: "image_url", image_url: { url, detail: "low" } }], "low");
  const aContent = [{ type: "text", text: TEXT }, { type: "image", source: { type: "base64", media_type: mime, data: bytes.toString("base64") } }];
  const am = await anthropic.messages.create({ model: ANTHROPIC_MODEL, max_tokens: 1, messages: aMsg(aContent) });
  const ac = await anthropic.messages.countTokens({ model: ANTHROPIC_MODEL, messages: aMsg(aContent) });
  const row = {
    key, group: it.group, format: it.format, width: it.w, height: it.h, bytes: bytes.length,
    openaiHigh: { measured: hi.prompt_tokens - baseline.openai, predicted: predictedOpenAIHigh(it.w, it.h) },
    openaiLow: { measured: lo.prompt_tokens - baseline.openai, predicted: 85 },
    anthropic: { measured: am.usage.input_tokens - baseline.anthropic, counted: ac.input_tokens - baseline.anthropicCount, predicted: predictedAnthropicTokens(it.w, it.h) },
    costUsd: ((hi.prompt_tokens + lo.prompt_tokens + 2) * PRICE.openai + (am.usage.input_tokens + 1) * PRICE.anthropic) / 1e6,
  };
  appendFileSync(outFile, `${JSON.stringify(row)}\n`);
  console.log(key, row.openaiHigh.measured, row.openaiHigh.predicted, "|", row.openaiLow.measured, "|", row.anthropic.measured, row.anthropic.counted, row.anthropic.predicted);
}

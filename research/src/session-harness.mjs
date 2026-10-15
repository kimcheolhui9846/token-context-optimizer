// Experiment 3 harness: run scripted agent sessions under S0–S4 and record every call's usage.
// Usage: node src/session-harness.mjs --split dev --run-id <id> [--conditions S0,S1,S2,S3,S4] [--dry-run]
// S0 keep everything, S1 compact (simulated), S2 plugin tools, S3 plugin + compact, S4 keep everything with arm-transformed images.
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { basename, join } from "node:path";
import sharp from "sharp";
import { loadEnv, outDir } from "./env.mjs";
import { writeJson } from "./common.mjs";
import { armTransform, cropTransform } from "./transforms.mjs";
import { createOcr, selectWindow } from "./selector.mjs";
import { startPlugin } from "./mcp-client.mjs";
import { checkResume, configFingerprint, sha256File } from "./run-guards.mjs";
import { ANTHROPIC_CACHE, ANTHROPIC_MODEL, ANTHROPIC_PRICE, ANTHROPIC_TOOL_MAX_TOKENS, runSessionAnthropic } from "./session-anthropic.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const split = opt("--split", "dev");
const runId = opt("--run-id", `s3-${split}-001`);
const conditions = opt("--conditions", "S0,S1,S2,S3,S4").split(",");
const dryRun = args.includes("--dry-run");
// --provider anthropic runs the same conditions and rules through session-anthropic.mjs (pre-registration §4).
const providerName = opt("--provider", "openai");
if (!["openai", "anthropic"].includes(providerName)) throw new Error(`unknown provider ${providerName}`);

export const MODEL = "gpt-4o-2024-11-20";
const DETAIL = "high";
const PRICE = { inputPerM: 2.5, outputPerM: 10 }; // list price, docs/research/image-token-cost-models.md L25
const MAX_TOKENS = 60;
const TOOL_ROUNDS = 3;
export const COMPACT_AT = 4000; // threshold kept only for the secondary "would have compacted" count
// 2026-10-15 user decision: S1 and S3 compact on a fixed schedule, after turns 3 and 6, so both conditions lose the same
// history at the same points and differ only in whether artifacts can be retrieved again.
export const COMPACT_AFTER_TURNS = [3, 6];
// Plugin rules added after dev run s3-dev-001 (both fixed before the next run):
// EVICT: image payloads returned by tools are removed from the history once the turn is answered (a text note stays).
// AUTO_ORIGINAL: if a plugin-condition answer is UNREADABLE, the harness sends the original of the image queried last and asks once more.
const EVICT = true;
const AUTO_ORIGINAL = true;
// Rules added after calibration run s3-cal-001 (2026-10-15 user decision, option A; frozen after s3-cal-002):
// THUMBNAIL: query_image_artifact also returns a whole-image overview at detail low (fixed 85 image tokens) so questions
//   about the overall layout do not depend on the crop alone.
// EVICT_AFTER_TURNS: tool images are evicted in batches on the compact schedule instead of every turn, so the cached
//   prefix of the history stays stable between evictions.
const THUMBNAIL = { longSide: 512, detail: "low" };
const EVICT_AFTER_TURNS = COMPACT_AFTER_TURNS;

const SYSTEM = "You are helping a colleague with a work task. Artifacts such as screenshots, document scans and logs arrive during the conversation. Answer each question with only the answer value, without explanation. If the answer cannot be read from what you can see, reply UNREADABLE.";
const SYSTEM_PLUGIN = `${SYSTEM} Artifacts are stored outside the conversation and are referred to by id. Use the tools to look at them: query_text_artifact returns matching log lines with line numbers, query_image_artifact returns a cropped view of the region relevant to your question at full resolution together with a low-resolution overview of the whole image for layout context (small text is not readable in the overview), get_original_image returns the whole original image. If a cropped view does not show the answer, call get_original_image. After using tools, reply with only the answer value.`;
const COMPACT = "Summarize the conversation so far so that the work can continue without it. Keep exact numbers, codes, ids, names and times that were stated. Stay under 250 words.";
const COMPACT_PLUGIN = `${COMPACT} List every artifact id mentioned so the artifacts can be queried again.`;

const TOOLS = [
  { type: "function", function: { name: "query_text_artifact", description: "Return log lines matching a query, with line numbers.", parameters: { type: "object", properties: { artifact_id: { type: "string" }, query: { type: "string", description: "Keywords to search for" } }, required: ["artifact_id", "query"] } } },
  { type: "function", function: { name: "query_image_artifact", description: "Return a cropped view of the image region relevant to the question, at full resolution.", parameters: { type: "object", properties: { artifact_id: { type: "string" }, question: { type: "string", description: "What you need to read in the image" } }, required: ["artifact_id", "question"] } } },
  { type: "function", function: { name: "get_original_image", description: "Return the whole original image.", parameters: { type: "object", properties: { artifact_id: { type: "string" } }, required: ["artifact_id"] } } },
];

const sessionsDir = join(outDir, "sessions", split);
const { sessions } = JSON.parse(readFileSync(join(sessionsDir, "sessions.json"), "utf8"));
const runDir = join(outDir, "session-runs", runId);
mkdirSync(runDir, { recursive: true });
const callsFile = join(runDir, "calls.jsonl");
const env = loadEnv();
let spent = 0;
if (existsSync(callsFile)) for (const l of readFileSync(callsFile, "utf8").split("\n").filter(Boolean)) spent += JSON.parse(l).costUsd || 0;

const usageOf = (u = {}) => ({ prompt: u.prompt_tokens || 0, completion: u.completion_tokens || 0, cached: u.prompt_tokens_details?.cached_tokens ?? null, raw: u });
const costOf = (u) => (u.prompt * PRICE.inputPerM + u.completion * PRICE.outputPerM) / 1e6;
const imagePart = (bytes, mime, detail = DETAIL) => ({ type: "image_url", image_url: { url: `data:${mime};base64,${bytes.toString("base64")}`, detail } });

// Retries 429/5xx and network errors up to 6 times with growing waits (2, 4, 8, 16, 32 s); other HTTP errors stop at once.
async function chat(body) {
  let lastError = "no attempt";
  for (let attempt = 1; attempt <= 6; attempt++) {
    const t0 = performance.now();
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${env.apiKey}` },
        body: JSON.stringify({ model: MODEL, temperature: 0, max_tokens: MAX_TOKENS, ...body }),
        signal: AbortSignal.timeout(120_000),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) return { json, latencyMs: Math.round(performance.now() - t0), attempts: attempt };
      lastError = `http ${res.status} ${json.error?.type || json.error?.code || ""}`.trim();
      // insufficient_quota is an empty balance, not a rate limit: stop at once instead of retrying.
      if ((res.status !== 429 && res.status < 500) || json.error?.code === "insufficient_quota" || json.error?.type === "insufficient_quota") throw new Error(lastError);
    } catch (e) {
      if (/^http 4(?!29)/.test(e.message) || /insufficient_quota/.test(e.message)) throw e;
      lastError = e.message || String(e);
    }
    if (attempt < 6) await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
  }
  throw new Error(`chat failed after 6 attempts: ${lastError}`);
}

function record(rec) {
  spent += rec.costUsd;
  appendFileSync(callsFile, `${JSON.stringify(rec)}\n`);
}

async function runSession(s, condition, plugin, ocr, attemptId) {
  const usesTools = condition === "S2" || condition === "S3";
  const compacts = condition === "S1" || condition === "S3";
  const art = {}; // artifact id -> { kind, bytes, mime, width, height, title, pluginId, lines }
  for (const img of s.images) {
    const bytes = readFileSync(join(sessionsDir, img.file));
    art[`img-${img.key}`] = { kind: "image", bytes, mime: "image/png", width: img.width, height: img.height, title: img.title };
  }
  const logPath = join(sessionsDir, s.log.file);
  art.log = { kind: "text", text: readFileSync(logPath, "utf8"), title: s.log.title, lines: s.log.lines };
  if (usesTools) art.log.pluginId = (await plugin.call("index_artifact", { path: logPath })).artifactId;

  let history = [{ role: "system", content: usesTools ? SYSTEM_PLUGIN : SYSTEM }];
  const turns = [];
  let pendingEvictions = []; // tool image messages waiting for the next batch eviction
  let lastPrompt = 0;
  for (let t = 0; t < s.turns.length; t++) {
    const turn = s.turns[t];
    const content = [];
    if (turn.show) {
      const id = turn.show === "log" ? "log" : `img-${turn.show}`;
      const a = art[id];
      if (usesTools) {
        content.push({ type: "text", text: a.kind === "image" ? `New artifact available: id=${id}, image ${a.width}x${a.height}, "${a.title}".` : `New artifact available: id=${id}, text log, ${a.lines} lines, "${a.title}".` });
      } else if (a.kind === "image") {
        const img = condition === "S4" ? { bytes: (await armTransform(a.bytes)).bytes, mime: "image/jpeg" } : { bytes: a.bytes, mime: a.mime };
        content.push({ type: "text", text: `New artifact: id=${id}, "${a.title}".` }, imagePart(img.bytes, img.mime));
      } else {
        content.push({ type: "text", text: `New artifact: id=${id}, "${a.title}":\n${a.text}` });
      }
    }
    content.push({ type: "text", text: `Question: ${turn.q}` });
    history.push({ role: "user", content });

    let answer = null;
    let toolCalls = 0;
    let originalsRequested = 0;
    let lastImageId = turn.show && turn.show !== "log" ? `img-${turn.show}` : null;
    let autoOriginal = false;
    const toolImageMessages = pendingEvictions;
    for (let round = 0; round <= TOOL_ROUNDS; round++) {
      const allowTools = usesTools && round < TOOL_ROUNDS;
      const { json, latencyMs, attempts } = await chat({ messages: history, ...(usesTools ? { tools: TOOLS, tool_choice: allowTools ? "auto" : "none" } : {}) });
      const u = usageOf(json.usage);
      lastPrompt = u.prompt;
      record({ session: s.id, condition, turn: t + 1, kind: round === 0 ? "turn" : "tool-round", usage: u, costUsd: costOf(u), latencyMs, attempts, model: json.model, fingerprint: json.system_fingerprint ?? null, attemptId });
      const msg = json.choices?.[0]?.message || {};
      if (!msg.tool_calls?.length) { answer = msg.content ?? ""; history.push({ role: "assistant", content: answer }); break; }
      history.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
      const imageResults = [];
      for (const call of msg.tool_calls) {
        toolCalls++;
        let a2 = {};
        try { a2 = JSON.parse(call.function.arguments || "{}"); } catch { a2 = {}; }
        const target = art[a2.artifact_id];
        let text;
        if (!target) text = `No artifact with id ${a2.artifact_id}. Known ids: ${Object.keys(art).join(", ")}.`;
        else if (call.function.name === "query_text_artifact" && target.kind === "text") {
          const q = await plugin.call("query_artifact", { artifactId: target.pluginId, query: String(a2.query || ""), maxTokens: 400, contextLines: 1 });
          text = q.excerpts?.length ? q.excerpts.map((e) => `[${basename(e.sourceMap.path)} lines ${e.sourceMap.startLine}-${e.sourceMap.endLine}]\n${e.text}`).join("\n\n") : `No matching lines (${q.fallbackReason || "none"}).`;
        } else if (call.function.name === "query_image_artifact" && target.kind === "image") {
          target.ocr ??= await ocr.lines(target.bytes);
          const sel = selectWindow(target.ocr, String(a2.question || turn.q), target.width, target.height);
          const out = sel.matched ? await cropTransform(target.bytes, sel.band) : await armTransform(target.bytes);
          const m = await sharp(out.bytes).metadata();
          text = sel.matched ? `Cropped view of ${a2.artifact_id}: region x=${sel.band.left} y=${sel.band.top} w=${sel.band.width} h=${sel.band.height} of ${target.width}x${target.height}; shown at ${m.width}x${m.height}. Image follows.` : `No matching region found in ${a2.artifact_id}; whole image downscaled to ${m.width}x${m.height}. Image follows.`;
          imageResults.push({ label: `Result of ${call.id} (${a2.artifact_id}):`, bytes: out.bytes, mime: "image/jpeg" });
          if (sel.matched) {
            const thumb = await sharp(target.bytes).resize({ width: THUMBNAIL.longSide, height: THUMBNAIL.longSide, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 75, chromaSubsampling: "4:4:4" }).toBuffer();
            imageResults.push({ label: `Overview of ${a2.artifact_id} (low resolution, layout only):`, bytes: thumb, mime: "image/jpeg", detail: THUMBNAIL.detail });
          }
          lastImageId = a2.artifact_id;
        } else if (call.function.name === "get_original_image" && target.kind === "image") {
          originalsRequested++;
          text = `Original image ${a2.artifact_id} (${target.width}x${target.height}). Image follows.`;
          imageResults.push({ label: `Result of ${call.id} (${a2.artifact_id} original):`, bytes: target.bytes, mime: target.mime });
          lastImageId = a2.artifact_id;
        } else text = `Tool ${call.function.name} does not apply to ${a2.artifact_id} (${target.kind}).`;
        history.push({ role: "tool", tool_call_id: call.id, content: text });
      }
      // Chat Completions tool messages carry text only, so returned images follow as one user message.
      if (imageResults.length) {
        history.push({ role: "user", content: imageResults.flatMap((r) => [{ type: "text", text: r.label }, imagePart(r.bytes, r.mime, r.detail)]) });
        toolImageMessages.push({ index: history.length - 1, labels: imageResults.map((r) => r.label) });
      }
    }
    if (usesTools && AUTO_ORIGINAL && /unreadable/i.test(answer || "") && lastImageId && art[lastImageId]) {
      const a = art[lastImageId];
      history.push({ role: "user", content: [{ type: "text", text: `The view was not readable. Here is the original image ${lastImageId}. Question: ${turn.q}` }, imagePart(a.bytes, a.mime)] });
      toolImageMessages.push({ index: history.length - 1, labels: [`original ${lastImageId} sent by the harness`] });
      const { json, latencyMs, attempts } = await chat({ messages: history, tools: TOOLS, tool_choice: "none" });
      const u = usageOf(json.usage);
      lastPrompt = u.prompt;
      record({ session: s.id, condition, turn: t + 1, kind: "auto-original", usage: u, costUsd: costOf(u), latencyMs, attempts, model: json.model, fingerprint: json.system_fingerprint ?? null, attemptId });
      answer = json.choices?.[0]?.message?.content ?? "";
      history.push({ role: "assistant", content: answer });
      autoOriginal = true;
      originalsRequested++;
    }
    if (usesTools && EVICT && EVICT_AFTER_TURNS.includes(t + 1)) {
      for (const m of pendingEvictions) history[m.index] = { role: "user", content: `[Image results were shown here and removed after use: ${m.labels.join("; ")}]` };
      pendingEvictions = [];
    }
    turns.push({ turn: t + 1, type: turn.type, question: turn.q, gold: turn.answers, answer, toolCalls, originalsRequested, autoOriginal });

    turns[turns.length - 1].thresholdExceeded = lastPrompt > COMPACT_AT;
    if (compacts && COMPACT_AFTER_TURNS.includes(t + 1) && t < s.turns.length - 1) {
      const { json, latencyMs, attempts } = await chat({ max_tokens: 400, messages: [...history, { role: "user", content: usesTools ? COMPACT_PLUGIN : COMPACT }] });
      const u = usageOf(json.usage);
      record({ session: s.id, condition, turn: t + 1, kind: "compact", usage: u, costUsd: costOf(u), latencyMs, attempts, model: json.model, fingerprint: json.system_fingerprint ?? null, attemptId });
      const summary = json.choices?.[0]?.message?.content ?? "";
      history = [history[0], { role: "user", content: `Summary of the earlier conversation:\n${summary}` }, { role: "assistant", content: "Understood." }];
      turns[turns.length - 1].compactedAfter = true;
      turns[turns.length - 1].summary = summary;
    }
  }
  return turns;
}

console.log(`run ${runId}: split ${split}, ${sessions.length} sessions x ${conditions.join(",")}; spent so far $${spent.toFixed(4)}, budget $${env.budgetUsd}`);
if (dryRun) process.exit(0);
if (providerName === "openai" && !env.apiKey) throw new Error("OPENAI_API_KEY missing");
if (providerName === "anthropic" && !env.anthropicKey) throw new Error("ANTHROPIC_API_KEY missing");
// Resume guard (PR #33 review): conditions may be run in parts, but model, prompts, rules and inputs must not change.
const providerSettings = providerName === "anthropic" ? { provider: "anthropic", model: ANTHROPIC_MODEL, price: ANTHROPIC_PRICE, cache: ANTHROPIC_CACHE, detail: null, toolMaxTokens: ANTHROPIC_TOOL_MAX_TOKENS } : { provider: "openai", model: MODEL, price: PRICE, cache: { readFactor: 0.5, writeFactor: 1 }, detail: DETAIL };
const settings = { split, model: MODEL, detail: DETAIL, maxTokens: MAX_TOKENS, toolRounds: TOOL_ROUNDS, compactAt: COMPACT_AT, compactAfterTurns: COMPACT_AFTER_TURNS, evict: EVICT, evictAfterTurns: EVICT_AFTER_TURNS, thumbnail: THUMBNAIL, autoOriginal: AUTO_ORIGINAL, system: SYSTEM, systemPlugin: SYSTEM_PLUGIN, compact: COMPACT, compactPlugin: COMPACT_PLUGIN, price: PRICE, sessionsSha256: sha256File(join(sessionsDir, "sessions.json")) , ...providerSettings };
const fingerprint = configFingerprint(settings);
const configPath = join(runDir, "config.json");
if (checkResume(configPath, fingerprint) === "new") writeJson(configPath, { runId, ...settings, fingerprint, startedAt: new Date().toISOString() });
else appendFileSync(join(runDir, "resumes.jsonl"), `${JSON.stringify({ resumedAt: new Date().toISOString(), conditions })}
`);
const plugin = await startPlugin({ allowedRoots: [join(outDir, "sessions")] });
const ocr = await createOcr();
try {
  for (const s of sessions) {
    for (const condition of conditions) {
      const file = join(runDir, `${s.id}.${condition}.json`);
      if (existsSync(file)) continue;
      if (spent > env.budgetUsd - 1) { console.log(`budget guard: stop (spent $${spent.toFixed(4)})`); process.exit(0); }
      const before = spent;
      // Each attempt has an id; summaries count only the calls of the attempt that produced the result file.
      const attemptId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const turns = providerName === "anthropic"
        ? await runSessionAnthropic(s, condition, { apiKey: env.anthropicKey, maxTokens: MAX_TOKENS, compactAt: COMPACT_AT, prompts: { system: SYSTEM, systemPlugin: SYSTEM_PLUGIN, compact: COMPACT, compactPlugin: COMPACT_PLUGIN }, rules: { toolRounds: TOOL_ROUNDS, compactAfterTurns: COMPACT_AFTER_TURNS, evict: EVICT, evictAfterTurns: EVICT_AFTER_TURNS, autoOriginal: AUTO_ORIGINAL, thumbnail: THUMBNAIL }, sessionsDir, record, plugin, ocr }, attemptId)
        : await runSession(s, condition, plugin, ocr, attemptId);
      writeJson(file, { session: s.id, template: s.template, condition, attemptId, turns });
      console.log(`${s.id} ${condition}: $${(spent - before).toFixed(4)} (total $${spent.toFixed(4)})`);
    }
  }
} finally {
  plugin.close();
  await ocr.terminate();
}
console.log(`finished: spent $${spent.toFixed(4)}`);

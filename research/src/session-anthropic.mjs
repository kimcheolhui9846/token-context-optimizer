// Experiment 3, Anthropic path (pre-registration §4): the same conditions and plugin rules as the OpenAI path in
// session-harness.mjs, written for the Messages API tool-use format through the official SDK.
// Differences forced by the API: tool results carry images inside tool_result blocks; there is no detail setting, so the
// overview is a <=512 px image billed by patches; prompt caching is explicit (top-level automatic cache_control, same rule
// for every condition).
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { armTransform, cropTransform } from "./transforms.mjs";
import { selectWindow } from "./selector.mjs";

export const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
// Prices: $1 / $5 per MTok; cache writes 1.25x and cache reads 0.1x the input price (claude-api skill reference).
export const ANTHROPIC_PRICE = { inputPerM: 1, outputPerM: 5 };
export const ANTHROPIC_CACHE = { readFactor: 0.1, writeFactor: 1.25 };
// Dev check s3-dev-haiku-001: Haiku writes a short preamble before a tool call, and with the shared 60-token cap most tool
// rounds stopped at max_tokens with the tool input cut off. Tool-enabled calls on this path get 512 output tokens; the
// answer instruction (value only) is unchanged, and S0/S1/S4 keep the shared cap.
export const ANTHROPIC_TOOL_MAX_TOKENS = 512;

const TOOLS = [
  { name: "query_text_artifact", description: "Return log lines matching a query, with line numbers.", input_schema: { type: "object", properties: { artifact_id: { type: "string" }, query: { type: "string", description: "Keywords to search for" } }, required: ["artifact_id", "query"] } },
  { name: "query_image_artifact", description: "Return a cropped view of the image region relevant to the question, at full resolution.", input_schema: { type: "object", properties: { artifact_id: { type: "string" }, question: { type: "string", description: "What you need to read in the image" } }, required: ["artifact_id", "question"] } },
  { name: "get_original_image", description: "Return the whole original image.", input_schema: { type: "object", properties: { artifact_id: { type: "string" } }, required: ["artifact_id"] } },
];

const img = (bytes, mime) => ({ type: "image", source: { type: "base64", media_type: mime, data: bytes.toString("base64") } });
const textOf = (content) => content.filter((c) => c.type === "text").map((c) => c.text).join("");

/** ctx: { apiKey, maxTokens, prompts: {system, systemPlugin, compact, compactPlugin}, rules: {toolRounds, compactAfterTurns,
 *  evict, evictAfterTurns, autoOriginal, thumbnail}, sessionsDir, record(rec), plugin, ocr } */
export async function runSessionAnthropic(s, condition, ctx, attemptId) {
  const client = (ctx.client ??= new Anthropic({ apiKey: ctx.apiKey, maxRetries: 4, timeout: 120_000 }));
  const { prompts, rules } = ctx;
  const usesTools = condition === "S2" || condition === "S3";
  const compacts = condition === "S1" || condition === "S3";
  const art = {};
  for (const im of s.images) art[`img-${im.key}`] = { kind: "image", bytes: readFileSync(join(ctx.sessionsDir, im.file)), mime: "image/png", width: im.width, height: im.height, title: im.title };
  const logPath = join(ctx.sessionsDir, s.log.file);
  art.log = { kind: "text", text: readFileSync(logPath, "utf8"), title: s.log.title, lines: s.log.lines };
  if (usesTools) art.log.pluginId = (await ctx.plugin.call("index_artifact", { path: logPath })).artifactId;

  const system = usesTools ? prompts.systemPlugin : prompts.system;
  let messages = [];
  const turns = [];
  let pending = []; // { msgIndex, blockPath } image blocks waiting for the next batch eviction
  let lastPrompt = 0;

  const call = async (extra, kind, turnNo) => {
    const t0 = performance.now();
    const msg = await client.messages.create({ model: ANTHROPIC_MODEL, max_tokens: usesTools ? ANTHROPIC_TOOL_MAX_TOKENS : ctx.maxTokens, temperature: 0, system, messages, cache_control: { type: "ephemeral" }, ...(usesTools ? { tools: TOOLS } : {}), ...extra });
    const u = msg.usage || {};
    const usage = { prompt: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0), completion: u.output_tokens || 0, cached: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0, raw: u };
    lastPrompt = usage.prompt;
    ctx.record({ session: s.id, condition, turn: turnNo, kind, usage, costUsd: (usage.prompt * ANTHROPIC_PRICE.inputPerM + usage.completion * ANTHROPIC_PRICE.outputPerM) / 1e6, latencyMs: Math.round(performance.now() - t0), attempts: 1, model: msg.model, fingerprint: null, stopReason: msg.stop_reason, attemptId });
    return msg;
  };

  for (let t = 0; t < s.turns.length; t++) {
    const turn = s.turns[t];
    const content = [];
    if (turn.show) {
      const id = turn.show === "log" ? "log" : `img-${turn.show}`;
      const a = art[id];
      if (usesTools) content.push({ type: "text", text: a.kind === "image" ? `New artifact available: id=${id}, image ${a.width}x${a.height}, "${a.title}".` : `New artifact available: id=${id}, text log, ${a.lines} lines, "${a.title}".` });
      else if (a.kind === "image") {
        const im = condition === "S4" ? { bytes: (await armTransform(a.bytes)).bytes, mime: "image/jpeg" } : { bytes: a.bytes, mime: a.mime };
        content.push({ type: "text", text: `New artifact: id=${id}, "${a.title}".` }, img(im.bytes, im.mime));
      } else content.push({ type: "text", text: `New artifact: id=${id}, "${a.title}":\n${a.text}` });
    }
    content.push({ type: "text", text: `Question: ${turn.q}` });
    messages.push({ role: "user", content });

    let answer = null, toolCalls = 0, originalsRequested = 0, autoOriginal = false;
    let lastImageId = turn.show && turn.show !== "log" ? `img-${turn.show}` : null;
    for (let round = 0; round <= rules.toolRounds; round++) {
      const allowTools = usesTools && round < rules.toolRounds;
      const msg = await call(usesTools ? { tool_choice: { type: allowTools ? "auto" : "none" } } : {}, round === 0 ? "turn" : "tool-round", t + 1);
      messages.push({ role: "assistant", content: msg.content });
      const uses = msg.content.filter((c) => c.type === "tool_use");
      if (!uses.length) { answer = textOf(msg.content); break; }
      const results = [];
      for (const use of uses) {
        toolCalls++;
        const a2 = use.input || {};
        const target = art[a2.artifact_id];
        const blocks = [];
        if (!target) blocks.push({ type: "text", text: `No artifact with id ${a2.artifact_id}. Known ids: ${Object.keys(art).join(", ")}.` });
        else if (use.name === "query_text_artifact" && target.kind === "text") {
          const q = await ctx.plugin.call("query_artifact", { artifactId: target.pluginId, query: String(a2.query || ""), maxTokens: 400, contextLines: 1 });
          blocks.push({ type: "text", text: q.excerpts?.length ? q.excerpts.map((e) => `[${basename(e.sourceMap.path)} lines ${e.sourceMap.startLine}-${e.sourceMap.endLine}]\n${e.text}`).join("\n\n") : `No matching lines (${q.fallbackReason || "none"}).` });
        } else if (use.name === "query_image_artifact" && target.kind === "image") {
          target.ocr ??= await ctx.ocr.lines(target.bytes);
          const sel = selectWindow(target.ocr, String(a2.question || turn.q), target.width, target.height);
          const out = sel.matched ? await cropTransform(target.bytes, sel.band) : await armTransform(target.bytes);
          const m = await sharp(out.bytes).metadata();
          blocks.push({ type: "text", text: sel.matched ? `Cropped view of ${a2.artifact_id}: region x=${sel.band.left} y=${sel.band.top} w=${sel.band.width} h=${sel.band.height} of ${target.width}x${target.height}; shown at ${m.width}x${m.height}.` : `No matching region found in ${a2.artifact_id}; whole image downscaled to ${m.width}x${m.height}.` }, img(out.bytes, "image/jpeg"));
          if (sel.matched) {
            const thumb = await sharp(target.bytes).resize({ width: rules.thumbnail.longSide, height: rules.thumbnail.longSide, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 75, chromaSubsampling: "4:4:4" }).toBuffer();
            blocks.push({ type: "text", text: `Overview of ${a2.artifact_id} (low resolution, layout only):` }, img(thumb, "image/jpeg"));
          }
          lastImageId = a2.artifact_id;
        } else if (use.name === "get_original_image" && target.kind === "image") {
          originalsRequested++;
          blocks.push({ type: "text", text: `Original image ${a2.artifact_id} (${target.width}x${target.height}).` }, img(target.bytes, target.mime));
          lastImageId = a2.artifact_id;
        } else blocks.push({ type: "text", text: `Tool ${use.name} does not apply to ${a2.artifact_id} (${target.kind}).` });
        results.push({ type: "tool_result", tool_use_id: use.id, content: blocks });
      }
      messages.push({ role: "user", content: results });
      if (results.some((r) => r.content.some((b) => b.type === "image"))) pending.push(messages.length - 1);
    }
    if (usesTools && rules.autoOriginal && /unreadable/i.test(answer || "") && lastImageId && art[lastImageId]) {
      const a = art[lastImageId];
      messages.push({ role: "user", content: [{ type: "text", text: `The view was not readable. Here is the original image ${lastImageId}. Question: ${turn.q}` }, img(a.bytes, a.mime)] });
      pending.push(messages.length - 1);
      const msg = await call({ tool_choice: { type: "none" } }, "auto-original", t + 1);
      messages.push({ role: "assistant", content: msg.content });
      answer = textOf(msg.content);
      autoOriginal = true;
      originalsRequested++;
    }
    if (usesTools && rules.evict && rules.evictAfterTurns.includes(t + 1)) {
      const note = { type: "text", text: "[Image removed after use; it can be requested again by artifact id.]" };
      for (const i of pending) {
        messages[i] = { role: "user", content: messages[i].content.map((b) => (b.type === "image" ? note : b.type === "tool_result" ? { ...b, content: b.content.map((c) => (c.type === "image" ? note : c)) } : b)) };
      }
      pending = [];
    }
    turns.push({ turn: t + 1, type: turn.type, question: turn.q, gold: turn.answers, answer, toolCalls, originalsRequested, autoOriginal, thresholdExceeded: lastPrompt > ctx.compactAt });
    if (compacts && rules.compactAfterTurns.includes(t + 1) && t < s.turns.length - 1) {
      messages.push({ role: "user", content: usesTools ? prompts.compactPlugin : prompts.compact });
      const msg = await call({ max_tokens: 400, ...(usesTools ? { tool_choice: { type: "none" } } : {}) }, "compact", t + 1);
      const summary = textOf(msg.content);
      messages = [{ role: "user", content: `Summary of the earlier conversation:\n${summary}` }, { role: "assistant", content: "Understood." }];
      pending = [];
      turns[turns.length - 1].compactedAfter = true;
      turns[turns.length - 1].summary = summary;
    }
  }
  return turns;
}

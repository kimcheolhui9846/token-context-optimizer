// ko-blind-reader: pure functions (protocol research/plans/2026-11-25-ko-blind-reader-protocol.md, sections 5, 6, 7, 8).
// No file or network access (node:crypto only, for commitments), so the scorer can be copied into the admin folder as is.
// The functions marked INLINED are copied by source text into the reader page (one code base for the page and the scorer);
// they must not refer to anything outside the INLINED set.

// ------------------------------------------------------------------ INLINED: value normalization (protocol 6.1)
export function normalizeValue(qtype, raw) {
  if (typeof raw !== "string") return null;
  const ws = [9, 10, 11, 12, 13, 32, 133, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288];
  const s = [...raw.normalize("NFKC")].filter((ch) => !ws.includes(ch.codePointAt(0))).join("");
  if (!s) return null;
  let m;
  if (qtype === "time") {
    let h, mi;
    if ((m = /^([0-9]{1,2}):([0-9]{2})$/.exec(s))) { h = Number(m[1]); mi = Number(m[2]); }
    else if ((m = /^([0-9]{1,2})시([0-9]{1,2})분$/.exec(s))) { h = Number(m[1]); mi = Number(m[2]); }
    else if ((m = /^([0-9]{1,2})시$/.exec(s))) { h = Number(m[1]); mi = 0; }
    else return null;
    if (h > 23 || mi > 59) return null;
    return `${h}:${String(mi).padStart(2, "0")}`;
  }
  if (qtype === "count" || qtype === "pages") {
    m = (qtype === "count" ? /^([0-9]{1,4})명?$/ : /^([0-9]{1,4})쪽?$/).exec(s);
    if (!m) return null;
    const n = Number(m[1]);
    return n >= 1 ? String(n) : null;
  }
  return null;
}

// ------------------------------------------------------------------ INLINED: canonical JSON and SHA-256 (protocol 5.5)
export function canonicalJson(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : canonicalJson(x))).join(",")}]`;
  return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(",")}}`;
}

export function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text));
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const len = bytes.length;
  const total = Math.ceil((len + 9) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[len] = 0x80;
  const bits = len * 8;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, Math.floor(bits / 0x100000000));
  dv.setUint32(total - 4, bits >>> 0);
  const w = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  return H.map((x) => x.toString(16).padStart(8, "0")).join("");
}

export function packetHash(p) {
  return sha256Hex(canonicalJson({ format: p.format, packetId: p.packetId, practice: p.practice, items: p.items }));
}

export function responseDigest(r) {
  const rest = {};
  for (const k of Object.keys(r)) if (k !== "digest") rest[k] = r[k];
  return sha256Hex(canonicalJson(rest));
}

// ------------------------------------------------------------------ INLINED: reader state machine (protocol 5.2-5.5)
export function stepError(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

export function initState(payload) {
  return {
    phase: "start", packetId: payload.packetId, packetHash: payload.packetHash, n: payload.items.length, adminMaterialSeen: null,
    practice: { column: null, value: null, valueUnknown: false, checked: false },
    items: payload.items.map((it) => ({ pos: it.pos, displayed: it.image !== null, reached: false, skipped: false, column: null, value: null, valueUnknown: false })),
    index: 0, pending: null, status: null, final: null,
  };
}

export function enterItem(s, i) {
  s.index = i;
  s.pending = null;
  const it = s.items[i];
  it.reached = true;
  if (!it.displayed) { it.column = "unknown"; it.value = null; it.valueUnknown = true; }
}

export function answerComplete(a) {
  return a.column !== null && (a.valueUnknown === true || (typeof a.value === "string" && a.value.trim() !== ""));
}

export function buildResponse(s, kind, status) {
  const position = kind === "final" ? (status === "completed" ? s.n + 1 : s.index + 1) : s.index + 1;
  const items = s.items.map((it) => {
    const keep = kind === "final" || it.pos < position;
    return keep
      ? { pos: it.pos, displayed: it.displayed, reached: it.reached, skipped: it.skipped, column: it.column, value: it.value, valueUnknown: it.valueUnknown }
      : { pos: it.pos, displayed: it.displayed, reached: false, skipped: false, column: null, value: null, valueUnknown: false };
  });
  const r = { format: "kbr-response-1", kind, packetId: s.packetId, packetHash: s.packetHash, status: kind === "final" ? status : null, adminMaterialSeen: s.adminMaterialSeen, position, items };
  r.digest = responseDigest(r);
  return r;
}

export function step(state, action) {
  const ACTIONS = ["selfReport", "begin", "toPractice", "practiceSet", "practiceCheck", "toItems", "set", "next", "skipRequest", "skipConfirm",
    "abortRequest", "abortConfirm", "finalizeRequest", "finalizeConfirm", "cancel"];
  if (state.phase === "done") throw stepError("locked");
  if (!action || !ACTIONS.includes(action.type)) throw stepError("unknown_action");
  const s = JSON.parse(JSON.stringify(state));
  const need = (...phases) => { if (!phases.includes(s.phase)) throw stepError("phase"); };
  const apply = (a, x) => {
    if ("column" in x) {
      if (!["L", "R", "unknown", null].includes(x.column)) throw stepError("value");
      a.column = x.column;
    }
    if ("value" in x) {
      if (x.value !== null && (typeof x.value !== "string" || x.value.length > 100)) throw stepError("value");
      a.value = x.value;
      if (typeof x.value === "string" && x.value.trim() !== "") a.valueUnknown = false;
    }
    if ("valueUnknown" in x) {
      a.valueUnknown = x.valueUnknown === true;
      if (a.valueUnknown) a.value = null;
    }
  };
  const advance = () => {
    if (s.index + 1 >= s.n) { s.index = s.n; s.pending = null; s.phase = "review"; }
    else enterItem(s, s.index + 1);
  };
  switch (action.type) {
    case "selfReport":
      need("start");
      if (!["yes", "no"].includes(action.value)) throw stepError("value");
      s.adminMaterialSeen = action.value;
      return s;
    case "begin":
      need("start");
      if (!s.adminMaterialSeen) throw stepError("self_report");
      s.phase = "guide";
      return s;
    case "toPractice":
      need("guide");
      s.phase = "practice";
      return s;
    case "practiceSet":
      need("practice");
      apply(s.practice, action);
      return s;
    case "practiceCheck":
      need("practice");
      if (!answerComplete(s.practice)) throw stepError("incomplete");
      s.practice.checked = true;
      return s;
    case "toItems":
      need("practice");
      if (!s.practice.checked) throw stepError("incomplete");
      s.phase = "item";
      enterItem(s, 0);
      return s;
    case "set": {
      need("item");
      const cur = s.items[s.index];
      if (("pos" in action && action.pos !== cur.pos) || !cur.displayed) throw stepError("fixed");
      apply(cur, action);
      s.pending = null;
      return s;
    }
    case "next":
      need("item");
      if (!answerComplete(s.items[s.index])) throw stepError("incomplete");
      advance();
      return s;
    case "skipRequest":
      need("item");
      s.pending = "skip";
      return s;
    case "skipConfirm": {
      need("item");
      if (s.pending !== "skip") throw stepError("no_request");
      Object.assign(s.items[s.index], { skipped: true, column: null, value: null, valueUnknown: false });
      advance();
      return s;
    }
    case "abortRequest":
      need("item", "review");
      s.pending = "abort";
      return s;
    case "abortConfirm":
      need("item", "review");
      if (s.pending !== "abort") throw stepError("no_request");
      if (s.phase === "item") Object.assign(s.items[s.index], { reached: false, skipped: false, column: null, value: null, valueUnknown: false });
      s.status = "aborted";
      s.final = buildResponse(s, "final", "aborted");
      s.phase = "done";
      s.pending = null;
      return s;
    case "finalizeRequest":
      need("review");
      s.pending = "finalize";
      return s;
    case "finalizeConfirm":
      need("review");
      if (s.pending !== "finalize") throw stepError("no_request");
      s.status = "completed";
      s.final = buildResponse(s, "final", "completed");
      s.phase = "done";
      s.pending = null;
      return s;
    case "cancel":
      s.pending = null;
      return s;
    default:
      throw stepError("unknown_action");
  }
}

export function finalResponse(state) {
  if (state.phase !== "done" || !state.final) throw stepError("not_final");
  return state.final;
}

export function interimResponse(state) {
  if (state.phase !== "item") throw stepError("phase");
  return buildResponse(state, "interim", null);
}

export function resumeState(payload, im) {
  if (!im || typeof im !== "object" || im.format !== "kbr-response-1") throw stepError("interim_format");
  if (im.kind !== "interim") throw stepError("interim_kind");
  if (im.packetId !== payload.packetId || im.packetHash !== payload.packetHash || packetHash(payload) !== payload.packetHash) throw stepError("interim_packet");
  if (im.digest !== responseDigest(im)) throw stepError("interim_digest");
  const n = payload.items.length;
  if (!Array.isArray(im.items) || im.items.length !== n || im.items.some((x, i) => !x || x.pos !== i + 1)) throw stepError("interim_items");
  if (!Number.isInteger(im.position) || im.position < 1 || im.position > n) throw stepError("interim_items");
  if (!["yes", "no"].includes(im.adminMaterialSeen)) throw stepError("interim_items");
  const s = initState(payload);
  s.adminMaterialSeen = im.adminMaterialSeen;
  s.practice.checked = true;
  for (let i = 0; i < im.position - 1; i++) {
    const a = im.items[i];
    if (a.displayed !== s.items[i].displayed) throw stepError("interim_items");
    Object.assign(s.items[i], { reached: a.reached === true, skipped: a.skipped === true, column: a.column, value: a.value, valueUnknown: a.valueUnknown === true });
  }
  s.phase = "item";
  enterItem(s, im.position - 1);
  return s;
}

/** Names of the functions copied into the reader page, in definition order. */
export const INLINED = ["normalizeValue", "canonicalJson", "sha256Hex", "packetHash", "responseDigest", "stepError", "initState", "enterItem", "answerComplete", "buildResponse", "step", "finalResponse", "interimResponse", "resumeState"];

// ------------------------------------------------------------------ response validation and scoring (protocol 6.2, 6.3)
const METHODS = ["W1", "W4", "W5"];

export function validateResponse(resp, key) {
  const bad = (code) => ({ ok: false, code });
  if (!key || key.format !== "kbr-key-1" || !Array.isArray(key.items)) return bad("key_format");
  if (!resp || typeof resp !== "object" || Array.isArray(resp) || resp.format !== "kbr-response-1") return bad("format");
  if (resp.kind !== "final") return bad("kind");
  if (resp.packetId !== key.packetId) return bad("packet_id");
  if (resp.packetHash !== key.packetHash) return bad("packet_hash");
  if (typeof resp.digest !== "string" || resp.digest !== responseDigest(resp)) return bad("digest");
  if (!Array.isArray(resp.items)) return bad("items");
  const pos = resp.items.map((x) => (x && typeof x === "object" ? x.pos : undefined));
  if (new Set(pos).size !== pos.length) return bad("duplicate_pos");
  const n = key.items.length;
  if (pos.length !== n || pos.some((p, i) => p !== i + 1)) return bad("items");
  const allowedKeys = ["format", "kind", "packetId", "packetHash", "status", "adminMaterialSeen", "position", "items", "digest"].sort().join(",");
  if (Object.keys(resp).sort().join(",") !== allowedKeys) return bad("field");
  if (!["completed", "aborted"].includes(resp.status) || !["yes", "no"].includes(resp.adminMaterialSeen) || !Number.isInteger(resp.position)) return bad("field");
  const itemKeys = ["column", "displayed", "pos", "reached", "skipped", "value", "valueUnknown"].join(",");
  for (let i = 0; i < n; i++) {
    const it = resp.items[i];
    if (Object.keys(it).sort().join(",") !== itemKeys) return bad("field");
    if (typeof it.displayed !== "boolean" || typeof it.reached !== "boolean" || typeof it.skipped !== "boolean" || typeof it.valueUnknown !== "boolean") return bad("field");
    if (!["L", "R", "unknown", null].includes(it.column)) return bad("field");
    if (it.value !== null && (typeof it.value !== "string" || it.value.length > 100)) return bad("field");
    if (it.displayed !== key.items[i].displayed) return bad("field");
  }
  return { ok: true };
}

export function scoreResponse(resp, key) {
  const methods = {};
  for (const m of METHODS) methods[m] = { assigned: 0, answered: 0, both: 0, columnOnly: 0, valueOnly: 0, neither: 0, unknownColumn: 0, unknownValue: 0, unknownAny: 0, noDisplay: 0, skipped: 0, notReached: 0 };
  const items = resp.items.map((it, i) => {
    const k = key.items[i];
    const m = methods[k.method];
    m.assigned++;
    let category, columnCorrect = false, valueCorrect = false;
    if (!it.reached) category = "notReached";
    else if (it.skipped) category = "skipped";
    else if (!k.displayed) category = "noDisplay";
    else {
      columnCorrect = it.column === k.side;
      valueCorrect = !it.valueUnknown && normalizeValue(k.qtype, it.value ?? "") === k.answer;
      category = columnCorrect && valueCorrect ? "both" : columnCorrect ? "columnOnly" : valueCorrect ? "valueOnly" : "neither";
      m.answered++;
      if (it.column === "unknown") m.unknownColumn++;
      if (it.valueUnknown) m.unknownValue++;
      if (it.column === "unknown" || it.valueUnknown) m.unknownAny++;
    }
    m[category]++;
    return { pos: it.pos, method: k.method, category, columnCorrect, valueCorrect };
  });
  return { format: "kbr-score-1", packetId: resp.packetId, status: resp.status, blindInvalid: resp.adminMaterialSeen === "yes", items, methods };
}

export function scoreTable(score, meta) {
  const L = [];
  L.push("# 한국어 표 1인 눈가림 판독 파일럿 · 로컬 점수표");
  L.push("");
  L.push(`- 패킷 ${score.packetId}, 응답 상태 ${score.status === "completed" ? "완료" : "중단"}${score.blindInvalid ? ", **눈가림 무효(관리자 자료 열람 표시)**" : ""}`);
  L.push(`- 고정 응답 SHA-256 ${meta.responseSha256}`);
  L.push("- 1인 결과다. 건수만 쓰며 유의성·일반화·W5 채택 판정을 하지 않는다. 독자는 방법을 아는 운영자이고 문항 난이도 차이가 섞인다.");
  L.push("");
  L.push("| 방식 | 배정 | 응답 | 열·값 모두 정답(주지표) | 열만 정답 | 값만 정답 | 둘 다 오답 | 판단 불가(열 또는 값) | 열 판단 불가 | 값 판단 불가 | 미표시 | 건너뜀 | 미도달 |");
  L.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const m of METHODS) {
    const x = score.methods[m];
    L.push(`| ${m} | ${x.assigned} | ${x.answered} | ${x.both} / ${x.assigned} | ${x.columnOnly} | ${x.valueOnly} | ${x.neither} | ${x.unknownAny} | ${x.unknownColumn} | ${x.unknownValue} | ${x.noDisplay} | ${x.skipped} | ${x.notReached} |`);
  }
  L.push("");
  L.push("| 순서 | 방식 | 분류 | 열 | 값 |");
  L.push("|---|---|---|---|---|");
  for (const it of score.items) L.push(`| ${it.pos} | ${it.method} | ${it.category} | ${it.columnCorrect ? "정답" : "-"} | ${it.valueCorrect ? "정답" : "-"} |`);
  return `${L.join("\n")}\n`;
}

// ------------------------------------------------------------------ order and balance (protocol 4.1, independent of generate.py)
export function checkPlan(plan) {
  const P = [];
  const src = plan.sources;
  const by = new Map(src.map((s) => [s.index, s]));
  const types = ["time", "count", "pages"], sides = ["L", "R"];
  if (src.length !== 18) P.push("method source count");
  for (let st = 0; st < 6; st++) {
    const ms = src.filter((s) => s.stratum === st).map((s) => s.method).sort();
    if (ms.join() !== [...METHODS].sort().join()) P.push(`stratum ${st}`);
  }
  for (const m of METHODS) {
    const mine = src.filter((s) => s.method === m);
    if (mine.length !== 6) P.push(`method ${m} count`);
    for (const t of types) if (mine.filter((s) => s.qtype === t).length !== 2) P.push(`method ${m} type`);
    for (const sd of sides) if (mine.filter((s) => s.side === sd).length !== 3) P.push(`method ${m} side`);
    for (const flag of ["larger", "naturalFirst"]) {
      if (mine.filter((s) => s[flag]).length !== 3) P.push(`${flag} ${m} total`);
      for (const sd of sides) {
        const c = mine.filter((s) => s.side === sd && s[flag]).length;
        if (c < 1 || c > 2) P.push(`${flag} ${m} ${sd}`);
      }
    }
    if (mine.map((s) => s.slot).sort().join() !== "0,0,1,1,2,2") P.push(`slot ${m}`);
  }
  const order = plan.order;
  if (!Array.isArray(order) || [...order].sort((a, b) => a - b).join() !== [...Array(18).keys()].join()) return [...P, "position order"];
  for (let b = 0; b < 3; b++) {
    const blk = order.slice(b * 6, b * 6 + 6).map((i) => by.get(i));
    for (const m of METHODS) if (blk.filter((s) => s.method === m).length !== 2) P.push(`block ${b} method`);
    for (const t of types) if (blk.filter((s) => s.qtype === t).length !== 2) P.push(`block ${b} type`);
    if (blk.filter((s) => s.side === "L").length !== 3) P.push(`block ${b} side`);
  }
  let run = 1;
  for (let i = 1; i < 18; i++) {
    run = by.get(order[i]).method === by.get(order[i - 1]).method ? run + 1 : 1;
    if (run > 2) P.push(`run at ${i + 1}`);
  }
  for (const s of src) if (s.position !== order.indexOf(s.index) + 1) P.push("position mismatch");
  return P;
}

// ------------------------------------------------------------------ leak scan (protocol 7)
export function pngChunkTypes(buf) {
  const b = Buffer.from(buf);
  if (b.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;
  const out = [];
  let off = 8;
  while (off + 8 <= b.length) {
    const len = b.readUInt32BE(off);
    out.push(b.subarray(off + 4, off + 8).toString("latin1"));
    off += 12 + len;
  }
  return out;
}

/** The same PNG with only its critical chunks (IHDR, IDAT, IEND) kept, byte for byte; pixels are unchanged. */
export function criticalChunksOnly(buf) {
  const b = Buffer.from(buf);
  if (b.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("not a PNG");
  const parts = [b.subarray(0, 8)];
  let off = 8;
  while (off + 8 <= b.length) {
    const len = b.readUInt32BE(off);
    const type = b.subarray(off + 4, off + 8).toString("latin1");
    if (["IHDR", "IDAT", "IEND"].includes(type)) parts.push(b.subarray(off, off + 12 + len));
    off += 12 + len;
  }
  return Buffer.concat(parts);
}

const DATA_PNG = /data:image\/png;base64,([A-Za-z0-9+/=]+)/g;
export function scanPacketHtml(html, { canaries = [] } = {}) {
  const found = new Set();
  for (const m of html.matchAll(DATA_PNG)) {
    const types = pngChunkTypes(Buffer.from(m[1], "base64"));
    if (!types || types.some((t) => !["IHDR", "IDAT", "IEND"].includes(t)) || types[0] !== "IHDR" || types[types.length - 1] !== "IEND") found.add("png_chunk");
  }
  const text = html.replace(DATA_PNG, "data:image/png;base64,");
  if (/(https?|ftp|file|wss?):\/\//i.test(text) || /(src|href|action)\s*=\s*["']?\/\//i.test(text) || /<(link|iframe|object|embed|base|form)\b/i.test(text)
    || /<script[^>]*\bsrc\s*=/i.test(text) || /@import/i.test(text) || /\burl\(\s*["']?(?!data:)/i.test(text)) found.add("external_url");
  if (/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|serviceWorker|\bimport\s*\(|navigator\.connection/.test(text)) found.add("network_api");
  if (/localStorage|sessionStorage|indexedDB|document\.cookie|\bcaches\b/.test(text)) found.add("storage_api");
  if (/\b[Ww][1-5]\b/.test(text)) found.add("method_name");
  for (const c of canaries) if (c && text.includes(c)) found.add("canary");
  return [...found];
}

/** The page with the payload replaced by a fixed marker: equal for every packet built from the same template and code. */
export function templatePart(html) {
  const a = html.indexOf('<script type="application/json" id="kbr-payload">');
  const b = html.indexOf("</script>", a);
  if (a < 0 || b < 0) return null;
  return `${html.slice(0, a)}<script type="application/json" id="kbr-payload">__KBR_PAYLOAD__${html.slice(b)}`;
}

// ------------------------------------------------------------------ output policy (protocol 8.1)
const HEX64 = /^[0-9a-f]{64}$/;
const PATHLIKE = /^(?:[A-Za-z]:[\\/]|research\/|results\/|\.\/)[\x21-\x7e]{0,240}$/;
const CODE = /^[a-z][a-z0-9_]{0,40}$/;
const SAFE_KEYS = {
  ok: "bool", pass: "bool", step: "code", set: "code", code: "code", lock: "code", stage: "code",
  sources: "int", images: "int", pages: "int", rows: "int", files: "int", items: "int", checks: "int", failed: "int", problems: "int",
  equal: "int", total: "int", lines: "int", leaks: "int", blocked: "int", commitments: "int", outputs: "int", predictionsEqual: "int", w1Equal: "int", w4Equal: "int", w5Equal: "int", coordsEqual: "int",
  sha256: "hex", responseSha256: "hex", packetSha256: "hex", keySha256: "hex", manifestSha256: "hex", gateSha256: "hex", qaSha256: "hex",
  out: "path", admin: "path", reader: "path", file: "path", dir: "path",
};
export function safeLine(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("safeLine: not an object");
  for (const [k, v] of Object.entries(obj)) {
    const kind = SAFE_KEYS[k];
    if (!kind) throw new Error(`safeLine: key not allowed`);
    const good = kind === "bool" ? typeof v === "boolean"
      : kind === "int" ? Number.isSafeInteger(v) && v >= 0
        : kind === "hex" ? typeof v === "string" && HEX64.test(v)
          : kind === "path" ? typeof v === "string" && PATHLIKE.test(v)
            : typeof v === "string" && CODE.test(v) && !/w[0-9]/.test(v);
    if (!good) throw new Error(`safeLine: value of an allowed key has a disallowed form`);
  }
  return JSON.stringify(obj);
}

// ------------------------------------------------------------------ commitments (protocol 8.3)
import { createHash } from "node:crypto";
export const COMMIT_LABELS = ["kbr-seed", "kbr-assignment", "kbr-packet", "kbr-key"];
export function commitment(salt, label, bytes) {
  if (!Buffer.isBuffer(salt) || salt.length < 32) throw new Error("salt must be at least 32 bytes");
  if (!COMMIT_LABELS.includes(label)) throw new Error("unknown commitment label");
  return createHash("sha256").update(Buffer.concat([salt, Buffer.from(label, "utf8"), Buffer.from([0]), Buffer.from(bytes)])).digest("hex");
}

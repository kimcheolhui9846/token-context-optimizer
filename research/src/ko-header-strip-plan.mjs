// ko-header-strip: projection of a frozen #153 prediction row and the W5 strip plan
// (protocol research/plans/2026-11-25-ko-header-strip-protocol.md, sections 4.1, 4.3, 4.4, 5.1, 5.2).
// Pure functions. The plan function sees only the projected row: coordinates, indices and status.

export const SEPARATOR_LUMA = Object.freeze([224, 224, 224, 128, 128, 224, 224, 224]);
export const PAD_DIVISOR = 4n;
export const W5_SHOWS_W1 = Object.freeze(["w4_not_applied", "header_outside_body_width", "header_below_body"]);

export class ContractError extends Error {
  constructor(code, detail) { super(`${code}: ${detail}`); this.code = code; this.name = "ContractError"; }
}
export class IntegrityError extends Error {
  constructor(code, detail) { super(`${code}: ${detail}`); this.code = code; this.name = "IntegrityError"; }
}

// ---- exact decimal rationals (BigInt) ----
const DEC = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/;
/** Decimal string -> {n, d} with d = 10^k. Throws on anything else (NaN, exponent, empty). */
export function dec(s) {
  if (typeof s !== "string" || !DEC.test(s)) throw new RangeError(`not a finite decimal string: ${JSON.stringify(s)}`);
  const neg = s.startsWith("-");
  const [ip, fp = ""] = (neg ? s.slice(1) : s).split(".");
  const d = 10n ** BigInt(fp.length);
  const n = BigInt(ip + fp);
  return { n: neg ? -n : n, d };
}
const cmp = (a, b) => { const l = a.n * b.d, r = b.n * a.d; return l < r ? -1 : l > r ? 1 : 0; };
const sub = (a, b) => ({ n: a.n * b.d - b.n * a.d, d: a.d * b.d });
function floorQ(a) { const q = a.n / a.d; return a.n < 0n && q * a.d !== a.n ? q - 1n : q; }
function ceilQ(a) { const q = a.n / a.d; return a.n > 0n && q * a.d !== a.n ? q + 1n : q; }
/** Canonical decimal text of a power-of-ten rational: integer if whole, else no trailing zeros. */
export function decStr(a) {
  let { n, d } = a;
  while (d > 1n && n % 10n === 0n) { n /= 10n; d /= 10n; }
  if (d === 1n) return n.toString();
  const neg = n < 0n; if (neg) n = -n;
  const k = d.toString().length - 1;
  const s = n.toString().padStart(k + 1, "0");
  return `${neg ? "-" : ""}${s.slice(0, -k)}.${s.slice(-k)}`;
}

// ---- projection (section 4.1, 4.4) ----
const isInt = (v) => Number.isSafeInteger(v);
function windowOk(w, W, H) {
  return w && typeof w === "object" && isInt(w.left) && isInt(w.top) && isInt(w.width) && isInt(w.height)
    && w.left >= 0 && w.top >= 0 && w.width > 0 && w.height > 0 && w.left + w.width <= W && w.top + w.height <= H;
}
const win = (w) => Object.freeze({ left: w.left, top: w.top, width: w.width, height: w.height });
const sameWin = (a, b) => a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
const inside = (a, b) => a.left >= b.left && a.top >= b.top && a.left + a.width <= b.left + b.width && a.top + a.height <= b.top + b.height;

/** Copy of the allowed fields only, deeply frozen; validates the frozen W4 contract on applied rows. */
export function project(pred) {
  if (!pred || typeof pred !== "object") throw new IntegrityError("integrity_output", "prediction row is not an object");
  const { id, pngSha256, width, height, state, w4Reason } = pred;
  if (typeof id !== "string" || typeof pngSha256 !== "string" || !isInt(width) || !isInt(height) || width <= 0 || height <= 0) {
    throw new IntegrityError("integrity_output", `row ${JSON.stringify(id)}: id/pngSha256/size`);
  }
  if (state === "error" || state === "unmatched") {
    return Object.freeze({ id, pngSha256, width, height, state, w4Reason, w1: null, w2: null, w4: null, header: null });
  }
  if (state !== "matched") throw new IntegrityError("integrity_output", `${id}: unknown state ${JSON.stringify(state)}`);
  for (const k of ["w1", "w2", "w4"]) if (!windowOk(pred[k], width, height)) throw new ContractError("contract_window", `${id}: ${k} is not a positive integer window inside the page`);
  if (!inside(pred.w2, pred.w1)) throw new ContractError("contract_window", `${id}: w2 is not inside w1`);
  const base = { id, pngSha256, width, height, state, w4Reason, w1: win(pred.w1), w2: win(pred.w2), w4: win(pred.w4) };
  if (w4Reason !== "applied") {
    if (pred.w4From !== "w1" || !sameWin(pred.w4, pred.w1)) throw new ContractError("contract_window", `${id}: W4 not applied but w4 != w1`);
    return Object.freeze({ ...base, header: null });
  }
  const d = pred.w4Diag;
  const hd = d && d.header;
  if (!d || !hd || !Array.isArray(d.qualified) || d.qualified.length !== 1 || d.qualified[0] !== hd.line) {
    throw new ContractError("contract_header_line", `${id}: selected header line is not the only qualified line`);
  }
  const lines = Array.isArray(d.lines) ? d.lines : null;
  const ids = lines ? lines.map((l) => l && l.line) : [];
  const el = lines ? lines.filter((l) => l && l.line === hd.line) : [];
  if (!lines || new Set(ids).size !== ids.length || el.length !== 1) throw new ContractError("contract_line_ids", `${id}: line ids duplicated or header line missing`);
  const line = el[0];
  if (line.why !== "eligible" || !Array.isArray(line.groups) || line.groups.length !== 3) throw new ContractError("contract_group_count", `${id}: header line does not have exactly 3 groups`);
  if (line.failure !== null) throw new ContractError("contract_group_failure", `${id}: header line failure ${JSON.stringify(line.failure)}`);
  const { target, comp, match } = hd;
  if (![1, 2].includes(target) || ![1, 2].includes(comp) || target === comp || !Array.isArray(match) || match.length !== 2
    || match[target - 1] !== true || match[comp - 1] !== false) {
    throw new ContractError("contract_index", `${id}: target/comp/match`);
  }
  const groups = line.groups.map((g, i) => {
    const b = g && g.box;
    if (!Array.isArray(b) || b.length !== 4 || !b.every((s) => typeof s === "string" && DEC.test(s))) throw new ContractError("contract_box", `${id}: group ${i} box is not four finite decimals`);
    const [x0, y0, x1, y1] = b.map(dec);
    const zero = { n: 0n, d: 1n };
    if (cmp(x0, x1) >= 0 || cmp(y0, y1) >= 0 || cmp(x0, zero) < 0 || cmp(y0, zero) < 0
      || cmp(x1, { n: BigInt(width), d: 1n }) > 0 || cmp(y1, { n: BigInt(height), d: 1n }) > 0) {
      throw new ContractError("contract_box", `${id}: group ${i} box is empty or outside the page`);
    }
    return Object.freeze({ x0: b[0], y0: b[1], x1: b[2], y1: b[3] });
  });
  if (pred.w4From !== "w2" || !sameWin(pred.w4, pred.w2)) throw new ContractError("contract_w4_not_w2", `${id}: applied but w4 != w2`);
  return Object.freeze({ ...base, header: Object.freeze({ groups: Object.freeze(groups), target, comp }) });
}

// ---- plan (section 5.1, 5.2) ----
const rect = (w) => [w.left, w.top, w.left + w.width, w.top + w.height];
function w1Plan(proj, reason, extra) {
  const r = rect(proj.w1);
  return {
    reason, kind: "w1", B: null, H: null, t: null, b: null, p: null, ...extra,
    pieces: [{ kind: "source", sourceRect: r, displayRect: [0, 0, r[2] - r[0], r[3] - r[1]] }],
    display: { width: r[2] - r[0], height: r[3] - r[1] },
  };
}
const one = (reason, kind, B, H, t, b, p, y0, y1) => ({
  reason, kind, B, H, t, b, p,
  pieces: [{ kind: "source", sourceRect: [B[0], y0, B[2], y1], displayRect: [0, 0, B[2] - B[0], y1 - y0] }],
  display: { width: B[2] - B[0], height: y1 - y0 },
});

/** W5 plan from one projected row. */
export function plan(proj) {
  if (proj.state === "error" || proj.state === "unmatched") {
    return { reason: proj.state === "error" ? "upstream_error" : "upstream_unmatched", kind: null, B: null, H: null, t: null, b: null, p: null, pieces: [], display: null };
  }
  if (proj.w4Reason !== "applied") return w1Plan(proj, "w4_not_applied", {});
  const B = rect(proj.w4);
  const gs = proj.header.groups.map((g) => ({ x0: dec(g.x0), y0: dec(g.y0), x1: dec(g.x1), y1: dec(g.y1) }));
  const t = gs.map((g) => g.y0).reduce((a, c) => (cmp(c, a) < 0 ? c : a));
  const b = gs.map((g) => g.y1).reduce((a, c) => (cmp(c, a) > 0 ? c : a));
  const span = sub(b, t);
  const p = ceilQ({ n: span.n, d: span.d * PAD_DIVISOR });
  let top = floorQ(t) - p; if (top < 0n) top = 0n;
  let bottom = ceilQ(b) + p; if (bottom > BigInt(proj.height)) bottom = BigInt(proj.height);
  const H = [B[0], Number(top), B[2], Number(bottom)];
  const rec = { B, H, t: decStr(t), b: decStr(b), p: Number(p) };
  const outside = gs.some((g) => floorQ(g.x0) < BigInt(B[0]) || ceilQ(g.x1) > BigInt(B[2]));
  if (outside) return w1Plan(proj, "header_outside_body_width", rec);
  if (H[3] >= B[1] && H[1] <= B[3]) {
    if (H[1] >= B[1] && H[3] <= B[3]) return one("merged_contained", "body", B, H, rec.t, rec.b, rec.p, B[1], B[3]);
    return one("merged", "merged", B, H, rec.t, rec.b, rec.p, Math.min(H[1], B[1]), Math.max(H[3], B[3]));
  }
  if (H[1] > B[3]) return w1Plan(proj, "header_below_body", rec);
  const w = B[2] - B[0], hh = H[3] - H[1], bh = B[3] - B[1], s = SEPARATOR_LUMA.length;
  return {
    reason: "two_bands", kind: "two_bands", ...rec,
    pieces: [
      { kind: "source", sourceRect: [B[0], H[1], B[2], H[3]], displayRect: [0, 0, w, hh] },
      { kind: "separator", displayRect: [0, hh, w, hh + s], luma: [...SEPARATOR_LUMA] },
      { kind: "source", sourceRect: [B[0], B[1], B[2], B[3]], displayRect: [0, hh + s, w, hh + s + bh] },
    ],
    display: { width: w, height: hh + s + bh },
  };
}

/** Output pixels (one channel, row-major) of a plan from the source page pixels. */
export function compose(pl, src, srcWidth) {
  if (!pl.display) return null;
  const { width, height } = pl.display;
  const out = Buffer.alloc(width * height);
  for (const pc of pl.pieces) {
    const [dx0, dy0, dx1, dy1] = pc.displayRect;
    if (dx0 !== 0 || dx1 !== width) throw new Error("piece does not span the output width");
    if (pc.kind === "separator") {
      for (let r = 0; r < dy1 - dy0; r++) out.fill(pc.luma[r], (dy0 + r) * width, (dy0 + r + 1) * width);
    } else {
      const [sx0, sy0, sx1, sy1] = pc.sourceRect;
      if (sx1 - sx0 !== width || sy1 - sy0 !== dy1 - dy0) throw new Error("source and display rect sizes differ");
      for (let r = 0; r < sy1 - sy0; r++) src.copy(out, (dy0 + r) * width, (sy0 + r) * srcWidth + sx0, (sy0 + r) * srcWidth + sx1);
    }
  }
  return out;
}

/** Plain crop of a window from the source pixels. */
export function crop(w, src, srcWidth) {
  const out = Buffer.alloc(w.width * w.height);
  for (let r = 0; r < w.height; r++) src.copy(out, r * w.width, (w.top + r) * srcWidth + w.left, (w.top + r) * srcWidth + w.left + w.width);
  return out;
}

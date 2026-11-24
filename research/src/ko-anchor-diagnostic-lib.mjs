// Korean anchor signal diagnostic (protocol research/plans/2026-11-24-ko-anchor-diagnostic-protocol.md).
// Pure functions shared by the CLI and the tests. No OCR, no network, no model call.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

export const SELECTOR_BLOB = "b3b4965b2d330907c0143fe178013aace1be8372";
export const R09_COMMIT = "0fb30531aabaa9f55b8c9fdc34ee9d03042936c1";
export const FCP_COMMIT = "708d9946ae091180a1b716baadfdd73fcfe5a19b";

// Fixed source blobs (protocol section 3.1). Keys are (dataset, file kind).
export const SOURCES = {
  r09: {
    commit: R09_COMMIT,
    questions: { path: "research/results/r09-bilingual/heldout/questions.json", blob: "605ff760cc1c12de0a0d21076ac0b8eecb79032a" },
    ocr: { path: "research/results/r09-bilingual/heldout/run-a/raw.jsonl", blob: "876cdbb90aab9f0bf8ac3f3e9a520ed72e7b3318" },
    design: { path: "research/results/r09-bilingual/heldout/design.json", blob: "dc3307818cba423b3fc2eade8ed7f2116593f788" },
  },
  fcp: {
    commit: FCP_COMMIT,
    questions: { path: "research/results/fresh-crop-padding/frozen/selector-input/questions.json", blob: "ae578b7267ff124ecf4a0a5157f7067925b177ca" },
    ocr: { path: "research/results/fresh-crop-padding/run-a/caller.jsonl", blob: "d657d59d7124f68743a1e54a7eb7c62f521dbc21" },
    design: { path: "research/results/fresh-crop-padding/frozen/oracle/design.json", blob: "3149501a51bebbc79d77b7021a61241d32950ba5" },
  },
};
export const DATASETS = ["r09", "fcp"];
export const FILE_KINDS = ["questions", "ocr", "design"];

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
/** Git blob id of raw bytes ("blob <len>\0" + bytes, SHA-1), independent of any working copy line endings. */
export const gitBlobId = (bytes) => createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest("hex");

const git = (repo, args, encoding) => execFileSync("git", args, { cwd: repo, encoding, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });

/** Read the six fixed source blobs and check blob id and commit path for each. Throws on the first mismatch. */
export function readSources(repo) {
  const out = {};
  for (const ds of DATASETS) {
    const src = SOURCES[ds];
    try {
      if (git(repo, ["cat-file", "-t", src.commit], "utf8").trim() !== "commit") throw new Error("not a commit");
    } catch {
      throw new Error(`commit ${src.commit} for ${ds} is missing; run: git fetch origin pull/145/head`);
    }
    out[ds] = {};
    for (const kind of FILE_KINDS) {
      const { path, blob } = src[kind];
      const atPath = git(repo, ["rev-parse", `${src.commit}:${path}`], "utf8").trim();
      if (atPath !== blob) throw new Error(`${ds}/${kind}: ${src.commit}:${path} is ${atPath}, not ${blob}`);
      const bytes = git(repo, ["cat-file", "blob", blob]);
      if (gitBlobId(bytes) !== blob) throw new Error(`${ds}/${kind}: bytes hash to ${gitBlobId(bytes)}, not ${blob}`);
      out[ds][kind] = bytes;
    }
  }
  return out;
}

/** Fail if the selector file on disk is not the fixed blob. Uses git hash-object so the CRLF working copy hashes as committed. */
export function checkSelectorFile(repo, file) {
  const id = git(repo, ["hash-object", file], "utf8").trim();
  if (id !== SELECTOR_BLOB) throw new Error(`selector blob ${id} is not ${SELECTOR_BLOB}`);
  return id;
}

export function parseDataset(bytes) {
  const questions = JSON.parse(bytes.questions.toString("utf8")).questions;
  const ocr = bytes.ocr.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const design = JSON.parse(bytes.design.toString("utf8"));
  return { questions, ocr, design };
}

// ------------------------------------------------------------------ section 4.1 source checks
const isInt = (v) => Number.isInteger(v);
const finite = (v) => typeof v === "number" && Number.isFinite(v);

/** Returns a list of problems (empty when the dataset passes every stop rule of protocol section 4.1). */
export function validateDataset(name, { questions, ocr, design }) {
  const p = [];
  const n = (arr, want, what) => { if (!Array.isArray(arr) || arr.length !== want) p.push(`${name}: ${what} count ${Array.isArray(arr) ? arr.length : "missing"} != ${want}`); };
  n(questions, 48, "questions");
  n(ocr, 48, "ocr rows");
  n(design?.images, 48, "design images");
  n(design?.pairs, 24, "design pairs");
  if (p.length) return p;
  const uniq = (ids, what) => { if (new Set(ids).size !== ids.length) p.push(`${name}: duplicate ${what} ids`); };
  uniq(questions.map((q) => q.id), "question");
  uniq(ocr.map((r) => r.id), "ocr");
  uniq(design.images.map((im) => im.id), "design");
  const qIds = questions.map((q) => q.id).join("\n");
  if (ocr.map((r) => r.id).join("\n") !== qIds) p.push(`${name}: ocr row order or ids differ from questions`);
  const dm = new Map(design.images.map((im) => [im.id, im]));
  const pairs = new Map();
  const cells = new Map();
  for (const q of questions) {
    const im = dm.get(q.id);
    if (!im) { p.push(`${name}: ${q.id} missing from design`); continue; }
    if (im.question !== q.question) p.push(`${name}: ${q.id} question differs from design`);
    if (!pairs.has(im.pairId)) pairs.set(im.pairId, []);
    pairs.get(im.pairId).push(im.lang);
    const key = `${im.lang}/${im.anchor}`;
    cells.set(key, (cells.get(key) || 0) + 1);
    const W = im.page?.width, H = im.page?.height;
    const anchors = (im.items || []).filter((it) => it.id === im.anchorItem);
    if (anchors.length !== 1) { p.push(`${name}: ${q.id} has ${anchors.length} anchor items`); continue; }
    const c = anchors[0].cell;
    if (!Array.isArray(c) || c.length !== 4 || !c.every(isInt) || !(c[0] >= 0 && c[0] < c[2] && c[2] <= W && c[1] >= 0 && c[1] < c[3] && c[3] <= H)) p.push(`${name}: ${q.id} anchor cell invalid ${JSON.stringify(c)}`);
    if (im.lang === "ko" && im.anchor === "nl" && anchors[0].role !== "label") p.push(`${name}: ${q.id} KO/nl target role ${anchors[0].role}`);
  }
  for (const [pid, langs] of pairs) if (langs.length !== 2 || !langs.includes("en") || !langs.includes("ko")) p.push(`${name}: pair ${pid} langs ${langs.join(",")}`);
  if (pairs.size !== 24) p.push(`${name}: ${pairs.size} pairs`);
  const designPairIds = new Set(design.pairs.map((x) => x.pairId));
  if (designPairIds.size !== 24 || [...pairs.keys()].some((k) => !designPairIds.has(k))) p.push(`${name}: design.pairs differ from image pairIds`);
  for (const k of ["en/code", "en/nl", "ko/code", "ko/nl"]) if (cells.get(k) !== 12) p.push(`${name}: ${k} has ${cells.get(k) || 0} images`);
  for (const r of ocr) {
    const im = dm.get(r.id);
    if (!im) continue;
    if (r.width !== im.page.width || r.height !== im.page.height) p.push(`${name}: ${r.id} size ${r.width}x${r.height} != design ${im.page.width}x${im.page.height}`);
    if (r.status === "ok") {
      if (!Array.isArray(r.ocrLines)) { p.push(`${name}: ${r.id} ok row without ocrLines`); continue; }
      for (const l of r.ocrLines) {
        if (typeof l.text !== "string" || !Array.isArray(l.words)) { p.push(`${name}: ${r.id} malformed line`); break; }
        if (l.words.some((w) => typeof w.text !== "string" || !Array.isArray(w.box) || w.box.length !== 4 || !w.box.every(finite))) { p.push(`${name}: ${r.id} malformed word`); break; }
      }
    }
  }
  return p;
}

// ------------------------------------------------------------------ section 4.2 baseline replay
const nul = (v) => (v === undefined ? null : v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Feed one stored record (question, stored OCR lines, stored size) to the real selectWindow and compare with the
 * stored selector output. Returns a compact row; ok=false when any compared field differs or the selector throws.
 */
export function replayRow(selectWindow, dataset, q, rec) {
  const base = { dataset, id: q.id };
  if (rec.status !== "ok") return { ...base, status: rec.status, kind: "technical_error", ok: null, mismatches: [], stored: { error: rec.error ?? null } };
  let sel;
  try {
    sel = selectWindow(rec.ocrLines, q.question, rec.width, rec.height);
  } catch (err) {
    return { ...base, status: "ok", kind: "replay_error", ok: false, mismatches: ["exception"], error: String(err?.message || err).slice(0, 200) };
  }
  const got = { keys: sel.keys, matched: sel.matched, score: sel.score ?? 0, lineText: nul(sel.lineText), confidence: nul(sel.confidence), axisRow: nul(sel.axisRow), band: nul(sel.band) };
  const want = { keys: rec.keys, matched: rec.matched, score: rec.score, lineText: nul(rec.lineText), confidence: nul(rec.confidence), axisRow: nul(rec.axisRow), band: nul(rec.band) };
  const mismatches = Object.keys(got).filter((k) => !same(got[k], want[k]));
  if (dataset === "r09" && "matchedLine" in rec) {
    const mlText = rec.matchedLine ? rec.matchedLine.text : null;
    if (mlText !== got.lineText) mismatches.push("matchedLine.text");
  }
  return { ...base, status: "ok", kind: got.matched ? "matched" : "unmatched", ok: mismatches.length === 0, mismatches, keys: got.keys, matched: got.matched, axisRow: got.axisRow, band: got.band };
}

// ------------------------------------------------------------------ section 5 representation
const HANGUL_RUN = /[가-힣]+/gu;
/** NFC -> runs of modern Hangul syllables -> overlapping syllable bigrams -> sorted unique list. */
export function hangulBigrams(text) {
  const set = new Set();
  for (const run of String(text).normalize("NFC").match(HANGUL_RUN) || []) {
    const chars = [...run];
    for (let i = 0; i + 1 < chars.length; i++) set.add(chars[i] + chars[i + 1]);
  }
  return [...set].sort();
}
const HAS_SYLLABLE = /[가-힣]/u;
// Any Hangul: Jamo 1100-11FF, Compatibility Jamo 3130-318F, Jamo Ext-A A960-A97F, syllables AC00-D7A3, Jamo Ext-B D7B0-D7FF.
const HANGUL_RANGES = [[0x1100, 0x11ff], [0x3130, 0x318f], [0xa960, 0xa97f], [0xac00, 0xd7a3], [0xd7b0, 0xd7ff]];
const HAS_ANY_HANGUL = { test: (s) => [...s].some((ch) => { const c = ch.codePointAt(0); return HANGUL_RANGES.some(([a, b]) => c >= a && c <= b); }) };

// ------------------------------------------------------------------ section 6.1 blind collection
export const COLLECT_TOP = ["dataset", "id", "question", "width", "height", "status", "ocrLines"];
const LINE_FIELDS = ["text", "words"];
const WORD_FIELDS = ["text", "box"];
const onlyFields = (obj, allowed, where) => {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) throw new Error(`collector: field ${where}.${k} is not allowed`);
};

/** Projection of a stored record onto the allowed collector fields. */
export function projectForCollector(dataset, q, rec) {
  return {
    dataset, id: q.id, question: q.question, width: rec.width, height: rec.height, status: rec.status,
    ocrLines: rec.status === "ok" ? rec.ocrLines.map((l) => ({ text: l.text, words: l.words.map((w) => ({ text: w.text, box: w.box })) })) : null,
  };
}

/** Blind collector: only question, size and OCR text/boxes. Throws if any other field is present. */
export function collect(input) {
  onlyFields(input, COLLECT_TOP, "row");
  const inputSha256 = sha256(JSON.stringify(input));
  const base = { dataset: input.dataset, id: input.id, status: input.status, Q: hangulBigrams(input.question), inputSha256 };
  if (input.status !== "ok") return { ...base, wordCount: null, syllableWords: null, anyHangulWords: null, signalWords: null };
  let wordCount = 0, syllableWords = 0, anyHangulWords = 0;
  const signalWords = [];
  input.ocrLines.forEach((l, li) => {
    onlyFields(l, LINE_FIELDS, "line");
    l.words.forEach((w, wi) => {
      onlyFields(w, WORD_FIELDS, "word");
      wordCount++;
      const t = String(w.text).normalize("NFC");
      if (HAS_SYLLABLE.test(t)) syllableWords++;
      if (HAS_ANY_HANGUL.test(t)) anyHangulWords++;
      const O = hangulBigrams(w.text);
      if (O.length) signalWords.push({ line: li, word: wi, O, box: w.box, center: [w.box[0] + w.box[2] / 2, w.box[1] + w.box[3] / 2] });
    });
  });
  return { ...base, wordCount, syllableWords, anyHangulWords, signalWords };
}

/** collect() for one row; an exception becomes a technical-error row (protocol 6.2-1) instead of ending the run. */
export function collectSafe(input) {
  try {
    return collect(input);
  } catch (err) {
    return { dataset: input.dataset, id: input.id, status: "error", error: `collect: ${String(err?.message || err).slice(0, 200)}`, Q: hangulBigrams(input.question), inputSha256: null, wordCount: null, syllableWords: null, anyHangulWords: null, signalWords: null };
  }
}

/** sourceControl() for one row; an exception becomes a technical_error control. */
export function sourceControlSafe(dataset, image) {
  try {
    return sourceControl(dataset, image);
  } catch (err) {
    return { category: "technical_error", reason: String(err?.message || err).slice(0, 200), otherCellsWithTargetSignal: null, otherCellsWithGeneric: null, textCells: null };
  }
}

// ------------------------------------------------------------------ section 6.2 scoring
/** Half-open [left, top, right, bottom). */
export const inCell = ([cx, cy], [l, t, r, b]) => cx >= l && cx < r && cy >= t && cy < b;

/** Score one collected row against its design image (privileged). Never throws: errors become technical_error. */
export function scoreRow(col, image, baseline) {
  const row = { dataset: col.dataset, id: col.id };
  try {
    const target = image.items.filter((it) => it.id === image.anchorItem);
    if (target.length !== 1) throw new Error(`anchor items ${target.length}`);
    const cell = target[0].cell;
    const T = hangulBigrams(target[0].text);
    const Q = col.Q;
    const S = Q.filter((x) => T.includes(x));
    const generic = Q.filter((x) => !T.includes(x));
    Object.assign(row, { targetItem: image.anchorItem, targetRole: target[0].role, cell, Q, T, S, baselineKeyCount: Array.isArray(baseline?.keys) ? baseline.keys.length : null, baselineMatched: typeof baseline?.matched === "boolean" ? baseline.matched : null });
    if (col.status !== "ok") return { ...row, category: "technical_error", reason: `ocr status ${col.status}`, insideWords: null, outsideWords: null, alsoOutside: null, genericOverlap: null };
    const pageO = new Set(col.signalWords.flatMap((w) => w.O));
    const genericOverlap = generic.filter((x) => pageO.has(x));
    let inside = 0, outside = 0;
    for (const w of col.signalWords) {
      if (!w.O.some((x) => S.includes(x))) continue;
      if (inCell(w.center, cell)) inside++;
      else outside++;
    }
    let category;
    if (!T.length) category = "not_applicable";
    else if (!S.length) category = "no_question_signal";
    else if (inside + outside === 0) category = "absent";
    else if (inside === 0) category = "outside_only";
    else category = "inside";
    return { ...row, category, insideWords: inside, outsideWords: outside, alsoOutside: category === "inside" ? outside > 0 : null, genericOverlap };
  } catch (err) {
    return { ...row, category: "technical_error", reason: String(err?.message || err).slice(0, 200) };
  }
}

// ------------------------------------------------------------------ section 6.3 rendered-text control
/** Same collect + score path on a perfect OCR built from the design text items, plus overlap counts. */
export function sourceControl(dataset, image) {
  const items = image.items.filter((it) => typeof it.text === "string" && it.text.length);
  const ocrLines = items.map((it) => {
    const box = [it.cell[0], it.cell[1], it.cell[2] - it.cell[0], it.cell[3] - it.cell[1]];
    return { text: it.text, words: it.text.split(/\s+/u).filter(Boolean).map((text) => ({ text, box })) };
  });
  const col = collect({ dataset, id: image.id, question: image.question, width: image.page.width, height: image.page.height, status: "ok", ocrLines });
  const s = scoreRow(col, image, null);
  const S = s.S || [];
  const generic = (s.Q || []).filter((x) => !(s.T || []).includes(x));
  const others = items.filter((it) => it.id !== image.anchorItem).map((it) => hangulBigrams(it.text));
  return {
    category: s.category,
    otherCellsWithTargetSignal: others.filter((b) => b.some((x) => S.includes(x))).length,
    otherCellsWithGeneric: others.filter((b) => b.some((x) => generic.includes(x))).length,
    textCells: items.length,
  };
}

// ------------------------------------------------------------------ section 8 summary
export const CATEGORIES = ["inside", "outside_only", "absent", "no_question_signal", "not_applicable", "technical_error"];

export function summarize(replayRows, collectRows, scoreRows, designs) {
  const per = {};
  for (const ds of [...DATASETS, "total"]) {
    const pick = (rows) => (ds === "total" ? rows : rows.filter((r) => r.dataset === ds));
    const rp = pick(replayRows), cl = pick(collectRows), sc = pick(scoreRows);
    const cellOf = (r) => { const im = designs[r.dataset].get(r.id); return `${im.lang}/${im.anchor}`; };
    const byCell = {};
    for (const r of rp) {
      const k = cellOf(r);
      byCell[k] ??= { total: 0, matched: 0, unmatched: 0, technicalError: 0, replayError: 0 };
      byCell[k].total++;
      byCell[k][{ matched: "matched", unmatched: "unmatched", technical_error: "technicalError", replay_error: "replayError" }[r.kind]]++;
    }
    const categories = Object.fromEntries(CATEGORIES.map((c) => [c, sc.filter((r) => r.category === c).length]));
    const applicable = sc.filter((r) => r.category !== "not_applicable" && r.category !== "technical_error").length;
    const koCollect = cl.filter((r) => cellOf(r) === "ko/nl");
    per[ds] = {
      replay: {
        denominator: rp.length,
        agree: rp.filter((r) => r.ok === true).length,
        disagree: rp.filter((r) => r.ok === false).length,
        matched: rp.filter((r) => r.kind === "matched").length,
        unmatched: rp.filter((r) => r.kind === "unmatched").length,
        technicalError: rp.filter((r) => r.kind === "technical_error").length,
        replayError: rp.filter((r) => r.kind === "replay_error").length,
        byLangAnchor: Object.fromEntries(Object.keys(byCell).sort().map((k) => [k, byCell[k]])),
      },
      collection: {
        rows: cl.length,
        okRows: cl.filter((r) => r.status === "ok").length,
        ocrWords: cl.reduce((a, r) => a + (r.wordCount || 0), 0),
        wordsWithHangulSyllable: cl.reduce((a, r) => a + (r.syllableWords || 0), 0),
        wordsWithAnyHangul: cl.reduce((a, r) => a + (r.anyHangulWords || 0), 0),
        wordsWithBigram: cl.reduce((a, r) => a + (r.signalWords ? r.signalWords.length : 0), 0),
        koNlRows: koCollect.length,
        koNlRowsWithNonEmptyQ: koCollect.filter((r) => r.Q.length > 0).length,
      },
      diagnostic: {
        denominator: sc.length,
        applicable,
        categories,
        insideAlsoOutside: sc.filter((r) => r.alsoOutside === true).length,
        rowsWithGenericOverlap: sc.filter((r) => Array.isArray(r.genericOverlap) && r.genericOverlap.length > 0).length,
        baselineKeysEmpty: sc.filter((r) => r.baselineKeyCount === 0).length,
        baselineMatched: sc.filter((r) => r.baselineMatched === true).length,
        control: {
          inside: sc.filter((r) => r.control?.category === "inside").length,
          rowsWithOtherCellTargetSignal: sc.filter((r) => (r.control?.otherCellsWithTargetSignal || 0) > 0).length,
          rowsWithOtherCellGeneric: sc.filter((r) => (r.control?.otherCellsWithGeneric || 0) > 0).length,
        },
      },
    };
  }
  return per;
}

/** One JSON object per line, LF, trailing newline. */
export const jsonl = (rows) => `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`;
export const pretty = (obj) => `${JSON.stringify(obj, null, 1)}\n`;

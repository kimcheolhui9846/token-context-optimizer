// R09 follow-up: bilingual (EN/KO) evidence-region selection. Deterministic design manifest.
// The manifest fixes questions, page text, cells, target rows and gold item ids before any selector run.
// Rendering (ink boxes) is done by tools/r09/render.py; the selector run reads only questions.json and the PNGs.
import { createHash } from "node:crypto";
import { keywords, selectWindow } from "./selector.mjs";

export const DESIGN_VERSION = "r09-design-1";
export const PAGE = { width: 1280, height: 960 };
export const FONT = { file: "NotoSansKR-VF.ttf", sha256: "018174e8cdd366aff67c8d366c7dc806a7babbe7f2819fc23b00d59f7b8353d0", weight: 400, bodySize: 24, titleSize: 32 };

// Deterministic PRNG (mulberry32) seeded from a string via FNV-1a.
function seedOf(str) {
  let h = 0x811c9dc5;
  for (const ch of str) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193) >>> 0;
  return h >>> 0;
}
export function rng(str) {
  let a = seedOf(str);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffle = (arr, r) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Document types. Each row: code, label (language specific), answer value (ASCII, identical across languages), other field.
export const DOCTYPES = {
  schedule: {
    title: { en: "Weekly Program Schedule", ko: "주간 프로그램 일정표" },
    columns: { en: ["Code", "Session", "Venue", "Time"], ko: ["코드", "세션", "장소", "시간"] },
    prefix: "SX",
    labels: [
      ["Budget review", "예산 검토"], ["Vendor briefing", "협력사 설명회"], ["Safety drill", "안전 훈련"], ["Design critique", "디자인 평가"],
      ["Payroll audit", "급여 감사"], ["Hiring panel", "채용 면접"], ["Customer forum", "고객 간담회"], ["Archive cleanup", "기록물 정리"],
      ["Network upgrade", "네트워크 교체"], ["Quarterly planning", "분기 계획"], ["Legal training", "법무 교육"], ["Facility tour", "시설 견학"],
    ],
    others: [["Cedar Hall", "시더홀"], ["Maple Room", "메이플룸"], ["Birch Studio", "버치 스튜디오"], ["Oak Lounge", "오크 라운지"], ["Pine Hall", "파인홀"], ["Elm Room", "엘름룸"]],
    value: (r) => {
      const slot = 48 + Math.floor(r() * 57); // 08:00 .. 17:20 in 10-minute steps
      return `${String(Math.floor(slot / 6)).padStart(2, "0")}:${String((slot % 6) * 10).padStart(2, "0")}`;
    },
    question: {
      code: { en: (c) => `When is ${c}?`, ko: (c) => `${c} 일정은 언제인가요?` },
      nl: { en: (l) => `When is the ${l.en.toLowerCase()}?`, ko: (l) => `${l.ko} 일정은 언제인가요?` },
    },
  },
  invoice: {
    title: { en: "Transaction Statement", ko: "거래명세서" },
    columns: { en: ["Code", "Item", "Supplier", "Amount"], ko: ["코드", "품목", "공급처", "금액"] },
    prefix: "KT",
    labels: [
      ["Steel bracket", "강철 브래킷"], ["Copper cable", "구리 케이블"], ["Paper towels", "종이 타월"], ["Desk lamp", "책상 조명"],
      ["Toner cartridge", "토너 카트리지"], ["Safety gloves", "안전 장갑"], ["Filing cabinet", "서류 캐비닛"], ["Water filter", "정수 필터"],
      ["Glass panel", "유리 패널"], ["Wall clock", "벽시계"], ["Office chair", "사무용 의자"], ["Extension cord", "멀티탭"],
    ],
    others: [["Hanbit Trading", "한빛상사"], ["Daon Supply", "다온물산"], ["Seoul Parts", "서울부품"], ["Mirae Stationery", "미래문구"], ["Green Tools", "그린공구"], ["Nara Metal", "나라금속"]],
    value: (r) => (10 + Math.floor(r() * 890)).toLocaleString("en-US") + "," + String(Math.floor(r() * 10) * 100).padStart(3, "0"),
    question: {
      code: { en: (c) => `How much is ${c}?`, ko: (c) => `${c}의 금액은 얼마인가요?` },
      nl: { en: (l) => `How much is the ${l.en.toLowerCase()}?`, ko: (l) => `${l.ko}의 금액은 얼마인가요?` },
    },
  },
  status: {
    title: { en: "System Status Board", ko: "시스템 상태표" },
    columns: { en: ["Code", "Component", "State", "Open issues"], ko: ["코드", "구성요소", "상태", "미해결 건수"] },
    prefix: "PX",
    labels: [
      ["Billing gateway", "결제 게이트웨이"], ["Login service", "로그인 서비스"], ["Mail relay", "메일 중계"], ["Search index", "검색 색인"],
      ["Backup storage", "백업 저장소"], ["Print queue", "인쇄 대기열"], ["Video encoder", "영상 인코더"], ["Report builder", "보고서 생성기"],
      ["Sensor feed", "센서 수신"], ["Cache cluster", "캐시 클러스터"], ["Audit logger", "감사 기록기"], ["Clock sync", "시간 동기화"],
    ],
    others: [["Normal", "정상"], ["Delayed", "지연"], ["Degraded", "저하"], ["Paused", "중지"]],
    value: (r) => String(2 + Math.floor(r() * 97)),
    question: {
      code: { en: (c) => `What number is shown for ${c}?`, ko: (c) => `${c}에 표시된 숫자는 무엇인가요?` },
      nl: { en: (l) => `What number is shown for the ${l.en.toLowerCase()}?`, ko: (l) => `${l.ko}에 표시된 숫자는 무엇인가요?` },
    },
  },
};

// Pre-registered target position (row index 0..7, or card index 0..7) per layout x anchor x seed. Same for all doc types.
export const TARGET_SLOT = {
  table: { code: { 1: 2, 2: 5 }, nl: { 1: 5, 2: 2 } },
  cards: { code: { 1: 3, 2: 6 }, nl: { 1: 6, 2: 3 } },
};
export const ROWS = 8;
export const LAYOUTS = ["table", "cards"];
export const ANCHORS = ["code", "nl"];
export const SEEDS = [1, 2];
export const LANGS = ["en", "ko"];

// Cell geometry in page pixels, half-open [x0, x1) x [y0, y1). Text is drawn left-aligned, vertically centred.
const TABLE = { x: [70, 250, 650, 950, 1210], headerY: 170, rowH: 72 };
const CARD = { x0: [40, 660], w: 580, y0: 150, h: 170, gap: 24, labelW: 150, lines: [35, 85, 135] };

function tableItems(doc, lang, rows) {
  const items = [{ id: "title", role: "title", text: doc.title[lang], cell: [70, 40, 1210, 110], size: "title" }];
  doc.columns[lang].forEach((t, c) => items.push({ id: `h${c}`, role: "header", text: t, cell: [TABLE.x[c], TABLE.headerY, TABLE.x[c + 1], TABLE.headerY + TABLE.rowH], size: "body" }));
  rows.forEach((row, i) => {
    const y0 = TABLE.headerY + TABLE.rowH * (i + 1);
    const vals = [row.code, row.label[lang], row.other[lang], row.value];
    const roles = ["code", "label", "other", "value"];
    vals.forEach((t, c) => items.push({ id: `r${i}${roles[c][0]}`, role: roles[c], row: i, text: t, cell: [TABLE.x[c], y0, TABLE.x[c + 1], y0 + TABLE.rowH], size: "body" }));
  });
  const rules = [TABLE.headerY + TABLE.rowH, ...rows.map((_, i) => TABLE.headerY + TABLE.rowH * (i + 2))].map((y) => [TABLE.x[0], y, TABLE.x[4], y + 1]);
  return { items, rules };
}

function cardItems(doc, lang, rows) {
  const items = [{ id: "title", role: "title", text: doc.title[lang], cell: [40, 40, 1240, 110], size: "title" }];
  const rules = [];
  rows.forEach((row, i) => {
    const x = CARD.x0[i % 2];
    const y = CARD.y0 + Math.floor(i / 2) * (CARD.h + CARD.gap);
    rules.push([x, y, x + CARD.w, y + 1], [x, y + CARD.h - 1, x + CARD.w, y + CARD.h]);
    const line = (k) => [y + CARD.lines[k] - 25, y + CARD.lines[k] + 25];
    const [l0, l1, l2] = [line(0), line(1), line(2)];
    const cols = doc.columns[lang];
    items.push(
      { id: `r${i}c`, role: "code", row: i, text: row.code, cell: [x + 20, l0[0], x + 20 + CARD.labelW, l0[1]], size: "body" },
      { id: `r${i}l`, role: "label", row: i, text: row.label[lang], cell: [x + 20 + CARD.labelW, l0[0], x + CARD.w - 20, l0[1]], size: "body" },
      { id: `r${i}vk`, role: "fieldname", row: i, text: cols[3], cell: [x + 20, l1[0], x + 20 + CARD.labelW, l1[1]], size: "body" },
      { id: `r${i}v`, role: "value", row: i, text: row.value, cell: [x + 20 + CARD.labelW, l1[0], x + CARD.w - 20, l1[1]], size: "body" },
      { id: `r${i}ok`, role: "fieldname", row: i, text: cols[2], cell: [x + 20, l2[0], x + 20 + CARD.labelW, l2[1]], size: "body" },
      { id: `r${i}o`, role: "other", row: i, text: row.other[lang], cell: [x + 20 + CARD.labelW, l2[0], x + CARD.w - 20, l2[1]], size: "body" },
    );
  });
  return { items, rules };
}

const digits = (s) => s.replace(/[^0-9]/g, "");

/** Draws the rows of one pair. Seed changes codes, values, label choice and distractor order; the target slot is fixed. */
function drawPair(docName, layout, anchor, seed, set) {
  const doc = DOCTYPES[docName];
  const r = rng(`${DESIGN_VERSION}|${set}|${docName}|${layout}|${anchor}|${seed}`);
  const labels = shuffle(doc.labels, r).slice(0, ROWS).map(([en, ko]) => ({ en, ko }));
  const codes = new Set();
  while (codes.size < ROWS) codes.add(`${doc.prefix}-${1000 + Math.floor(r() * 9000)}`);
  const values = new Set();
  const rows = [...codes].map((code, i) => {
    let value;
    do value = doc.value(r); while (values.has(value) || digits(code).includes(digits(value)) || digits(value).includes(digits(code)));
    values.add(value);
    const [en, ko] = doc.others[Math.floor(r() * doc.others.length)];
    return { code, label: labels[i], value, other: { en, ko } };
  });
  const target = TARGET_SLOT[layout][anchor][seed];
  return { rows, target };
}

export function buildDesign(set = "heldout") {
  const images = [];
  const pairs = [];
  const docs = set === "heldout" ? Object.keys(DOCTYPES) : [];
  for (const docName of docs)
    for (const layout of LAYOUTS)
      for (const anchor of ANCHORS)
        for (const seed of SEEDS) {
          const pairId = `${docName}-${layout}-${anchor}-s${seed}`;
          const { rows, target } = drawPair(docName, layout, anchor, seed, set);
          const t = rows[target];
          const doc = DOCTYPES[docName];
          pairs.push({ pairId, doctype: docName, layout, anchor, seed, target, answer: t.value, code: t.code });
          for (const lang of LANGS) {
            const question = anchor === "code" ? doc.question.code[lang](t.code) : doc.question.nl[lang](t.label);
            const { items, rules } = layout === "table" ? tableItems(doc, lang, rows) : cardItems(doc, lang, rows);
            const anchorItem = items.find((it) => it.row === target && it.role === (anchor === "code" ? "code" : "label")).id;
            const valueItem = items.find((it) => it.row === target && it.role === "value").id;
            images.push({ id: `${pairId}-${lang}`, pairId, lang, doctype: docName, layout, anchor, seed, file: `${pairId}-${lang}.png`, page: PAGE, question, answer: t.value, code: t.code, goldItems: [anchorItem, valueItem], anchorItem, items, rules });
          }
        }
  return { version: DESIGN_VERSION, set, page: PAGE, font: FONT, targetSlot: TARGET_SLOT, images, pairs };
}

// Development fixture: a different document (equipment loan list), a different single-column list layout and page size.
export function buildDevDesign() {
  const page = { width: 1100, height: 800 };
  const r = rng(`${DESIGN_VERSION}|dev`);
  const items0 = [["Tripod", "삼각대"], ["Projector", "프로젝터"], ["Microphone", "마이크"], ["Camera", "카메라"], ["Speaker", "스피커"], ["Whiteboard", "화이트보드"]];
  const rows = items0.map(([en, ko], i) => ({ code: `LN-${2000 + i * 1000 + Math.floor(r() * 900)}`, label: { en, ko }, value: `11-${String(10 + i * 3).padStart(2, "0")}` }));
  const images = [];
  const pairs = [];
  for (const anchor of ANCHORS) {
    const target = anchor === "code" ? 1 : 4;
    const pairId = `dev-loan-list-${anchor}`;
    const t = rows[target];
    pairs.push({ pairId, doctype: "loan", layout: "list", anchor, seed: 0, target, answer: t.value, code: t.code });
    for (const lang of LANGS) {
      const items = [{ id: "title", role: "title", text: lang === "en" ? "Equipment Loans" : "장비 대여 목록", cell: [60, 30, 1040, 100], size: "title" }];
      rows.forEach((row, i) => {
        const y = 140 + i * 100;
        items.push(
          { id: `r${i}c`, role: "code", row: i, text: row.code, cell: [60, y, 240, y + 50], size: "body" },
          { id: `r${i}l`, role: "label", row: i, text: row.label[lang], cell: [240, y, 600, y + 50], size: "body" },
          { id: `r${i}v`, role: "value", row: i, text: row.value, cell: [600, y + 45, 800, y + 95], size: "body" },
        );
      });
      const question = anchor === "code" ? (lang === "en" ? `When is ${t.code}?` : `${t.code} 반납일은 언제인가요?`) : lang === "en" ? `When is the ${t.label.en.toLowerCase()} due?` : `${t.label.ko} 반납일은 언제인가요?`;
      const anchorItem = `r${target}${anchor === "code" ? "c" : "l"}`;
      images.push({ id: `${pairId}-${lang}`, pairId, lang, doctype: "loan", layout: "list", anchor, seed: 0, file: `${pairId}-${lang}.png`, page, question, answer: t.value, code: t.code, goldItems: [anchorItem, `r${target}v`], anchorItem, items, rules: [] });
    }
  }
  return { version: DESIGN_VERSION, set: "dev", page, font: FONT, images, pairs };
}

/**
 * Which page text items would the frozen selector match for this question, judged on the source text (one synthetic
 * OCR line per item)? Uses selectWindow itself so the rule is identical to the measured one.
 */
export function sourceMatches(image) {
  return image.items
    .filter((it) => {
      const words = it.text.split(/\s+/).map((w) => ({ text: w, box: [0, 0, 10, 10] }));
      return selectWindow([{ text: it.text, confidence: 99, box: [0, 0, 10, 10], words }], image.question, image.page.width, image.page.height).matched;
    })
    .map((it) => it.id);
}

/** Pre-registration checks on a design. Returns a list of problems (empty = pass). */
export function checkDesign(design, { expectedPairs } = {}) {
  const problems = [];
  const byPair = new Map();
  for (const im of design.images) {
    if (!byPair.has(im.pairId)) byPair.set(im.pairId, []);
    byPair.get(im.pairId).push(im);
  }
  if (expectedPairs !== undefined && byPair.size !== expectedPairs) problems.push(`pairs ${byPair.size} != ${expectedPairs}`);
  for (const [pairId, ims] of byPair) {
    const langs = ims.map((i) => i.lang).sort().join(",");
    if (langs !== "en,ko") problems.push(`${pairId}: languages ${langs}`);
    const [a, b] = ims;
    if (!b) continue;
    for (const k of ["answer", "code", "doctype", "layout", "anchor", "seed", "anchorItem"]) if (a[k] !== b[k]) problems.push(`${pairId}: ${k} differs`);
    if (JSON.stringify(a.page) !== JSON.stringify(b.page)) problems.push(`${pairId}: page size differs`);
    if (JSON.stringify(a.goldItems) !== JSON.stringify(b.goldItems)) problems.push(`${pairId}: gold items differ`);
    const cells = (im) => JSON.stringify(im.items.map((it) => [it.id, it.cell]));
    if (cells(a) !== cells(b)) problems.push(`${pairId}: cells differ`);
  }
  for (const im of design.images) {
    const keys = keywords(im.question).filter((k) => k !== "off" && k !== "yes");
    const code = im.code.toLowerCase();
    if (!/^[\x20-\x7e]+$/.test(im.answer)) problems.push(`${im.id}: answer not ASCII`);
    if (im.question.includes(im.answer) || digits(im.question).includes(digits(im.answer))) problems.push(`${im.id}: question exposes answer`);
    const codeCount = im.items.filter((it) => it.text.includes(im.code)).length;
    if (codeCount !== 1) problems.push(`${im.id}: code appears ${codeCount} times`);
    const matches = sourceMatches(im);
    if (im.anchor === "code") {
      if (JSON.stringify(keys) !== JSON.stringify([code])) problems.push(`${im.id}: keys ${JSON.stringify(keys)} != [${code}]`);
      if (JSON.stringify(matches) !== JSON.stringify([im.anchorItem])) problems.push(`${im.id}: source matches ${matches} != ${im.anchorItem}`);
    } else if (im.lang === "ko") {
      if (keys.length !== 0) problems.push(`${im.id}: Korean natural-language question has ASCII keys ${keys}`);
    } else {
      if (keys.length === 0) problems.push(`${im.id}: English natural-language question has no keys`);
      if (keys.includes(code)) problems.push(`${im.id}: natural-language question names the code`);
      if (JSON.stringify(matches) !== JSON.stringify([im.anchorItem])) problems.push(`${im.id}: source matches ${matches} != ${im.anchorItem}`);
    }
    const codes = im.items.filter((it) => it.role === "code").map((it) => it.text);
    if (new Set(codes.map((c) => c.length)).size !== 1 || new Set(codes).size !== codes.length) problems.push(`${im.id}: codes not distinct or not same length`);
  }
  return problems;
}

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/** Selector input only: id, file and question. No answer, code, item or gold geometry. */
export const questionsOf = (design) => ({ version: design.version, set: design.set, questions: design.images.map(({ id, file, question }) => ({ id, file, question })) });

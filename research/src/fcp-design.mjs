// Fresh crop padding study (FCP): deterministic design of 24 new EN/KO synthetic pairs (48 pages).
// Protocol: research/plans/2026-11-24-fresh-crop-padding-protocol.md (sections 3-4). Same three document types, page
// size, font and question templates as R09, but new label/other vocabularies, new code prefixes, new table and card
// geometry, new variant seeds and new target slots, all fixed here before any page is rendered.
// Rendering (ink boxes) is done by the unchanged R09 renderer tools/r09/render.py.
import { DOCTYPES as R09_DOCTYPES, FONT, PAGE, checkDesign, questionsOf, rng, sha256, sourceMatches } from "./r09-design.mjs";

export const DESIGN_VERSION = "fcp-design-1";
export { FONT, PAGE, checkDesign, questionsOf, sha256, sourceMatches };

const shuffle = (arr, r) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Same titles, column headers, value generators and question templates as R09 (document type identity);
// new code prefixes, labels and "other" vocabularies.
export const DOCTYPES = {
  schedule: {
    ...R09_DOCTYPES.schedule,
    prefix: "SV",
    labels: [
      ["Fire inspection", "화재 점검"], ["Supplier audit", "공급사 감사"], ["Intern orientation", "인턴 오리엔테이션"], ["Board rehearsal", "이사회 리허설"],
      ["Inventory count", "재고 실사"], ["Wellness seminar", "건강 세미나"], ["Software demo", "소프트웨어 시연"], ["Mentor lunch", "멘토 오찬"],
      ["Grant workshop", "보조금 워크숍"], ["Press briefing", "언론 브리핑"], ["Data cleanup", "데이터 정리"], ["Volunteer meeting", "봉사 모임"],
    ],
    others: [["Harbor Hall", "하버홀"], ["Lotus Room", "로터스룸"], ["Willow Studio", "윌로 스튜디오"], ["Summit Lounge", "서밋 라운지"], ["Garnet Room", "가닛룸"], ["Ivy Hall", "아이비홀"]],
  },
  invoice: {
    ...R09_DOCTYPES.invoice,
    prefix: "TQ",
    labels: [
      ["Printer paper", "복사 용지"], ["Ladder rack", "사다리 거치대"], ["Packing tape", "포장 테이프"], ["Floor mat", "바닥 매트"],
      ["Coffee beans", "커피 원두"], ["Hand soap", "물비누"], ["Storage bin", "보관함"], ["Wire spool", "전선 릴"],
      ["Monitor arm", "모니터 암"], ["Trash bags", "쓰레기봉투"], ["Battery pack", "배터리 팩"], ["Hinge set", "경첩 세트"],
    ],
    others: [["Saebyeol Trading", "새별상사"], ["Haneul Supply", "하늘물산"], ["Busan Parts", "부산부품"], ["Jinju Office", "진주문구"], ["Sejong Tools", "세종공구"], ["Gaon Metal", "가온금속"]],
  },
  status: {
    ...R09_DOCTYPES.status,
    prefix: "MR",
    labels: [
      ["Order router", "주문 라우터"], ["Ticket desk", "티켓 데스크"], ["Badge reader", "사원증 리더"], ["Photo resizer", "사진 변환기"],
      ["Chat relay", "채팅 중계"], ["Config store", "설정 저장소"], ["Metrics agent", "지표 수집기"], ["License server", "라이선스 서버"],
      ["Door controller", "출입문 제어기"], ["Firewall rules", "방화벽 규칙"], ["Payroll engine", "급여 엔진"], ["Map renderer", "지도 렌더러"],
    ],
    others: [["Stable", "안정"], ["Slow", "느림"], ["Partial", "부분 장애"], ["Offline", "오프라인"]],
  },
};

export const ROWS = 8;
export const DOCS = ["schedule", "invoice", "status"];
export const LAYOUTS = ["table", "cards"];
export const ANCHORS = ["code", "nl"];
export const VARIANTS = [1, 2];
export const LANGS = ["en", "ko"];

// New geometry (page pixels, half-open). Signed change from R09 in the protocol, section 3.3.
export const TABLE = { x: [90, 270, 660, 960, 1190], headerY: 190, rowH: 66, title: [90, 60, 1190, 130] };
export const CARD = { x0: [60, 680], w: 540, y0: 165, h: 160, gap: 30, labelW: 160, lines: [30, 80, 130], half: 24, title: [60, 50, 1220, 120] };

/** Pre-registered target slot (row or card index 0..7) per layout x anchor x variant, drawn from its own seed. */
export function targetSlot(layout, anchor, variant) {
  const r = rng(`${DESIGN_VERSION}|target|${layout}|${anchor}|v${variant}`);
  return Math.floor(r() * ROWS);
}
export const TARGET_SLOT = Object.fromEntries(LAYOUTS.map((l) => [l, Object.fromEntries(ANCHORS.map((a) => [a, Object.fromEntries(VARIANTS.map((v) => [v, targetSlot(l, a, v)]))]))]));

function tableItems(doc, lang, rows) {
  const items = [{ id: "title", role: "title", text: doc.title[lang], cell: TABLE.title, size: "title" }];
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
  const items = [{ id: "title", role: "title", text: doc.title[lang], cell: CARD.title, size: "title" }];
  const rules = [];
  rows.forEach((row, i) => {
    const x = CARD.x0[i % 2];
    const y = CARD.y0 + Math.floor(i / 2) * (CARD.h + CARD.gap);
    rules.push([x, y, x + CARD.w, y + 1], [x, y + CARD.h - 1, x + CARD.w, y + CARD.h]);
    const line = (k) => [y + CARD.lines[k] - CARD.half, y + CARD.lines[k] + CARD.half];
    const [l0, l1, l2] = [line(0), line(1), line(2)];
    const cols = doc.columns[lang];
    const xa = x + 20;
    const xb = x + 20 + CARD.labelW;
    const xc = x + CARD.w - 20;
    items.push(
      { id: `r${i}c`, role: "code", row: i, text: row.code, cell: [xa, l0[0], xb, l0[1]], size: "body" },
      { id: `r${i}l`, role: "label", row: i, text: row.label[lang], cell: [xb, l0[0], xc, l0[1]], size: "body" },
      { id: `r${i}vk`, role: "fieldname", row: i, text: cols[3], cell: [xa, l1[0], xb, l1[1]], size: "body" },
      { id: `r${i}v`, role: "value", row: i, text: row.value, cell: [xb, l1[0], xc, l1[1]], size: "body" },
      { id: `r${i}ok`, role: "fieldname", row: i, text: cols[2], cell: [xa, l2[0], xb, l2[1]], size: "body" },
      { id: `r${i}o`, role: "other", row: i, text: row.other[lang], cell: [xb, l2[0], xc, l2[1]], size: "body" },
    );
  });
  return { items, rules };
}

const digits = (s) => s.replace(/[^0-9]/g, "");

/** Rows of one pair: the variant seed draws labels, codes, values and "other" fields; the target slot is pre-registered. */
function drawPair(docName, layout, anchor, variant) {
  const doc = DOCTYPES[docName];
  const r = rng(`${DESIGN_VERSION}|main|${docName}|${layout}|${anchor}|v${variant}`);
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
  return { rows, target: TARGET_SLOT[layout][anchor][variant] };
}

export const idOf = (docName, layout, anchor, variant, lang) => `${docName}-${layout}-${anchor}-v${variant}-${lang}`;

export function buildDesign() {
  const images = [];
  const pairs = [];
  for (const docName of DOCS)
    for (const layout of LAYOUTS)
      for (const anchor of ANCHORS)
        for (const variant of VARIANTS) {
          const pairId = `${docName}-${layout}-${anchor}-v${variant}`;
          const { rows, target } = drawPair(docName, layout, anchor, variant);
          const t = rows[target];
          const doc = DOCTYPES[docName];
          pairs.push({ pairId, doctype: docName, layout, anchor, variant, target, answer: t.value, code: t.code });
          for (const lang of LANGS) {
            const question = anchor === "code" ? doc.question.code[lang](t.code) : doc.question.nl[lang](t.label);
            const { items, rules } = layout === "table" ? tableItems(doc, lang, rows) : cardItems(doc, lang, rows);
            const anchorItem = items.find((it) => it.row === target && it.role === (anchor === "code" ? "code" : "label")).id;
            const valueItem = items.find((it) => it.row === target && it.role === "value").id;
            // `seed` is kept (= variant) so the R09 design checks apply unchanged.
            images.push({ id: idOf(docName, layout, anchor, variant, lang), pairId, lang, doctype: docName, layout, anchor, variant, seed: variant, file: `${idOf(docName, layout, anchor, variant, lang)}.png`, page: PAGE, question, answer: t.value, code: t.code, goldItems: [anchorItem, valueItem], anchorItem, items, rules });
          }
        }
  return { version: DESIGN_VERSION, set: "fcp-main", page: PAGE, font: FONT, geometry: { table: TABLE, card: CARD }, targetSlot: TARGET_SLOT, images, pairs };
}

/**
 * Text-level duplicate check (protocol section 4, items 2-7) of a new design against older designs (R09 dev and
 * held-out) and within itself. violations must be empty; shared lists the planned shared structure (not failures).
 */
export function dedupCheck(design, olderDesigns) {
  const violations = [];
  const textsOf = (d, role) => new Set(d.images.flatMap((im) => im.items.filter((it) => it.role === role).map((it) => it.text)));
  const rowsOf = (d) => d.images.flatMap((im) => {
    const rows = new Map();
    for (const it of im.items) if (it.row !== undefined) (rows.get(it.row) || rows.set(it.row, {}).get(it.row))[it.role] = it.text;
    return [...rows.values()];
  });
  const cellsKey = (im) => JSON.stringify(im.items.map((it) => [it.id, it.cell]));
  const textKey = (im) => JSON.stringify(im.items.map((it) => [it.id, it.text]));
  const old = olderDesigns.flatMap((d) => d.images);
  // 2. codes
  const oldCodes = new Set(olderDesigns.flatMap((d) => [...textsOf(d, "code")]));
  const newCodeList = design.images.filter((im) => im.lang === "en").flatMap((im) => im.items.filter((it) => it.role === "code").map((it) => it.text));
  for (const c of new Set(newCodeList)) if (oldCodes.has(c)) violations.push(`code ${c} used before`);
  // 3. label and other vocabularies
  for (const role of ["label", "other"]) {
    const before = new Set(olderDesigns.flatMap((d) => [...textsOf(d, role)]));
    for (const t of textsOf(design, role)) if (before.has(t)) violations.push(`${role} text "${t}" used before`);
  }
  // 4. target records
  const oldRows = olderDesigns.flatMap(rowsOf);
  const oldCV = new Set(oldRows.map((r) => `${r.code}|${r.value}`));
  const oldLV = new Set(oldRows.map((r) => `${r.label}|${r.value}`));
  for (const im of design.images) {
    const t = im.items.filter((it) => it.row !== undefined && it.row === im.items.find((x) => x.id === im.anchorItem).row);
    const get = (role) => t.find((it) => it.role === role)?.text;
    if (oldCV.has(`${get("code")}|${get("value")}`)) violations.push(`${im.id}: target (code, value) used before`);
    if (oldLV.has(`${get("label")}|${get("value")}`)) violations.push(`${im.id}: target (label, value) used before`);
  }
  // 5. layout and 6. content against older pages
  const oldCells = new Set(old.map(cellsKey));
  const oldText = new Set(old.map(textKey));
  for (const im of design.images) {
    if (oldCells.has(cellsKey(im))) violations.push(`${im.id}: layout (cells) used before`);
    if (oldText.has(textKey(im))) violations.push(`${im.id}: content used before`);
  }
  // 6. content within the new set
  const seen = new Map();
  for (const im of design.images) {
    const k = textKey(im);
    if (seen.has(k)) violations.push(`${im.id}: content duplicates ${seen.get(k)}`);
    else seen.set(k, im.id);
  }
  // 7. planned shared structure
  const shared = [
    "pair: EN and KO pages share codes, values, cells and target slot",
    "doctype: title and column names shared by every page of one document type and language",
    "layout: cell geometry shared by every page of one layout (table or cards)",
    "target slot: shared by the three document types of one layout x anchor x variant",
  ];
  const layoutGroups = new Set(design.images.map(cellsKey)).size;
  return {
    violations,
    counts: { newImages: design.images.length, newCodes: newCodeList.length, newCodesDistinct: new Set(newCodeList).size, olderImages: old.length, layoutGroups },
    shared,
  };
}

/** Page SHA-256 duplicates within the new set and against older pages (section 4 item 1, after rendering). */
export function pageShaCheck(newShas, olderShas) {
  const violations = [];
  const older = new Set(Object.values(olderShas));
  const seen = new Map();
  for (const [id, s] of Object.entries(newShas)) {
    if (older.has(s)) violations.push(`${id}: page SHA used before`);
    if (seen.has(s)) violations.push(`${id}: page SHA duplicates ${seen.get(s)}`);
    else seen.set(s, id);
  }
  return { violations, newPages: Object.keys(newShas).length, olderPages: Object.keys(olderShas).length };
}

/** Selector-side image list: no answer, code, item text or geometry. */
export const selectorIndexOf = (design, shaById) => ({
  version: design.version,
  images: design.images.map(({ id, file, pairId, lang, doctype, layout, anchor, variant, page }) => ({ id, file, pairId, lang, doctype, layout, anchor, variant, page, sha256: shaById ? shaById[id] : undefined })),
});

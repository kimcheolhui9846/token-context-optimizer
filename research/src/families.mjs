// Thin-slice development families. Each family yields one clean RGB PNG (long side 2048) and two
// questions with gold answers and an evidence box in clean pixel coordinates.
// DEVELOPMENT ONLY: never reuse these templates or seeds for the 12 calibration or 36 held-out families.

const FONT = "Arial, Helvetica, sans-serif";

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = (r, list) => list[Math.floor(r() * list.length)];
export const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const money = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Approximate text box for Arial: width ~0.56em per char, ascent ~0.8em, descent ~0.25em.
export function textBox(x, y, size, text, anchor = "start") {
  const w = Math.ceil(String(text).length * size * 0.56);
  const left = anchor === "end" ? x - w : anchor === "middle" ? x - w / 2 : x;
  return [Math.floor(left), Math.floor(y - size * 0.8), w, Math.ceil(size * 1.05)];
}
export const union = (...boxes) => {
  const x0 = Math.min(...boxes.map((b) => b[0]));
  const y0 = Math.min(...boxes.map((b) => b[1]));
  const x1 = Math.max(...boxes.map((b) => b[0] + b[2]));
  const y1 = Math.max(...boxes.map((b) => b[1] + b[3]));
  return [x0, y0, x1 - x0, y1 - y0];
};

export class Svg {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.parts = [`<rect width="${w}" height="${h}" fill="#ffffff"/>`];
  }
  text(x, y, size, s, { fill = "#111", weight = "normal", anchor = "start" } = {}) {
    this.parts.push(`<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`);
    return textBox(x, y, size, s, anchor);
  }
  rect(x, y, w, h, fill, stroke = "none", rx = 0) {
    this.parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="2" rx="${rx}"/>`);
  }
  line(x1, y1, x2, y2, stroke = "#999", width = 2, dash = "") {
    this.parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`);
  }
  raw(s) {
    this.parts.push(s);
  }
  toString() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.w}" height="${this.h}">${this.parts.join("")}</svg>`;
  }
}

export const WORDS = "the of supply quarterly review team schedule budget update vendor contract shipment report department policy request approval access facility training project meeting".split(" ");
export const sentence = (r, n) => Array.from({ length: n }, () => pick(r, WORDS)).join(" ");

function docInvoice(seed) {
  const r = rng(seed);
  const s = new Svg(1536, 2048);
  const inv = `INV-${int(r, 10000, 99999)}`;
  s.text(96, 160, 64, "Northwind Office Supply", { weight: "bold" });
  s.text(96, 230, 30, "1820 Harbor Avenue, Suite 400", { fill: "#444" });
  const invBox = s.text(1440, 160, 18, `Invoice No. ${inv}`, { anchor: "end", fill: "#333" });
  s.text(1440, 196, 18, `Issued ${int(r, 1, 28)} May 2026`, { anchor: "end", fill: "#333" });
  const items = ["Copy paper A4", "Toner cartridge", "Desk organizer", "Ballpoint pens", "Stapler", "Binder clips", "Whiteboard markers", "Notebook set"];
  let y = 420;
  s.rect(96, y - 50, 1344, 70, "#eef2f7");
  ["Item", "Qty", "Unit", "Amount"].forEach((h, i) => s.text([120, 900, 1080, 1416][i], y, 28, h, { weight: "bold", anchor: i === 0 ? "start" : "end" }));
  let total = 0;
  for (const item of items) {
    y += 90;
    const qty = int(r, 1, 12);
    const unit = int(r, 150, 4800) / 100;
    const amount = Math.round(qty * unit * 100) / 100;
    total += amount;
    s.text(120, y, 28, item);
    s.text(900, y, 28, String(qty), { anchor: "end" });
    s.text(1080, y, 28, money(unit), { anchor: "end" });
    s.text(1416, y, 28, money(amount), { anchor: "end" });
    s.line(96, y + 30, 1440, y + 30, "#dde");
  }
  total = Math.round(total * 100) / 100;
  y += 140;
  const l = s.text(1000, y, 40, "Total", { weight: "bold", anchor: "end" });
  const t = s.text(1416, y, 40, `$${money(total)}`, { weight: "bold", anchor: "end" });
  s.text(96, 1900, 22, sentence(r, 12), { fill: "#666" });
  return {
    svg: s.toString(),
    questions: [
      { id: "q1", smallText: true, text: "What is the invoice number?", answers: [inv], evidence: invBox },
      { id: "q2", smallText: false, text: "What is the total amount on the invoice?", answers: [`$${money(total)}`, money(total)], evidence: union(l, t) },
    ],
  };
}

function docMemo(seed) {
  const r = rng(seed);
  const s = new Svg(1536, 2048);
  const day = int(r, 2, 27);
  const month = pick(r, ["February", "March", "April", "June", "September"]);
  const ref = `QX-${int(r, 1000, 9999)}-${pick(r, ["K", "R", "T", "W"])}${int(r, 10, 99)}`;
  s.text(96, 170, 60, "INTERNAL MEMORANDUM", { weight: "bold" });
  s.text(96, 260, 30, "To: Facilities and Procurement Teams");
  s.text(96, 310, 30, "From: Operations Office");
  const d = s.text(96, 360, 30, `Date: ${day} ${month} 2026`);
  s.line(96, 400, 1440, 400, "#333", 3);
  let y = 480;
  for (let p = 0; p < 4; p++) {
    for (let k = 0; k < 6; k++) {
      s.text(96, y, 28, sentence(r, 11));
      y += 46;
    }
    y += 40;
  }
  s.line(96, 1880, 700, 1880, "#999");
  const f = s.text(96, 1930, 17, `Ref. code: ${ref}  (cite this code in all replies)`, { fill: "#444" });
  return {
    svg: s.toString(),
    questions: [
      { id: "q1", smallText: true, text: "What is the reference code in the footnote?", answers: [ref], evidence: f },
      { id: "q2", smallText: false, text: "What date is written on the memo? Answer as day month year.", answers: [`${day} ${month} 2026`], evidence: d },
    ],
  };
}

function chartBar(seed) {
  const r = rng(seed);
  const s = new Svg(2048, 1536);
  const cats = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  const vals = cats.map(() => int(r, 120, 940));
  const target = pick(r, cats);
  const n = int(r, 1000, 9999);
  s.text(1024, 120, 52, "Monthly Service Requests", { weight: "bold", anchor: "middle" });
  const x0 = 220, y0 = 1260, h = 1000, bw = 180, gap = 100;
  s.line(x0, y0, 1900, y0, "#333", 3);
  s.line(x0, y0, x0, y0 - h - 20, "#333", 3);
  let evidence;
  cats.forEach((c, i) => {
    const bh = Math.round((vals[i] / 1000) * h);
    const x = x0 + 80 + i * (bw + gap);
    s.rect(x, y0 - bh, bw, bh, "#4a78c2");
    const v = s.text(x + bw / 2, y0 - bh - 18, 26, String(vals[i]), { anchor: "middle" });
    const lab = s.text(x + bw / 2, y0 + 50, 30, c, { anchor: "middle" });
    if (c === target) evidence = union(v, lab, [x, y0 - bh, bw, bh]);
  });
  const nb = s.text(x0, 1440, 17, `Survey sample n = ${n.toLocaleString("en-US")}; figures are preliminary.`, { fill: "#555" });
  return {
    svg: s.toString(),
    questions: [
      { id: "q1", smallText: false, text: `What value is labeled on the ${target} bar?`, answers: [String(vals[cats.indexOf(target)])], evidence },
      { id: "q2", smallText: true, text: "What is the survey sample size noted under the chart?", answers: [n.toLocaleString("en-US"), String(n)], evidence: nb },
    ],
  };
}

function chartLine(seed) {
  const r = rng(seed);
  const s = new Svg(2048, 1536);
  const names = ["Northern region", "Southern region", "Coastal region", "Inland region"];
  const a = pick(r, names);
  const b = pick(r, names.filter((x) => x !== a));
  const dashed = r() < 0.5 ? a : b;
  s.text(1024, 120, 50, "Weekly Throughput Index", { weight: "bold", anchor: "middle" });
  const x0 = 220, y0 = 1240, w = 1600, h = 950;
  s.line(x0, y0, x0 + w, y0, "#333", 3);
  s.line(x0, y0, x0, y0 - h, "#333", 3);
  for (let k = 0; k <= 5; k++) {
    const yy = y0 - (k * h) / 5;
    s.line(x0, yy, x0 + w, yy, "#e3e3e3", 1);
    s.text(x0 - 20, yy + 8, 22, String(k * 20), { anchor: "end", fill: "#444" });
  }
  let peak = { v: -1 };
  for (const name of [a, b]) {
    const pts = Array.from({ length: 12 }, (_, i) => {
      const v = Math.round((20 + r() * 70) * 10) / 10;
      const p = { x: x0 + 60 + i * 135, y: y0 - (v / 100) * h, v };
      if (v > peak.v) peak = p;
      return p;
    });
    const color = name === a ? "#c0392b" : "#2471a3";
    s.raw(`<polyline fill="none" stroke="${color}" stroke-width="6"${name === dashed ? ' stroke-dasharray="24 16"' : ""} points="${pts.map((p) => `${p.x},${p.y.toFixed(1)}`).join(" ")}"/>`);
  }
  s.raw(`<circle cx="${peak.x}" cy="${peak.y.toFixed(1)}" r="10" fill="#000"/>`);
  const pk = s.text(peak.x + 18, peak.y - 18, 18, `Peak: ${peak.v.toFixed(1)}`, { fill: "#000" });
  const legend = [];
  [a, b].forEach((name, i) => {
    const ly = 1340 + i * 60;
    s.line(700, ly - 10, 820, ly - 10, name === a ? "#c0392b" : "#2471a3", 6, name === dashed ? "24 16" : "");
    legend.push([700, ly - 20, 120, 20], s.text(840, ly, 30, name));
  });
  return {
    svg: s.toString(),
    questions: [
      { id: "q1", smallText: true, text: "What value is written next to the peak marker?", answers: [peak.v.toFixed(1)], evidence: union(pk, [peak.x - 12, peak.y - 12, 24, 24]) },
      { id: "q2", smallText: false, text: "Which region's series is drawn with a dashed line?", answers: [dashed, dashed.split(" ")[0]], evidence: union(...legend) },
    ],
  };
}

function uiSettings(seed) {
  const r = rng(seed);
  const s = new Svg(2048, 1536);
  const rows = ["Wi-Fi", "Bluetooth", "Location services", "Auto-update", "Dark mode", "Notifications"];
  const states = rows.map(() => (r() < 0.5 ? "On" : "Off"));
  const target = pick(r, rows);
  const build = `${int(r, 3, 6)}.${int(r, 0, 9)}.${int(r, 10, 40)} (build ${int(r, 1000, 9999)})`;
  s.rect(0, 0, 2048, 110, "#20262e");
  s.text(60, 72, 40, "Settings", { fill: "#fff", weight: "bold" });
  s.rect(0, 110, 440, 1426, "#f2f4f7");
  ["General", "Network", "Privacy", "Display", "About"].forEach((m, i) => s.text(60, 200 + i * 80, 32, m, { fill: i === 1 ? "#1a5fb4" : "#333" }));
  let evidence;
  rows.forEach((row, i) => {
    const y = 240 + i * 150;
    s.line(520, y + 60, 1960, y + 60, "#e1e4e8");
    const lb = s.text(560, y, 36, row);
    const on = states[i] === "On";
    s.rect(1700, y - 38, 110, 52, on ? "#2ea043" : "#c9ced6", "none", 26);
    s.raw(`<circle cx="${on ? 1784 : 1726}" cy="${y - 12}" r="21" fill="#fff"/>`);
    const st = s.text(1680, y, 30, states[i], { anchor: "end", fill: "#555" });
    if (row === target) evidence = union(lb, st, [1700, y - 38, 110, 52]);
  });
  const bb = s.text(1960, 1480, 16, `Version ${build}`, { anchor: "end", fill: "#777" });
  const buildNo = build.match(/build (\d+)/)[1];
  return {
    svg: s.toString(),
    questions: [
      { id: "q1", smallText: false, text: `Is ${target} turned on or off?`, answers: [states[rows.indexOf(target)]], evidence },
      { id: "q2", smallText: true, text: "What is the build number shown at the bottom of the screen?", answers: [buildNo], evidence: bb },
    ],
  };
}

function uiDashboard(seed) {
  const r = rng(seed);
  const s = new Svg(2048, 1536);
  const badge = int(r, 3, 48);
  const cards = [
    ["Active users", int(r, 1200, 98000).toLocaleString("en-US")],
    ["Open tickets", String(int(r, 12, 480))],
    ["Avg. response", `${int(r, 2, 59)} min`],
    ["Uptime", `${(99 + r()).toFixed(2)}%`],
  ];
  const target = pick(r, cards.slice(0, 3));
  s.rect(0, 0, 2048, 120, "#ffffff", "#e5e7eb");
  s.text(60, 78, 44, "Ops Dashboard", { weight: "bold" });
  s.raw(`<circle cx="1880" cy="60" r="26" fill="none" stroke="#333" stroke-width="3"/>`);
  s.raw(`<circle cx="1906" cy="36" r="17" fill="#d62828"/>`);
  s.text(1906, 42, 16, String(badge), { anchor: "middle", fill: "#fff", weight: "bold" });
  let evidence;
  cards.forEach(([label, value], i) => {
    const x = 80 + (i % 2) * 960, y = 220 + Math.floor(i / 2) * 560;
    s.rect(x, y, 880, 480, "#f8fafc", "#d0d7de", 16);
    const lb = s.text(x + 50, y + 90, 34, label, { fill: "#555" });
    const vb = s.text(x + 50, y + 260, 110, value, { weight: "bold" });
    if (label === target[0]) evidence = union(lb, vb);
  });
  return {
    svg: s.toString(),
    questions: [
      { id: "q1", smallText: true, text: "What number is shown on the notification badge?", answers: [String(badge)], evidence: [1880, 10, 52, 52] },
      { id: "q2", smallText: false, text: `What value is shown on the "${target[0]}" card?`, answers: [target[1], target[1].replace(/,/g, "")], evidence },
    ],
  };
}

export const FAMILIES = [
  { id: "dev-doc-invoice", domain: "document", seed: 101, build: docInvoice },
  { id: "dev-doc-memo", domain: "document", seed: 202, build: docMemo },
  { id: "dev-chart-bar", domain: "chart", seed: 303, build: chartBar },
  { id: "dev-chart-line", domain: "chart", seed: 404, build: chartLine },
  { id: "dev-ui-settings", domain: "ui", seed: 505, build: uiSettings },
  { id: "dev-ui-dashboard", domain: "ui", seed: 606, build: uiDashboard },
];

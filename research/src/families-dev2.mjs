// Development set 2: denser layouts and smaller text (13-14 px at long side 2048), three questions per family.
// GPT-4o high downsizes a 2048x1536 image to 1024x768, so 13 px text reaches the model at about 6.5 px.
// DEVELOPMENT ONLY: never reuse these templates or seeds for the 12 calibration or 36 held-out families.
import { Svg, int, money, pick, rng, sentence, union } from "./families.mjs";

const SMALL = 13;

function invoiceDense(seed) {
  const r = rng(seed);
  const s = new Svg(1536, 2048);
  const inv = `INV-${int(r, 10000, 99999)}-${pick(r, ["A", "C", "E", "H"])}`;
  s.text(80, 130, 56, "Harborline Industrial Parts", { weight: "bold" });
  const invBox = s.text(1456, 120, SMALL + 1, `Invoice No. ${inv}`, { anchor: "end", fill: "#333" });
  s.text(1456, 145, SMALL + 1, `Terms: net ${pick(r, [15, 30, 45])} days`, { anchor: "end", fill: "#333" });
  const names = ["Hex bolt M8", "Hex bolt M10", "Washer 8mm", "Washer 10mm", "Lock nut M8", "Lock nut M10", "Bearing 6204", "Bearing 6205", "V-belt A42", "V-belt A48", "Hose clamp 25", "Hose clamp 32", "O-ring 20x2", "O-ring 25x2", "Grease 400g", "Shim set"];
  let y = 300;
  s.rect(80, y - 34, 1376, 48, "#eef2f7");
  ["Item", "Qty", "Unit", "Amount"].forEach((h, i) => s.text([100, 900, 1100, 1436][i], y, 20, h, { weight: "bold", anchor: i === 0 ? "start" : "end" }));
  let total = 0;
  const target = pick(r, names);
  let targetAmount, targetBox;
  for (const item of names) {
    y += 56;
    const qty = int(r, 1, 40);
    const unit = int(r, 35, 9800) / 100;
    const amount = Math.round(qty * unit * 100) / 100;
    total += amount;
    const a = s.text(100, y, 20, item);
    s.text(900, y, 20, String(qty), { anchor: "end" });
    s.text(1100, y, 20, money(unit), { anchor: "end" });
    const b = s.text(1436, y, 20, money(amount), { anchor: "end" });
    s.line(80, y + 18, 1456, y + 18, "#e4e7eb", 1);
    if (item === target) { targetAmount = money(amount); targetBox = union(a, b); }
  }
  total = Math.round(total * 100) / 100;
  y += 110;
  const l = s.text(1100, y, 34, "Total", { weight: "bold", anchor: "end" });
  const t = s.text(1436, y, 34, `$${money(total)}`, { weight: "bold", anchor: "end" });
  for (let k = 0; k < 4; k++) s.text(80, 1760 + k * 40, 18, sentence(r, 14), { fill: "#666" });
  return {
    svg: s.toString(),
    questions: [
      { id: "q1", smallText: true, text: "What is the invoice number?", answers: [inv], evidence: invBox },
      { id: "q2", smallText: false, text: `What is the amount for the line item "${target}"?`, answers: [targetAmount], evidence: targetBox },
      { id: "q3", smallText: false, text: "What is the total amount on the invoice?", answers: [`$${money(total)}`, money(total)], evidence: union(l, t) },
    ],
  };
}

function memoDense(seed) {
  const r = rng(seed);
  const s = new Svg(1536, 2048);
  const day = int(r, 2, 27);
  const month = pick(r, ["January", "March", "May", "July", "October"]);
  const ref = `ZT-${int(r, 1000, 9999)}-${pick(r, ["B", "F", "M", "P"])}${int(r, 10, 99)}`;
  const room = `${pick(r, ["B", "C", "D"])}-${int(r, 100, 499)}`;
  s.text(80, 140, 52, "OPERATIONS NOTICE", { weight: "bold" });
  const d = s.text(80, 210, 26, `Issued: ${day} ${month} 2026`);
  s.line(80, 240, 1456, 240, "#333", 3);
  let y = 300;
  const roomLine = int(r, 8, 30);
  let roomBox, line = 0;
  for (let p = 0; p < 6; p++) {
    for (let k = 0; k < 7; k++) {
      line++;
      if (line === roomLine) {
        const pre = sentence(r, 5);
        roomBox = s.text(80, y, 20, `${pre} assigned room: ${room} for the ${sentence(r, 3)}`);
      } else s.text(80, y, 20, sentence(r, 14));
      y += 34;
    }
    y += 26;
  }
  s.line(80, 1930, 600, 1930, "#999");
  const f = s.text(80, 1965, SMALL, `Ref. ${ref}  (quote this reference in all correspondence)`, { fill: "#444" });
  return {
    svg: s.toString(),
    questions: [
      { id: "q1", smallText: true, text: "What is the reference code in the footnote?", answers: [ref], evidence: f },
      { id: "q2", smallText: false, text: "Which room is assigned in the notice?", answers: [room], evidence: roomBox },
      { id: "q3", smallText: false, text: "On what date was the notice issued? Answer as day month year.", answers: [`${day} ${month} 2026`], evidence: d },
    ],
  };
}

function bar12(seed) {
  const r = rng(seed);
  const s = new Svg(2048, 1536);
  const cats = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const vals = cats.map(() => int(r, 100, 990));
  while (new Set(vals).size !== vals.length || vals.filter((v) => v === Math.max(...vals)).length > 1) vals[int(r, 0, 11)] = int(r, 100, 990);
  const target = pick(r, cats);
  const n = int(r, 1000, 9999);
  s.text(1024, 100, 46, "Monthly Inspection Count", { weight: "bold", anchor: "middle" });
  const x0 = 160, y0 = 1300, h = 1080, bw = 100, gap = 50;
  s.line(x0, y0, 1960, y0, "#333", 3);
  let evidence, maxBox;
  cats.forEach((c, i) => {
    const bh = Math.round((vals[i] / 1000) * h);
    const x = x0 + 40 + i * (bw + gap);
    s.rect(x, y0 - bh, bw, bh, "#3f8f6b");
    const v = s.text(x + bw / 2, y0 - bh - 12, 18, String(vals[i]), { anchor: "middle" });
    const lab = s.text(x + bw / 2, y0 + 38, 22, c, { anchor: "middle" });
    const box = union(v, lab, [x, y0 - bh, bw, bh]);
    if (c === target) evidence = box;
    if (vals[i] === Math.max(...vals)) maxBox = box;
  });
  const nb = s.text(x0, 1460, SMALL, `Inspection sample n = ${n.toLocaleString("en-US")}; weekend audits excluded.`, { fill: "#555" });
  return {
    svg: s.toString(),
    questions: [
      { id: "q1", smallText: false, text: `What value is labeled on the ${target} bar?`, answers: [String(vals[cats.indexOf(target)])], evidence },
      { id: "q2", smallText: true, text: "What is the inspection sample size noted under the chart?", answers: [n.toLocaleString("en-US"), String(n)], evidence: nb },
      { id: "q3", smallText: false, text: "Which month has the tallest bar? Answer with the month label.", answers: [cats[vals.indexOf(Math.max(...vals))]], evidence: maxBox },
    ],
  };
}

function lineSmall(seed) {
  const r = rng(seed);
  const s = new Svg(2048, 1536);
  const names = ["Plant Alpha", "Plant Bravo", "Plant Delta", "Plant Echo"];
  const a = pick(r, names);
  const b = pick(r, names.filter((x) => x !== a));
  const dashed = r() < 0.5 ? a : b;
  const time = `${String(int(r, 6, 22)).padStart(2, "0")}:${String(int(r, 0, 59)).padStart(2, "0")}`;
  s.text(1024, 110, 46, "Hourly Output Index", { weight: "bold", anchor: "middle" });
  const upd = s.text(1980, 60, SMALL, `Last updated ${time}`, { anchor: "end", fill: "#666" });
  const x0 = 200, y0 = 1220, w = 1650, h = 950;
  s.line(x0, y0, x0 + w, y0, "#333", 3);
  s.line(x0, y0, x0, y0 - h, "#333", 3);
  for (let k = 0; k <= 5; k++) {
    const yy = y0 - (k * h) / 5;
    s.line(x0, yy, x0 + w, yy, "#e6e6e6", 1);
    s.text(x0 - 16, yy + 7, 20, String(k * 20), { anchor: "end", fill: "#444" });
  }
  let peak = { v: -1 };
  for (const name of [a, b]) {
    const pts = Array.from({ length: 14 }, (_, i) => {
      const v = Math.round((15 + r() * 75) * 10) / 10;
      const p = { x: x0 + 50 + i * 120, y: y0 - (v / 100) * h, v };
      if (v > peak.v) peak = p;
      return p;
    });
    const color = name === a ? "#8e44ad" : "#d35400";
    s.raw(`<polyline fill="none" stroke="${color}" stroke-width="5"${name === dashed ? ' stroke-dasharray="22 14"' : ""} points="${pts.map((p) => `${p.x},${p.y.toFixed(1)}`).join(" ")}"/>`);
  }
  s.raw(`<circle cx="${peak.x}" cy="${peak.y.toFixed(1)}" r="8" fill="#000"/>`);
  const pk = s.text(peak.x + 14, peak.y - 14, SMALL + 1, `Peak ${peak.v.toFixed(1)}`, { fill: "#000" });
  const legend = [];
  [a, b].forEach((name, i) => {
    const ly = 1330 + i * 56;
    s.line(760, ly - 9, 870, ly - 9, name === a ? "#8e44ad" : "#d35400", 5, name === dashed ? "22 14" : "");
    legend.push([760, ly - 20, 110, 20], s.text(890, ly, 28, name));
  });
  return {
    svg: s.toString(),
    questions: [
      { id: "q1", smallText: true, text: "What value is written next to the peak marker?", answers: [peak.v.toFixed(1)], evidence: union(pk, [peak.x - 10, peak.y - 10, 20, 20]) },
      { id: "q2", smallText: false, text: "Which plant's series is drawn with a dashed line?", answers: [dashed, dashed.replace("Plant ", "")], evidence: union(...legend) },
      { id: "q3", smallText: true, text: "At what time was the chart last updated? Answer as HH:MM.", answers: [time], evidence: upd },
    ],
  };
}

function settingsDense(seed) {
  const r = rng(seed);
  const s = new Svg(2048, 1536);
  const rows = ["Wi-Fi", "Bluetooth", "Airplane mode", "Mobile data", "Hotspot", "VPN", "Location", "Auto-rotate", "Dark mode", "Battery saver", "Do not disturb", "Auto-update"];
  const states = rows.map(() => (r() < 0.5 ? "On" : "Off"));
  const target = pick(r, rows);
  const build = int(r, 1000, 9999);
  const storage = `${int(r, 10, 99)}.${int(r, 0, 9)} GB`;
  s.rect(0, 0, 2048, 90, "#1f2937");
  s.text(48, 60, 34, "Device Settings", { fill: "#fff", weight: "bold" });
  s.rect(0, 90, 400, 1446, "#f3f4f6");
  ["General", "Connections", "Display", "Battery", "Storage", "About"].forEach((m, i) => s.text(48, 170 + i * 64, 26, m, { fill: i === 1 ? "#1d4ed8" : "#333" }));
  const st = s.text(48, 1440, SMALL + 1, `Storage used: ${storage} of 128 GB`, { fill: "#555" });
  let evidence;
  rows.forEach((row, i) => {
    const y = 170 + i * 98;
    s.line(460, y + 40, 1980, y + 40, "#e5e7eb", 1);
    const lb = s.text(490, y, 26, row);
    const on = states[i] === "On";
    s.rect(1780, y - 28, 84, 40, on ? "#16a34a" : "#cbd5e1", "none", 20);
    s.raw(`<circle cx="${on ? 1844 : 1800}" cy="${y - 8}" r="16" fill="#fff"/>`);
    const sb = s.text(1760, y, 22, states[i], { anchor: "end", fill: "#555" });
    if (row === target) evidence = union(lb, sb, [1780, y - 28, 84, 40]);
  });
  const bb = s.text(1990, 1500, SMALL, `Firmware 7.${int(r, 0, 9)}.${int(r, 10, 60)} (build ${build})`, { anchor: "end", fill: "#777" });
  return {
    svg: s.toString(),
    questions: [
      { id: "q1", smallText: false, text: `Is ${target} turned on or off?`, answers: [states[rows.indexOf(target)]], evidence },
      { id: "q2", smallText: true, text: "What is the build number shown at the bottom of the screen?", answers: [String(build)], evidence: bb },
      { id: "q3", smallText: true, text: "How much storage is used, according to the sidebar? Answer with the number and unit.", answers: [storage], evidence: st },
    ],
  };
}

function dashboardDense(seed) {
  const r = rng(seed);
  const s = new Svg(2048, 1536);
  const badge = int(r, 3, 99);
  const sync = `${String(int(r, 0, 23)).padStart(2, "0")}:${String(int(r, 0, 59)).padStart(2, "0")}`;
  const labels = ["Active users", "Open tickets", "Avg. response", "Uptime", "Queued jobs", "Error rate", "Deployments", "Cache hit"];
  const values = [int(r, 1200, 98000).toLocaleString("en-US"), String(int(r, 12, 480)), `${int(r, 2, 59)} min`, `${(99 + r()).toFixed(2)}%`, String(int(r, 0, 900)), `${(r() * 3).toFixed(2)}%`, String(int(r, 1, 60)), `${int(r, 60, 99)}%`];
  const ti = int(r, 0, 7);
  s.rect(0, 0, 2048, 96, "#ffffff", "#e5e7eb");
  s.text(48, 64, 38, "Service Overview", { weight: "bold" });
  s.raw(`<circle cx="1900" cy="48" r="22" fill="none" stroke="#333" stroke-width="3"/>`);
  s.raw(`<circle cx="1921" cy="29" r="14" fill="#dc2626"/>`);
  s.text(1921, 34, SMALL, String(badge), { anchor: "middle", fill: "#fff", weight: "bold" });
  const sy = s.text(1860, 56, SMALL, `Last sync ${sync}`, { anchor: "end", fill: "#666" });
  let evidence;
  labels.forEach((label, i) => {
    const x = 60 + (i % 4) * 492, y = 170 + Math.floor(i / 4) * 640;
    s.rect(x, y, 450, 560, "#f8fafc", "#d1d5db", 14);
    const lb = s.text(x + 34, y + 70, 24, label, { fill: "#555" });
    const vb = s.text(x + 34, y + 200, 64, values[i], { weight: "bold" });
    if (i === ti) evidence = union(lb, vb);
  });
  return {
    svg: s.toString(),
    questions: [
      { id: "q1", smallText: true, text: "What number is shown on the notification badge?", answers: [String(badge)], evidence: [1898, 6, 46, 46] },
      { id: "q2", smallText: false, text: `What value is shown on the "${labels[ti]}" card?`, answers: [values[ti], values[ti].replace(/,/g, "")], evidence },
      { id: "q3", smallText: true, text: "What time is shown for the last sync? Answer as HH:MM.", answers: [sync], evidence: sy },
    ],
  };
}

export const TEMPLATES = [
  ["doc-invoice-dense", "document", invoiceDense],
  ["doc-memo-dense", "document", memoDense],
  ["chart-bar12", "chart", bar12],
  ["chart-line-small", "chart", lineSmall],
  ["ui-settings-dense", "ui", settingsDense],
  ["ui-dashboard-dense", "ui", dashboardDense],
];

export const FAMILIES = TEMPLATES.flatMap(([name, domain, build], t) =>
  [0, 1].map((k) => ({ id: `dev2-${name}-${k + 1}`, domain, seed: 2000 + t * 10 + k, build })),
);

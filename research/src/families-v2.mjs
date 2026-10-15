// Held-out-only layout variants of the six dev2 image templates (experiment 3 pre-registration, 2026-10-15).
// Same question wording and answer rules as families-dev2.mjs; element placement, sizes and grouping differ.
// Never used for development or calibration, and never shown to a model before the held-out run.
import { Svg, int, money, pick, rng, sentence, union } from "./families.mjs";

const SMALL = 13;

// Invoice: header on the right, invoice number in a bottom-left box, striped table, total above the notes.
function invoiceV2(seed) {
  const r = rng(seed);
  const s = new Svg(1536, 2048);
  const inv = `INV-${int(r, 10000, 99999)}-${pick(r, ["B", "D", "F", "K"])}`;
  s.text(1456, 140, 50, "Copperfield Fasteners Ltd.", { weight: "bold", anchor: "end" });
  s.text(1456, 190, 24, "Accounts receivable statement", { anchor: "end", fill: "#555" });
  const names = ["Anchor bolt M12", "Anchor bolt M16", "Spring washer 12", "Flat washer 16", "Nyloc nut M12", "Nyloc nut M16", "Bushing 20mm", "Bushing 25mm", "Timing belt T5", "Timing belt T10", "Cable tie 200", "Cable tie 300", "Gasket 40mm", "Gasket 50mm", "Thread lock 50ml", "Spacer kit"];
  let y = 330;
  ["Description", "Units", "Price", "Line total"].forEach((h, i) => s.text([120, 860, 1080, 1416][i], y, 22, h, { weight: "bold", anchor: i === 0 ? "start" : "end", fill: "#1f3a5f" }));
  s.line(100, y + 14, 1436, y + 14, "#1f3a5f", 2);
  let total = 0, targetAmount, targetBox;
  const target = pick(r, names);
  names.forEach((item, i) => {
    y += 52;
    if (i % 2 === 0) s.rect(100, y - 34, 1336, 50, "#f3f6fa");
    const qty = int(r, 1, 40), unit = int(r, 35, 9800) / 100, amount = Math.round(qty * unit * 100) / 100;
    total += amount;
    const a = s.text(120, y, 19, item);
    s.text(860, y, 19, String(qty), { anchor: "end" });
    s.text(1080, y, 19, money(unit), { anchor: "end" });
    const b = s.text(1416, y, 19, money(amount), { anchor: "end" });
    if (item === target) { targetAmount = money(amount); targetBox = union(a, b); }
  });
  total = Math.round(total * 100) / 100;
  y += 100;
  s.rect(900, y - 50, 536, 70, "#1f3a5f");
  const l = s.text(940, y, 32, "Amount due", { fill: "#fff", weight: "bold" });
  const t = s.text(1416, y, 32, `$${money(total)}`, { fill: "#fff", weight: "bold", anchor: "end" });
  for (let k = 0; k < 3; k++) s.text(100, 1600 + k * 40, 18, sentence(r, 14), { fill: "#666" });
  s.rect(100, 1820, 520, 90, "none", "#999", 6);
  s.text(120, 1855, SMALL + 1, "Statement reference", { fill: "#777" });
  const invBox = s.text(120, 1885, SMALL + 1, `Invoice No. ${inv}`, { fill: "#333" });
  return {
    svg: s.toString(),
    questions: [
      { id: "q1", smallText: true, text: "What is the invoice number?", answers: [inv], evidence: invBox },
      { id: "q2", smallText: false, text: `What is the amount for the line item "${target}"?`, answers: [targetAmount], evidence: targetBox },
      { id: "q3", smallText: false, text: "What is the total amount on the invoice?", answers: [`$${money(total)}`, money(total)], evidence: union(l, t) },
    ],
  };
}

// Memo: two-column body, reference code in a small top-right tag, issue date at the bottom.
function memoV2(seed) {
  const r = rng(seed);
  const s = new Svg(1536, 2048);
  const day = int(r, 2, 27);
  const month = pick(r, ["February", "April", "June", "August", "November"]);
  const ref = `QR-${int(r, 1000, 9999)}-${pick(r, ["C", "G", "N", "S"])}${int(r, 10, 99)}`;
  const room = `${pick(r, ["E", "F", "G"])}-${int(r, 100, 499)}`;
  const f = s.text(1456, 70, SMALL, `Ref. ${ref}`, { anchor: "end", fill: "#555" });
  s.text(80, 150, 48, "SITE BULLETIN", { weight: "bold" });
  s.line(80, 185, 1456, 185, "#333", 2);
  const roomCol = int(r, 0, 1), roomLine = int(r, 6, 26);
  let roomBox;
  for (let col = 0; col < 2; col++) {
    let y = 250;
    for (let k = 0; k < 40; k++) {
      const x = 80 + col * 700;
      if (col === roomCol && k === roomLine) roomBox = s.text(x, y, 19, `${sentence(r, 2)} assigned room: ${room} for ${sentence(r, 2)}`);
      else s.text(x, y, 19, sentence(r, 7));
      y += 34;
      if (k % 8 === 7) y += 20;
    }
  }
  const d = s.text(80, 1960, 26, `Issued: ${day} ${month} 2026`);
  return {
    svg: s.toString(),
    questions: [
      { id: "q1", smallText: true, text: "What is the reference code shown at the top right of the bulletin?", answers: [ref], evidence: f },
      { id: "q2", smallText: false, text: "Which room is assigned in the notice?", answers: [room], evidence: roomBox },
      { id: "q3", smallText: false, text: "On what date was the notice issued? Answer as day month year.", answers: [`${day} ${month} 2026`], evidence: d },
    ],
  };
}

// Bar chart: horizontal bars with month labels on the left and values at the bar ends; note at the top.
function bar12V2(seed) {
  const r = rng(seed);
  const s = new Svg(2048, 1536);
  const cats = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const vals = cats.map(() => int(r, 100, 990));
  while (new Set(vals).size !== vals.length || vals.filter((v) => v === Math.max(...vals)).length > 1) vals[int(r, 0, 11)] = int(r, 100, 990);
  const target = pick(r, cats);
  const n = int(r, 1000, 9999);
  s.text(80, 80, 44, "Monthly Inspection Count", { weight: "bold" });
  const nb = s.text(80, 120, SMALL, `Inspection sample n = ${n.toLocaleString("en-US")}; weekend audits excluded.`, { fill: "#555" });
  const x0 = 260, w = 1600, y0 = 200, bh = 70, gap = 34;
  let evidence, maxBox;
  cats.forEach((c, i) => {
    const y = y0 + i * (bh + gap);
    const len = Math.round((vals[i] / 1000) * w);
    const lab = s.text(x0 - 24, y + 48, 24, c, { anchor: "end" });
    s.rect(x0, y, len, bh, "#7a4f9a");
    const v = s.text(x0 + len + 14, y + 46, 20, String(vals[i]));
    const box = union(lab, v, [x0, y, len, bh]);
    if (c === target) evidence = box;
    if (vals[i] === Math.max(...vals)) maxBox = box;
  });
  return {
    svg: s.toString(),
    questions: [
      { id: "q1", smallText: false, text: `What value is labeled on the ${target} bar?`, answers: [String(vals[cats.indexOf(target)])], evidence },
      { id: "q2", smallText: true, text: "What is the inspection sample size noted under the chart title?", answers: [n.toLocaleString("en-US"), String(n)], evidence: nb },
      { id: "q3", smallText: false, text: "Which month has the tallest bar? Answer with the month label.", answers: [cats[vals.indexOf(Math.max(...vals))]], evidence: maxBox },
    ],
  };
}

// Line chart: legend inside the plot at the top right, update time at the bottom left, peak label left of the marker.
function lineV2(seed) {
  const r = rng(seed);
  const s = new Svg(2048, 1536);
  const names = ["Plant North", "Plant South", "Plant East", "Plant West"];
  const a = pick(r, names);
  const b = pick(r, names.filter((x) => x !== a));
  const dashed = r() < 0.5 ? a : b;
  const time = `${String(int(r, 6, 22)).padStart(2, "0")}:${String(int(r, 0, 59)).padStart(2, "0")}`;
  s.text(80, 90, 44, "Shift Output Index", { weight: "bold" });
  const x0 = 180, y0 = 1300, w = 1760, h = 1050;
  s.rect(x0, y0 - h, w, h, "#fbfbfb", "#ccc");
  for (let k = 0; k <= 4; k++) s.text(x0 - 14, y0 - (k * h) / 4 + 7, 20, String(k * 25), { anchor: "end", fill: "#444" });
  let peak = { v: -1 };
  for (const name of [a, b]) {
    const pts = Array.from({ length: 16 }, (_, i) => {
      // Values stay at or below 80 so no point or peak label can sit under the legend box (which covers roughly 86-100).
      const v = Math.round((15 + r() * 65) * 10) / 10;
      const p = { x: x0 + 60 + i * 108, y: y0 - (v / 100) * h, v };
      if (v > peak.v) peak = p;
      return p;
    });
    s.raw(`<polyline fill="none" stroke="${name === a ? "#117a65" : "#b03a2e"}" stroke-width="5"${name === dashed ? ' stroke-dasharray="20 12"' : ""} points="${pts.map((p) => `${p.x},${p.y.toFixed(1)}`).join(" ")}"/>`);
  }
  s.raw(`<circle cx="${peak.x}" cy="${peak.y.toFixed(1)}" r="8" fill="#000"/>`);
  const pk = s.text(peak.x - 14, peak.y - 14, SMALL + 1, `Peak ${peak.v.toFixed(1)}`, { anchor: "end" });
  const legend = [];
  s.rect(1520, y0 - h + 20, 400, 130, "#ffffff", "#bbb", 6);
  [a, b].forEach((name, i) => {
    const ly = y0 - h + 70 + i * 52;
    s.line(1540, ly - 9, 1620, ly - 9, name === a ? "#117a65" : "#b03a2e", 5, name === dashed ? "20 12" : "");
    legend.push([1540, ly - 20, 80, 20], s.text(1636, ly, 26, name));
  });
  const upd = s.text(80, 1480, SMALL, `Last updated ${time}`, { fill: "#666" });
  return {
    svg: s.toString(),
    questions: [
      { id: "q1", smallText: true, text: "What value is written next to the peak marker?", answers: [peak.v.toFixed(1)], evidence: union(pk, [peak.x - 10, peak.y - 10, 20, 20]) },
      { id: "q2", smallText: false, text: "Which plant's series is drawn with a dashed line?", answers: [dashed, dashed.replace("Plant ", "")], evidence: union(...legend) },
      { id: "q3", smallText: true, text: "At what time was the chart last updated? Answer as HH:MM.", answers: [time], evidence: upd },
    ],
  };
}

// Settings: two columns of toggle cards, build number in the header, storage in a footer bar.
function settingsV2(seed) {
  const r = rng(seed);
  const s = new Svg(2048, 1536);
  const rows = ["Wi-Fi", "Bluetooth", "Airplane mode", "Mobile data", "Hotspot", "VPN", "Location", "Auto-rotate", "Dark mode", "Battery saver", "Do not disturb", "Auto-update"];
  const states = rows.map(() => (r() < 0.5 ? "On" : "Off"));
  const target = pick(r, rows);
  const build = int(r, 1000, 9999);
  const storage = `${int(r, 10, 99)}.${int(r, 0, 9)} GB`;
  s.rect(0, 0, 2048, 100, "#0f766e");
  s.text(48, 66, 36, "Quick Settings", { fill: "#fff", weight: "bold" });
  const bb = s.text(2000, 62, SMALL, `Firmware 8.${int(r, 0, 9)}.${int(r, 10, 60)} (build ${build})`, { anchor: "end", fill: "#d1fae5" });
  let evidence;
  rows.forEach((row, i) => {
    const col = i % 2, line = Math.floor(i / 2);
    const x = 60 + col * 990, y = 150 + line * 200;
    s.rect(x, y, 940, 170, "#f8fafc", "#d1d5db", 14);
    const lb = s.text(x + 40, y + 70, 30, row);
    const on = states[i] === "On";
    s.rect(x + 780, y + 50, 100, 48, on ? "#0f766e" : "#cbd5e1", "none", 24);
    s.raw(`<circle cx="${x + (on ? 856 : 804)}" cy="${y + 74}" r="19" fill="#fff"/>`);
    const sb = s.text(x + 40, y + 125, 22, `Status: ${states[i]}`, { fill: "#555" });
    if (row === target) evidence = union(lb, sb, [x + 780, y + 50, 100, 48]);
  });
  s.rect(0, 1440, 2048, 96, "#f1f5f9");
  const st = s.text(60, 1500, SMALL + 1, `Storage used: ${storage} of 256 GB`, { fill: "#555" });
  return {
    svg: s.toString(),
    questions: [
      { id: "q1", smallText: false, text: `Is ${target} turned on or off?`, answers: [states[rows.indexOf(target)]], evidence },
      { id: "q2", smallText: true, text: "What is the build number shown in the screen header?", answers: [String(build)], evidence: bb },
      { id: "q3", smallText: true, text: "How much storage is used, according to the footer? Answer with the number and unit.", answers: [storage], evidence: st },
    ],
  };
}

// Dashboard: cards in two rows of four with values on the left and labels on the right, badge at the left of the header,
// sync time in a footer line.
function dashboardV2(seed) {
  const r = rng(seed);
  const s = new Svg(2048, 1536);
  const badge = int(r, 3, 99);
  const sync = `${String(int(r, 0, 23)).padStart(2, "0")}:${String(int(r, 0, 59)).padStart(2, "0")}`;
  const labels = ["Active users", "Open tickets", "Avg. response", "Uptime", "Queued jobs", "Error rate", "Deployments", "Cache hit"];
  const values = [int(r, 1200, 98000).toLocaleString("en-US"), String(int(r, 12, 480)), `${int(r, 2, 59)} min`, `${(99 + r()).toFixed(2)}%`, String(int(r, 0, 900)), `${(r() * 3).toFixed(2)}%`, String(int(r, 1, 60)), `${int(r, 60, 99)}%`];
  const ti = int(r, 0, 7);
  s.rect(0, 0, 2048, 90, "#111827");
  s.raw(`<circle cx="70" cy="45" r="22" fill="none" stroke="#fff" stroke-width="3"/>`);
  s.raw(`<circle cx="91" cy="26" r="14" fill="#f59e0b"/>`);
  s.text(91, 31, SMALL, String(badge), { anchor: "middle", fill: "#111", weight: "bold" });
  s.text(130, 60, 34, "Platform Health", { fill: "#fff", weight: "bold" });
  let evidence;
  labels.forEach((label, i) => {
    const x = 60 + (i % 4) * 492, y = 160 + Math.floor(i / 4) * 620;
    s.rect(x, y, 450, 540, "#ffffff", "#e5e7eb", 10);
    const vb = s.text(x + 30, y + 180, 70, values[i], { weight: "bold" });
    const lb = s.text(x + 30, y + 260, 26, label, { fill: "#6b7280" });
    if (i === ti) evidence = union(lb, vb);
  });
  const sy = s.text(60, 1490, SMALL, `Last sync ${sync} (UTC)`, { fill: "#6b7280" });
  return {
    svg: s.toString(),
    questions: [
      { id: "q1", smallText: true, text: "What number is shown on the notification badge?", answers: [String(badge)], evidence: [68, 4, 46, 46] },
      { id: "q2", smallText: false, text: `What value is shown on the "${labels[ti]}" card?`, answers: [values[ti], values[ti].replace(/,/g, "")], evidence },
      { id: "q3", smallText: true, text: "What time is shown for the last sync? Answer as HH:MM.", answers: [sync], evidence: sy },
    ],
  };
}

export const TEMPLATES_V2 = [
  ["doc-invoice-dense", "document", invoiceV2],
  ["doc-memo-dense", "document", memoV2],
  ["chart-bar12", "chart", bar12V2],
  ["chart-line-small", "chart", lineV2],
  ["ui-settings-dense", "ui", settingsV2],
  ["ui-dashboard-dense", "ui", dashboardV2],
];

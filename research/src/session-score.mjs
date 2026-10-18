// Experiment 3 content-match scoring (frozen with the harness; moved out of session-summarize.mjs unchanged so the
// analysis script can import it without running the summary).
const norm = (s) => String(s ?? "").toLowerCase().replace(/^(the answer is|answer:)\s*/, "").replace(/[\s,$"'`.*]/g, "");
// yes/no and on/off must match exactly; numbers must appear as a whole number; month abbreviations also accept the full name.
const EXACT = new Set(["yes", "no", "on", "off"]);
const MONTHS = { jan: "january", feb: "february", mar: "march", apr: "april", may: "may", jun: "june", jul: "july", aug: "august", sep: "september", oct: "october", nov: "november", dec: "december" };
export function correct(answer, gold) {
  const a = norm(answer);
  return gold.some((g) => {
    const n = norm(g);
    // yes/no and on/off: the answer's words must contain the gold word and not its opposite ("setting is **On**" counts).
    if (EXACT.has(n)) {
      const words = String(answer ?? "").toLowerCase().match(/[a-z]+/g) || [];
      const opposite = { yes: "no", no: "yes", on: "off", off: "on" }[n];
      return words.includes(n) && !words.includes(opposite);
    }
    if (/^[\d,]+$/.test(String(g).trim())) return (String(answer ?? "").replace(/,/g, "").match(/\d+(\.\d+)?/g) || []).includes(n);
    if (MONTHS[n]) return a === n || a === MONTHS[n];
    return a.includes(n);
  });
}

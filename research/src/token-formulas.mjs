// Image token formulas copied verbatim from run.mjs (lines 36-58 at 7513809) so other scripts can import them without running
// run.mjs. Keep both copies identical; rq1-sweep.mjs tests them against billed tokens.
// GPT-4o high/auto tile rule (same document, L31): fit in 2048x2048, short side to 768, no upscaling.
export function predictedImageTokens(width, height) {
  let w = width, h = height;
  const fit = Math.min(1, 2048 / Math.max(w, h));
  w = Math.floor(w * fit); h = Math.floor(h * fit);
  if (Math.min(w, h) > 768) {
    const s = 768 / Math.min(w, h);
    w = Math.floor(w * s); h = Math.floor(h * s);
  }
  return 85 + 170 * Math.ceil(w / 512) * Math.ceil(h / 512);
}

// Haiku 4.5 standard tier (same document, L54): ceil(w/28) x ceil(h/28), long side <= 1568 and at most 1568 patches.
// The official reference binary-searches the largest fitting size; this linear search over the long side is an approximation.
export function predictedAnthropicTokens(width, height) {
  const patches = (w, h) => Math.ceil(w / 28) * Math.ceil(h / 28);
  const long = Math.max(width, height), ratio = Math.min(width, height) / long;
  if (long <= 1568 && patches(width, height) <= 1568) return patches(width, height);
  for (let L = Math.min(1568, long); L > 0; L--) {
    const short = Math.round(L * ratio);
    if (patches(L, short) <= 1568) return patches(L, short);
  }
  return 0;
}

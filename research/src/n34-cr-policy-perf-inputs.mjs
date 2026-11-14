// N-34 preregistered inputs and comparisons (plan PR #115 @4a5b390 section 8.2-8.3).
// Shared by the parent runner and both child workers so that every process builds the
// same bytes. Inputs are generated, never read from disk.
export const SIZE = 10 * 1024 * 1024; // 10,485,760 bytes
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
export const P1 = 'Please read this short note before the team meeting today.';
export const P2 = 'Everyone should bring their notes and arrive a little early.';
export const P3 = 'The rest of this note describes the weekly plan in plain words.';

// unit repeated floor(size / unit bytes) times, then pad repeated (size mod unit bytes) times.
// All units are ASCII, so string length equals UTF-8 byte length.
export const INPUTS = Object.freeze({
  F1: { unit: CR, pad: '', kind: 'CR-dense' },
  F2: { unit: 'x' + CR, pad: '', kind: 'CR-dense' },
  F3: { unit: CR + LF, pad: '', kind: 'CRLF regression' },
  F4: { unit: LF, pad: '', kind: 'LF regression (LF of F1)' },
  F5: { unit: 'x' + LF, pad: '', kind: 'LF regression (LF of F2)' },
  F6: { unit: 'x' + CR + LF + 'x' + CR + 'x' + LF, pad: 'x', kind: 'mixed' },
  F6L: { unit: 'x' + CR + LF + 'x' + LF + 'x' + LF, pad: 'x', kind: 'F6 baseline (lone CR -> LF)' },
  F7: { unit: P1 + CR + P2 + CR + P3 + CR, pad: ' ', kind: 'prose CR' },
  F7L: { unit: P1 + LF + P2 + LF + P3 + LF, pad: ' ', kind: 'prose LF (F7 baseline)' },
});

export function makeInput(id, size = SIZE) {
  const spec = INPUTS[id];
  if (!spec) throw new Error(`unknown input ${id}`);
  const count = Math.floor(size / spec.unit.length);
  const rest = size - count * spec.unit.length;
  if (rest > 0 && spec.pad.length !== 1) throw new Error(`${id}: size ${size} needs a pad character`);
  return spec.unit.repeat(count) + spec.pad.repeat(rest);
}

// G-R: same input for BASE and CAND. G-C: CAND gets the CR input, BASE its LF substitute.
export const COMPARISONS = Object.freeze([
  { id: 'F3', cand: 'F3', ref: 'F3', gate: 'G-R' },
  { id: 'F4', cand: 'F4', ref: 'F4', gate: 'G-R' },
  { id: 'F5', cand: 'F5', ref: 'F5', gate: 'G-R' },
  { id: 'F6L', cand: 'F6L', ref: 'F6L', gate: 'G-R' },
  { id: 'F7L', cand: 'F7L', ref: 'F7L', gate: 'G-R' },
  { id: 'F1', cand: 'F1', ref: 'F4', gate: 'G-C' },
  { id: 'F2', cand: 'F2', ref: 'F5', gate: 'G-C' },
  { id: 'F6', cand: 'F6', ref: 'F6L', gate: 'G-C' },
  { id: 'F7', cand: 'F7', ref: 'F7L', gate: 'G-C' },
]);
export const OPERATIONS = Object.freeze(['O1', 'O2']);
// Fixed order (section 8.4): O1 over all comparisons, then O2 over the same order.
export const ROWS = Object.freeze(OPERATIONS.flatMap(op => COMPARISONS.map(c => Object.freeze({ op, ...c, key: `${op}/${c.id}` }))));
export const SUMMARY_MAX_TOKENS = 400;

// Public operations. mod = { policy, artifacts } of one dist copy.
export function runO1(mod, text) {
  return mod.policy.classifyContext(text);
}
export async function runO2(mod, path, root) {
  const store = new mod.artifacts.MemoryArtifactStore();
  const record = await mod.artifacts.indexArtifact({ path, store, allowedRoots: [root] });
  const summary = mod.artifacts.summarizeArtifact({ artifactId: record.artifactId, maxTokens: SUMMARY_MAX_TOKENS, store });
  return { store, record, summary };
}
// Output fields compared between arms (artifact id, sha256 and path excluded). The summarize
// response has no classification object; its classification is carried by fallbackReason,
// warnings and confidence.
export function o1View(classification) {
  return { mode: classification.mode, reasons: classification.reasons, warnings: classification.warnings };
}
export function o2View(result) {
  const s = result.summary;
  return { summary: s.summary, startLine: s.sourceMap?.startLine ?? null, endLine: s.sourceMap?.endLine ?? null,
    fallbackReason: s.fallbackReason, warnings: s.warnings, confidence: s.confidence, estimatedTokens: s.estimatedTokens };
}

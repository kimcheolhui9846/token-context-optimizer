// N-34 K1 incremental comparison rows (review_2026-11-15_n34-k1-implementation-request;
// protocol docs/agent/handoffs/n34-k1-prereg.md). Question: the added effect of K1 over the
// verified pre-K1 policy (7e732e0) on the same input. Not a comparison with main 5d668f9.
// Inputs and public operations are reused unchanged from the run3 module.
export { INPUTS, SIZE, makeInput } from './n34-cr-policy-perf-inputs.mjs';

export const K1_GATE = 'K1-same';
export const K1_IDS = Object.freeze(['F3', 'F4', 'F5', 'F6L', 'F7L', 'F1', 'F2', 'F6', 'F7']);
// Every row is a same-input comparison: cand = ref = id. The run3 G-C reference mapping
// (F1->F4, F2->F5, F6->F6L, F7->F7L) is deliberately not reused.
export const COMPARISONS = Object.freeze(K1_IDS.map(id => Object.freeze({ id, cand: id, ref: id, gate: K1_GATE })));
export const OPERATIONS = Object.freeze(['O1', 'O2']);
// Fixed order: O1 over all nine, then O2 over the same nine = 18 rows.
export const ROWS = Object.freeze(OPERATIONS.flatMap(op => COMPARISONS.map(c => Object.freeze({ op, ...c, key: `${op}/${c.id}` }))));

// Returns the list of violations of the K1 row contract (empty = valid).
export function rowViolations(rows) {
  const violations = [];
  const expectedKeys = OPERATIONS.flatMap(op => K1_IDS.map(id => `${op}/${id}`));
  if (rows.length !== 18) violations.push(`count:${rows.length}`);
  if (new Set(rows.map(r => r.key)).size !== rows.length) violations.push('duplicate');
  if (rows.map(r => r.key).join(',') !== expectedKeys.join(',')) violations.push('order');
  for (const r of rows) {
    if (r.cand !== r.ref) violations.push(`not-same-input:${r.key}`);
    if (r.cand !== r.id || r.key !== `${r.op}/${r.id}`) violations.push(`id:${r.key}`);
    if (r.gate !== K1_GATE) violations.push(`gate:${r.key}`);
  }
  return violations;
}

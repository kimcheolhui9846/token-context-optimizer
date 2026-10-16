// Experiment 2 (RQ2, single query) families, sized to the image-first protocol §2: calibration 12 and held-out 36 source
// families, equal thirds per domain (document, chart, UI), one question per family.
// - Templates: the six dev2 templates; the held-out also uses their new-layout variants (families-v2.mjs) for half of
//   each template's families, as in experiment 3, and reports base and v2 separately.
// - Question: rotated q1 -> q2 -> q3 over a template's families, so every domain keeps small-text questions.
// - Seeds: calibration 8000s, held-out 9000s; no overlap with pilots (101-606, 2000s, 3000s) or experiment 3 (5000-7999).
import { TEMPLATES } from "./families-dev2.mjs";
import { TEMPLATES_V2 } from "./families-v2.mjs";

const V2 = Object.fromEntries(TEMPLATES_V2.map(([name, , build]) => [name, build]));

function makeFamilies(split, base, perTemplate) {
  return TEMPLATES.flatMap(([name, domain, build], t) =>
    Array.from({ length: perTemplate }, (_, k) => {
      const layout = split === "heldout" && k >= perTemplate / 2 ? "v2" : "base";
      const pick = k % 3;
      const builder = layout === "v2" ? V2[name] : build;
      return {
        id: `exp2-${split}-${name}-${k + 1}${layout === "v2" ? "-v2" : ""}`,
        domain, layout, seed: base + t * 100 + k,
        // One question per family (protocol §5: 1 question per family); the other two are not generated as slots.
        build: (seed) => { const r = builder(seed); return { ...r, questions: [r.questions[pick]] }; },
      };
    }),
  );
}

export const EXP2_CALIBRATION = makeFamilies("calibration", 8000, 2); // 6 templates x 2 = 12
export const EXP2_HELDOUT = makeFamilies("heldout", 9000, 6); // 6 templates x 6 = 36 (3 base + 3 v2 each)

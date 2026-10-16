// Development set 3: the dev2 templates with fresh seeds. Used to evaluate the pilot-003 selectors, which were
// adjusted while looking at dev2, so that the evaluation does not reuse the images the selectors were tuned on.
// The templates are shared with dev2, so results here are still optimistic for unseen layouts.
// DEVELOPMENT ONLY: never reuse these templates or seeds for the 12 calibration or 36 held-out families.
import { TEMPLATES } from "./families-dev2.mjs";

export const FAMILIES = TEMPLATES.flatMap(([name, domain, build], t) =>
  [0, 1].map((k) => ({ id: `dev3-${name}-${k + 1}`, domain, seed: 3000 + t * 10 + k, build })),
);

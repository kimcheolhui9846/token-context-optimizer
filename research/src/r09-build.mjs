// R09: write the design manifest and the selector question file, after the pre-registration checks.
// Usage: node src/r09-build.mjs --set heldout|dev --out <dir>
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { keywords } from "./selector.mjs";
import { buildDesign, buildDevDesign, checkDesign, questionsOf, sourceMatches } from "./r09-design.mjs";

const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const set = arg("--set", "heldout");
const out = arg("--out");
if (!out) throw new Error("--out is required");
const design = set === "dev" ? buildDevDesign() : buildDesign("heldout");
const problems = checkDesign(design, { expectedPairs: set === "dev" ? 2 : 24 });
mkdirSync(out, { recursive: true });
const json = (o) => `${JSON.stringify(o, null, 1)}\n`;
writeFileSync(join(out, "design.json"), json(design));
writeFileSync(join(out, "questions.json"), json(questionsOf(design)));
// Token manifest: the selector keys of all questions and the page item(s) they are expected to match on source text.
const tokens = design.images.map((im) => ({ id: im.id, question: im.question, keys: keywords(im.question).filter((k) => k !== "off" && k !== "yes"), expectedMarker: sourceMatches(im) }));
writeFileSync(join(out, "token-manifest.json"), json({ version: design.version, set, rule: "selector.mjs keywords() minus off/yes, as in selectWindow", tokens }));
console.log(JSON.stringify({ set, images: design.images.length, pairs: design.pairs.length, problems }));
if (problems.length) process.exit(1);

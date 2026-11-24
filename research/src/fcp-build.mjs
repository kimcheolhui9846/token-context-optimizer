// FCP: write the design manifest, selector questions, token manifest and text-level duplicate check (protocol 4).
// Usage: node src/fcp-build.mjs --out <new empty dir>
// Older designs are read as Git blobs of R09 dev and held-out design.json at the product commit. Exits 1 on any design
// check problem or duplicate violation, before anything is rendered.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { keywords } from "./selector.mjs";
import { buildDesign, checkDesign, dedupCheck, questionsOf, sourceMatches } from "./fcp-design.mjs";
import { PRODUCT_COMMIT } from "./fcp-lib.mjs";

export const R09_DESIGNS = ["research/results/r09-bilingual/dev/design.json", "research/results/r09-bilingual/heldout/design.json"];

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const out = arg("--out");
if (!out) throw new Error("--out is required");
if (existsSync(out)) throw new Error(`--out must not exist yet: ${out}`);
const git = (args) => execFileSync("git", args, { cwd: here, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const older = R09_DESIGNS.map((p) => ({ path: p, blob: git(["rev-parse", `${PRODUCT_COMMIT}:${p}`]).trim() }));
const olderDesigns = older.map((o) => JSON.parse(git(["cat-file", "blob", o.blob])));

const design = buildDesign();
const problems = checkDesign(design, { expectedPairs: 24 });
const dedup = dedupCheck(design, olderDesigns);
mkdirSync(out, { recursive: true });
const json = (o) => `${JSON.stringify(o, null, 1)}\n`;
writeFileSync(join(out, "design.json"), json(design));
writeFileSync(join(out, "questions.json"), json(questionsOf(design)));
const tokens = design.images.map((im) => ({ id: im.id, question: im.question, keys: keywords(im.question).filter((k) => k !== "off" && k !== "yes"), expectedMarker: sourceMatches(im) }));
writeFileSync(join(out, "token-manifest.json"), json({ version: design.version, set: design.set, rule: "selector.mjs keywords() minus off/yes, as in selectWindow", tokens }));
writeFileSync(join(out, "dedup-check.json"), json({ version: design.version, older: older.map((o) => ({ path: o.path, commit: PRODUCT_COMMIT, blob: o.blob })), designProblems: problems, ...dedup }));
console.log(JSON.stringify({ images: design.images.length, pairs: design.pairs.length, problems: problems.length, violations: dedup.violations.length }));
if (problems.length || dedup.violations.length) process.exit(1);

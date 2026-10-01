export interface PolicyCorpusCase {
  id: string;
  content: string;
}

const legacyFixtures: PolicyCorpusCase[] = [
  ["bearer secret", "Authorization: Bearer abc.def.ghi"],
  ["pem private key", "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----"],
  ["curl command", "curl https://example.com/resource --header Accept: application/json"],
  ["html markup", '<div data-id="app">Hello</div>'],
  ["sudo command", "sudo curl https://example.com/resource --header Accept: application/json"],
  ["echo command", "echo Deploy the application before verification."],
  ["absolute path", "Copy /etc/hosts before deployment. Preserve this path exactly."],
  ["dsn", "Use postgres://alice:hunter@db/prod. Keep this secret exactly."],
  ["request id", "Use request-id abcdefghijklmno. Preserve it exactly."],
  ["html comment", "<!-- Preserve this exact server-side include. -->"],
  ["doas make command", "doas make deploy before release."],
  ["make command", "make deploy TARGET=production."],
  ["mailto uri", "mailto:ops@example.com"],
  ["srv path", "/srv/app/config.toml"],
  ["request id underscore", "request_id abcdef"],
  ["doctype declaration", "<!DOCTYPE html>"],
  ["sqlite uri", "sqlite:/srv/app.db"],
  ["sudo option wrapper", "sudo -u deploy make release."],
  ["doas option wrapper", "doas -u deploy make release."],
  ["sudo long option wrapper", "sudo --preserve-env make deploy."],
  ["env assignment wrapper", "env TARGET=production make deploy."],
  ["sudo systemctl wrapper", "sudo -u deploy systemctl restart nginx."],
  ["env terraform wrapper", "env TARGET=production terraform apply changes."],
  ["script path in prose", "Use scripts/deploy.sh during release."],
  ["request id with colon", "Keep request_id: abcdef unchanged."],
  ["sql query prose", "Run SELECT email FROM users WHERE status = active."],
  ["chmod phrase", "Please run chmod u+x deploy before the scheduled release."],
  ["generic filename", "Use release-notes.txt during launch for production operations."],
  ["helm phrase", "Please run helm upgrade before the scheduled production release."],
  ["trace token", "Preserve trace abcdefghijkl through the entire support workflow."],
  ["config key", "Set feature_flag enabled before the scheduled production release."],
  ["helm command shape without cue verb", "Use helm upgrade before the scheduled production release."],
  ["chmod command shape without cue verb", "Use chmod u+x deploy before the scheduled release."],
].map(([id, content]) => ({ id, content }));

const boundaries: PolicyCorpusCase[] = [
  ["sql-overlap-from-where", "SELECT FROM WHERE"],
  ["sql-self-from", "SELECT FROM"],
  ["sql-self-where", "SELECT WHERE"],
  ["sql-single-from", "FROM"],
  ["sql-single-where", "WHERE"],
  ["sql-from-from", "FROM FROM"],
  ["sql-where-where", "WHERE WHERE"],
  ["sql-no-later-pair", "FROM SELECT WHERE"],
  ["sql-separated-pair", "SELECT alpha FROM beta; WHERE status = active"],
  ["sql-keyword-underscore-boundary", "SELECT FROM_table WHERE_value"],
  ["sql-keyword-digit-boundary", "SELECT FROM1 WHERE2"],
  ["sql-keyword-nonascii-boundary", "SELECT FROM한 WHEREß"],
  ["syntax-single-delimiter", "{ =>"],
  ["syntax-equals-after-semicolon", "; =>"],
  ["syntax-equals-before-delimiter", "= ;"],
  ["php-open-close", "<?php ?>"],
  ["php-open-without-close", "<?a <?b"],
  ["html-opener-with-whitespace", "<a     >"],
  ["html-opener-without-close", "<a     <b"],
  ["sql-repeated-overlap-bounded", "SELECT FROM WHERE ".repeat(12)],
  ["semicolon-repeated-bounded", ";".repeat(160)],
  ["php-opener-repeated-bounded", "<?a ".repeat(80)],
  ["html-opener-space-repeated-bounded", "<a ".repeat(80)],
  ["multiline-command", "ordinary prose\n  npm test"],
  ["multiline-semantic", "The service retains every approved source excerpt.\r\nOperators verify results before release."],
  ["late-positive-semantic", `${"ordinary prose without punctuation ".repeat(4)}The final line explains why the service preserves source evidence.`],
  ["f21-note-colon", "Note: preserve source text exactly before compression."],
  ["unicode-letters", "안전한 요약은 원본 근거를 보존하고 검토 결과를 명확히 설명합니다."],
  ["astral-symbol", "🧪 The review process preserves every source excerpt and explains the final result."],
  ["lone-high-surrogate", `The source keeps \uD800 this character and preserves its surrounding context.`],
  ["lone-low-surrogate", `The source keeps \uDC00 this character and preserves its surrounding context.`],
  ["trim-boundary", "  The system preserves source evidence for every reviewed decision.  "],
  ["empty", ""],
  ["whitespace-only", " \t\r\n "],
  ["short-plain", "ordinary fragment"],
  ["visual", "A screenshot captures the layout."],
  ["benchmark-semantic-success", "Token efficiency depends on measured task success and careful source preservation."],
  ["benchmark-semantic-threshold", "Reviewers approve launch only when latency stays below one thousand milliseconds."],
  ["benchmark-semantic-negation", "Operators must not delete source excerpts during cleanup."],
  ["benchmark-semantic-actor-action", "The shift captain updates the readiness notes before opening hour."],
  ["benchmark-exact-code-edit", ["EDIT_TARGET tests/math.test.ts src/math.ts ERR_NEGATIVE_INPUT npm test", "Failing test: rejects negative input without throwing away zero.", "Replace src/math.ts implementation with:", "export function normalizeInput(value: number): number {", '  if (value < 0) throw new Error("ERR_NEGATIVE_INPUT");', "  return value;", "}"].join("\n")],
  ["benchmark-numeric-threshold", "Latency must stay below 1000ms for all 8 tokens of context."],
  ["benchmark-build-log-exact", ["Compiling workspace", "info line 0: cache hit for package token-context-optimizer", "src/index.ts:12:5 - error TS2304", "Cannot find name 'missingValue'."].join("\n")],
  ["benchmark-repeated-semantic-document", Array.from({ length: 8 }, () => "Token efficiency depends on measured task success and careful source preservation.").join("\n")],
  ["existing-core-code-syntax", "const user = getUser();\nreturn user.name;"],
  ["existing-core-exact-mixed-reasons", "src/server/index.ts:42:9 - error TS2339 sha256=abc123 id=build-17"],
  ["unicode-long-s", "The ſervice retains source evidence for every reviewed decision."],
  ["unicode-kelvin", "The Keeper retains source evidence for every reviewed decision."],
  ["ascii-word-boundary", "alpha_from beta"],
  ["unicode-space", "The service retains source evidence for every reviewed decision."],
  ["unicode-ideographic-space", "The service　retains source evidence for every reviewed decision."],
  ["unicode-combining-mark", "The cafe\u0301 service retains source evidence for every reviewed decision."],
  ["cr-lf-line-boundaries", "ordinary prose\r\n  npm test\rordinary line"],
  ["line-separator-boundary", "ordinary prose\u2028  npm test\u2029 ordinary line"],
  ["long-prefix-late-semantic", `${"ordinary words without a qualifying terminal sentence ".repeat(40)}The final line explains why the service preserves source evidence.`],
].map(([id, content]) => ({ id, content }));

function seededCases(): PolicyCorpusCase[] {
  let state = 0x25f03;
  const next = (limit: number): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % limit;
  };
  const atoms = ["alpha", "FROM", "WHERE", "<a  ", "<?x", "?>", "=", ";", "{", "}", "🐈", "안녕", "Note:", "token=", "ordinary prose", "npm test", ".", "\n"];
  return Array.from({ length: 32 }, (_, index) => ({
    id: `seeded-${index.toString().padStart(2, "0")}`,
    content: Array.from({ length: 1 + next(10) }, () => atoms[next(atoms.length)]).join(" "),
  }));
}

export const policyCorpus: PolicyCorpusCase[] = [...legacyFixtures, ...boundaries, ...seededCases()];

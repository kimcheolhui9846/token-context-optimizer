# Task 22 JPEG validation evidence

Status: implementation and precommit review complete; Draft PR open and post-PR verification passed; final Astra PASS WITH NOTES at 181d8c2 (2026-09-27).
This records input-validation work, not model evaluation or compression effectiveness.

## Source checks

The approved [profile](../superpowers/specs/2026-09-21-jpeg-ingest-design.md)
and [implementation plan](../superpowers/plans/2026-09-21-jpeg-runtime.md)
bind the implementation. [ITU T.81](https://www.w3.org/Graphics/JPEG/itu-t81.pdf)
B.1.1.5 and F.1.2.3 specify entropy padding/stuffing; Annex C reserves all-one
Huffman codes; F.1.2.2.3 defines ZRL and EOB behavior. A consumed terminal byte
made FF by padding requires stuffing and must be distinguished from an extra
unconsumed FF00 pair. The profile is deliberately narrower than JPEG generally.

Native Astra checked installed jpeg-js 0.4.4 allocation call sites against
[upstream source](https://github.com/jpeg-js/jpeg-js/blob/v0.4.4/lib/decoder.js).
For B = ceil(width/8) * ceil(height/8), Q defined quantization tables and each
Huffman table's symbol count H, accounting is:

```
960*B + 6*width*height + 256*Q + sum(16+H)
```

The terms are coefficient grids (768B), rounded component planes (192B), two
RGB buffers, and tables. There is no extra block column. Input copies, JavaScript
objects and runtime overhead are outside accounting. The 128 MiB limit therefore
does not bound process RSS. All tables, including unused definitions, are counted.

## Review history

- Initial 2026-09-21 external providers were unavailable (see root handoff).
- On resumption native Astra found a blocker: entropy validation only counted
  bytes. Other major findings covered resource accounting, marker/table checks,
  error mapping and missing acceptance tests. These were corrected and reviewed; the final precommit review is recorded below.
- Claude CLI returned a successful response with actual model `claude-opus-5`
  on 2026-09-26. Its input was a minimal non-sensitive plan summary, with tools
  disabled; this was not source-code review. An initial legacy call timed out,
  and a duplicate bounded retry also ended without a response.
- Claude's conditional findings about codec options, memory, structure, aliases,
  and licenses are checked against the implementation. Base64 API advice does
  not apply to this path-only API; the store contains metadata, not source bytes.
  Nonempty incomplete Huffman trees are already explicitly allowed. Synchronous
  processing remains a documented limitation; no worker architecture is added.
- Gemini free API access was not established (no API key present). Copilot's
  installed launcher reported that its CLI was missing. Neither ran a review.

## Runtime preparation

Official Node 22.23.2 Windows x64 archive SHA-256:
`1177b4137ba5adaa56354ae40f1080c7450e8ae09cecb47da459d1c52ac99f97`.
Downloaded into ignored task scratch, matched official SHASUMS256.txt before
extraction, and executed `node.exe --version`: `v22.23.2`.

## Resource measurement

`npm.cmd run build` generated `dist/src/core/jpeg-validation.js`, then
`node scripts/measure-jpeg-node22-production.mjs
.artifacts/node22/node-v22.23.2-win-x64/node.exe` created independent sharp
2528x2528 and 2529x2529 flat RGB-128 4:4:4 JPEG fixtures and invoked the
production validator in a Node 22.23.2 child process. The script computes real
DQT/DHT table cost from each encoded fixture; it does not use synthetic table
cost constants or call `jpeg-js` directly. This square flat-color family checks
the accepted/rejected accounting boundary, not adversarial worst-case CPU time.

| Fixture | Real table cost | Accounting bytes | Result | Wall time | RSS before -> after bytes | `maxRSS` KiB |
|---|---:|---:|---|---:|---:|---:|
| 2528x2528 | 580 | 134,207,044 | accepted | 306.11 ms | 40,996,864 -> 190,570,496 | 273,472 |
| 2529x2529 | 580 | 134,845,066 | `jpeg_resource_limit` | 1.05 ms | 41,218,048 -> 41,394,176 | 40,432 |

The accounting limit is 134,217,728 bytes. RSS and `maxRSS` are reported as
observed process measurements on this Windows host and are deliberately separate
from decoder allocation accounting. They are not portable memory guarantees.
Final project checks passed; Astra directly verified the diff and Git/PR state at 181d8c2 and returned PASS WITH NOTES.

## Resumed milestone checkpoint

Historical checkpoint from 2026-09-27:
- The production dependency audit (`npm.cmd audit --omit=dev --json`) returned zero vulnerabilities after an initial sandbox network failure and an authorized retry.
- The standalone smoke test passed under Node 22.23.2 with PNG and JPEG cases; `npm.cmd run build` also passed.
- Claude source-review attempts ended without a model response. Gemini free API access was unestablished and the Copilot launcher was unavailable. That milestone cross-check was DEGRADED; the initial-plan review had an actual Opus 5 response.
- Both Luna workers encountered usage limits. The configured GPT-5.5 fallback and native Astra resumed work; file edits and fallback tool calls succeeded.

## Precommit review and verification (2026-09-27)

- Native Astra reproduced an exact-JFIF bypass caused by ASCII high-bit masking. Exact-byte equality, five per-byte high-bit regressions and a wrong-letter case addressed it. The scoped SPEC/QUALITY rereview returned PASS WITH NOTES, with no unresolved blocker or major finding.
- Before the fix, the full gate recorded 647 passed tests, one Windows FIFO skip, and 19 files. After the fix, targeted verification recorded 83 passed and one skip, and the Node 22 smoke test passed. Post-Draft verification recorded 653 passed tests, one skip, and 19 files; targeted tests, build, typecheck, Node 22 smoke, plugin validation and text benchmark also passed.
- A repeated production measurement recorded accounting estimates of 134,207,044 and 134,845,066 bytes for flat RGB-128 square fixtures of 2528 and 2529 pixels. The observed results were accepted and resource-rejected, with 670.60 ms and 2.38 ms under concurrent test load and `maxRSS` of 272,884 and 49,544 KiB. These host measurements are historical observations, not portable worst-case bounds.
## Historical final review (2026-09-27)

Native Astra directly inspected reviewed HEAD 181d8c2, upstream equality, clean
tree, Draft PR 21 base/latest SHA/body and recorded post-Draft evidence. Verdict:
PASS WITH NOTES; no unresolved blocker or major finding. The reviewer did not
rerun the parent checks. The external milestone review gap, FIFO skip and
synchronous/RSS limitations remained explicit. No merge or model-effectiveness
claim was made.

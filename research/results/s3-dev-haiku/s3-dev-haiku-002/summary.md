# s3-dev-haiku-002 summary (experiment 3, split dev)

Exploratory. Content-match scoring. Tokens are means per session over all calls (turns, tool rounds, compaction).

| condition | sessions | accuracy | immediate | cross | gist | late recall | prompt tokens | cached | list cost | cache-view cost | calls | compactions | tool calls | originals | UNREADABLE |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S0 | 3 | 92% | 89% | 100% | 67% | 100% | 46,265 | 37,039 | $0.0465 | $0.0149 | 8.0 | 0.0 | 0 | 0 | 0 |
| S1 | 3 | 75% | 89% | 67% | 67% | 67% | 22,797 | 17,128 | $0.0269 | $0.0115 | 10.0 | 2.0 | 0 | 0 | 5 |
| S2 | 3 | 71% | 67% | 100% | 33% | 78% | 55,308 | 9,813 | $0.0599 | $0.0529 | 18.0 | 0.0 | 30 | 3 | 2 |
| S3 | 3 | 63% | 67% | 100% | 0% | 67% | 56,759 | 17,910 | $0.0649 | $0.0495 | 21.3 | 2.0 | 36 | 2 | 0 |
| S4 | 3 | 88% | 78% | 100% | 67% | 100% | 46,249 | 37,025 | $0.0465 | $0.0149 | 8.0 | 0.0 | 0 | 0 | 0 |

Turns whose prompt exceeded the 4000-token threshold (would have triggered a threshold compact): S0 20, S1 5, S2 6, S3 7, S4 20.

Cache-view cost: cache reads at 0.1x and cache writes at 1.25x the input price (Anthropic reference).

## Wrong answers

| session | condition | turn | type | gold | answer |
|---|---|---|---|---|---|
| dev-document-review-1 | S1 | 4 | cross | Hose clamp 32 | UNREADABLE |
| dev-document-review-1 | S1 | 7 | late-log | f23e75 | UNREADABLE |
| dev-document-review-1 | S2 | 1 | immediate-small | INV-59162-E | INV-69162-E |
| dev-document-review-1 | S2 | 2 | immediate-log | B-2664 | f23e75 |
| dev-document-review-1 | S2 | 8 | late-small | ZT-2316-F50 | UNREADABLE |
| dev-document-review-1 | S3 | 1 | immediate-small | INV-59162-E | INV-69162-E |
| dev-document-review-1 | S3 | 2 | immediate-log | B-2664 | f23e75 |
| dev-document-review-1 | S3 | 5 | gist | ok | Let me search for other potential status values: |
| dev-document-review-1 | S4 | 1 | immediate-small | INV-59162-E | INV-69162-E |
| dev-report-check-1 | S0 | 5 | gist | 19 | 8 |
| dev-report-check-1 | S1 | 5 | gist | 19 | UNREADABLE |
| dev-report-check-1 | S1 | 8 | late-small | 09:24 | UNREADABLE |
| dev-report-check-1 | S2 | 5 | gist | 19 | 1 |
| dev-report-check-1 | S2 | 8 | late-small | 09:24 | UNREADABLE |
| dev-report-check-1 | S3 | 5 | gist | 19 | 1 |
| dev-report-check-1 | S3 | 6 | late | Sep | Looking at the bar chart image I retrieved earlier, the tallest bar is in **Sept |
| dev-report-check-1 | S3 | 8 | late-small | 09:24 |  |
| dev-report-check-1 | S4 | 5 | gist | 19 | 8 |
| dev-ui-debugging-1 | S0 | 1 | immediate-small | 7924 | 7347 (build 7304) |
| dev-ui-debugging-1 | S1 | 1 | immediate-small | 7924 | 7347 (build 7304) |
| dev-ui-debugging-1 | S1 | 8 | late-small | 06:07 | UNREADABLE |
| dev-ui-debugging-1 | S2 | 1 | immediate-small | 7924 | Based on the original image I can see at the bottom right corner, the text reads |
| dev-ui-debugging-1 | S2 | 5 | gist | sync | Let me search for different subsystem tags that might appear in ERROR lines: |
| dev-ui-debugging-1 | S3 | 1 | immediate-small | 7924 | Based on the original image I can see at the bottom right corner, the text reads |
| dev-ui-debugging-1 | S3 | 5 | gist | sync | Let me get the original log to see all lines: |
| dev-ui-debugging-1 | S3 | 8 | late-small | 06:07 | 17:29 |
| dev-ui-debugging-1 | S4 | 1 | immediate-small | 7924 | 7547 |

# s3-dev-002 summary (experiment 3, split dev)

Exploratory. Content-match scoring. Tokens are means per session over all calls (turns, tool rounds, compaction).

| condition | sessions | accuracy | immediate | cross | gist | late recall | prompt tokens | cached | list cost | cache-view cost | calls | compactions | tool calls | originals | UNREADABLE |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S0 | 3 | 79% | 89% | 67% | 67% | 78% | 34,032 | 18,773 | $0.0854 | $0.0620 | 8.0 | 0.0 | 0 | 0 | 0 |
| S1 | 3 | 54% | 89% | 33% | 0% | 44% | 17,729 | 12,075 | $0.0453 | $0.0302 | 8.7 | 0.7 | 0 | 0 | 7 |
| S2 | 3 | 79% | 78% | 100% | 67% | 78% | 18,756 | 2,645 | $0.0497 | $0.0463 | 16.3 | 0.0 | 26 | 1 | 1 |
| S3 | 3 | 71% | 67% | 100% | 67% | 67% | 18,954 | 3,328 | $0.0501 | $0.0459 | 16.0 | 0.0 | 25 | 2 | 3 |
| S4 | 3 | 88% | 89% | 100% | 67% | 89% | 33,956 | 22,699 | $0.0851 | $0.0567 | 8.0 | 0.0 | 0 | 0 | 0 |

Turns whose prompt exceeded the 4000-token threshold (would have triggered a threshold compact): S0 0, S1 0, S2 0, S3 0, S4 0.

Cache-view cost assumes cached input billed at 0.5x list price [검증 필요].

## Wrong answers

| session | condition | turn | type | gold | answer |
|---|---|---|---|---|---|
| dev-document-review-1 | S0 | 1 | immediate-small | INV-59162-E | INV-69162-E |
| dev-document-review-1 | S0 | 4 | cross | Hose clamp 32 | V-belt A42 |
| dev-document-review-1 | S0 | 8 | late-small | ZT-2316-F50 | ZT-21G6-F50 |
| dev-document-review-1 | S1 | 1 | immediate-small | INV-59162-E | INV-69162-E |
| dev-document-review-1 | S1 | 4 | cross | Hose clamp 32 | UNREADABLE |
| dev-document-review-1 | S1 | 5 | gist | ok | UNREADABLE |
| dev-document-review-1 | S1 | 7 | late-log | f23e75 | UNREADABLE |
| dev-document-review-1 | S1 | 8 | late-small | ZT-2316-F50 | ZT-2165-F90 |
| dev-document-review-1 | S2 | 1 | immediate-small | INV-59162-E | INV-69162-E |
| dev-document-review-1 | S2 | 8 | late-small | ZT-2316-F50 | UNREADABLE |
| dev-document-review-1 | S3 | 1 | immediate-small | INV-59162-E | INV-69162-E |
| dev-document-review-1 | S3 | 2 | immediate-log | B-2664 | UNREADABLE |
| dev-document-review-1 | S3 | 8 | late-small | ZT-2316-F50 | UNREADABLE |
| dev-document-review-1 | S4 | 1 | immediate-small | INV-59162-E | INV-69162-E |
| dev-document-review-1 | S4 | 8 | late-small | ZT-2316-F50 | ZT-216-F50 |
| dev-report-check-1 | S0 | 5 | gist | 19 | 18 |
| dev-report-check-1 | S0 | 6 | late | Sep | **Dec** |
| dev-report-check-1 | S1 | 5 | gist | 19 | 17 |
| dev-report-check-1 | S1 | 6 | late | Sep | **Dec** |
| dev-report-check-1 | S2 | 5 | gist | 19 | 1 |
| dev-report-check-1 | S2 | 6 | late | Sep | June |
| dev-report-check-1 | S3 | 5 | gist | 19 | 1 |
| dev-report-check-1 | S3 | 6 | late | Sep | June |
| dev-report-check-1 | S4 | 5 | gist | 19 | 18 |
| dev-ui-debugging-1 | S1 | 4 | cross | On | UNREADABLE |
| dev-ui-debugging-1 | S1 | 5 | gist | sync | UNREADABLE |
| dev-ui-debugging-1 | S1 | 6 | late-small | 17.3 GB | UNREADABLE |
| dev-ui-debugging-1 | S1 | 7 | late-log | e96b50 | UNREADABLE |
| dev-ui-debugging-1 | S2 | 1 | immediate-small | 7924 | Build 71924 |
| dev-ui-debugging-1 | S3 | 1 | immediate-small | 7924 | Build 71924 |
| dev-ui-debugging-1 | S3 | 6 | late-small | 17.3 GB | UNREADABLE |

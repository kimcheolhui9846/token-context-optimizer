# s3-cal-001 summary (experiment 3, split calibration)

Exploratory. Content-match scoring. Tokens are means per session over all calls (turns, tool rounds, compaction).

| condition | sessions | accuracy | immediate | cross | gist | late recall | prompt tokens | cached | list cost | cache-view cost | calls | compactions | tool calls | originals | UNREADABLE |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S0 | 6 | 92% | 89% | 100% | 83% | 94% | 33,955 | 24,192 | $0.0854 | $0.0552 | 8.0 | 0.0 | 0 | 0 | 0 |
| S1 | 6 | 40% | 89% | 0% | 0% | 17% | 16,007 | 11,200 | $0.0430 | $0.0290 | 10.0 | 2.0 | 0 | 0 | 27 |
| S2 | 6 | 79% | 89% | 100% | 67% | 67% | 19,492 | 3,840 | $0.0515 | $0.0467 | 16.5 | 0.0 | 52 | 3 | 3 |
| S3 | 6 | 81% | 89% | 100% | 67% | 72% | 18,051 | 811 | $0.0508 | $0.0498 | 19.7 | 2.0 | 59 | 10 | 5 |
| S4 | 6 | 83% | 78% | 83% | 67% | 94% | 33,844 | 22,656 | $0.0849 | $0.0566 | 8.0 | 0.0 | 0 | 0 | 0 |

Turns whose prompt exceeded the 4000-token threshold (would have triggered a threshold compact): S0 28, S1 8, S2 0, S3 0, S4 28.

Cache-view cost assumes cached input billed at 0.5x list price [검증 필요].

## Wrong answers

| session | condition | turn | type | gold | answer |
|---|---|---|---|---|---|
| calibration-document-review-1 | S0 | 1 | immediate-small | INV-55785-C | INV-56785-C |
| calibration-document-review-1 | S0 | 8 | late-small | ZT-6534-M21 | ZT-4563A-M21 |
| calibration-document-review-1 | S1 | 1 | immediate-small | INV-55785-C | INV-56785-C |
| calibration-document-review-1 | S1 | 4 | cross | Hose clamp 32 | UNREADABLE |
| calibration-document-review-1 | S1 | 5 | gist | ok | UNREADABLE |
| calibration-document-review-1 | S1 | 7 | late-log | 41c4f9 | UNREADABLE |
| calibration-document-review-1 | S1 | 8 | late-small | ZT-6534-M21 | UNREADABLE |
| calibration-document-review-1 | S2 | 1 | immediate-small | INV-55785-C | INV-45785-C |
| calibration-document-review-1 | S2 | 8 | late-small | ZT-6534-M21 | UNREADABLE |
| calibration-document-review-1 | S3 | 1 | immediate-small | INV-55785-C | INV-45785-C |
| calibration-document-review-1 | S3 | 8 | late-small | ZT-6534-M21 | UNREADABLE |
| calibration-document-review-1 | S4 | 1 | immediate-small | INV-55785-C | INV-56785-C |
| calibration-document-review-1 | S4 | 4 | cross | Hose clamp 32 | O-ring 30x2 |
| calibration-document-review-1 | S4 | 8 | late-small | ZT-6534-M21 | ZT-4563-M21 |
| calibration-document-review-2 | S0 | 1 | immediate-small | INV-71012-A | INV-17012-A |
| calibration-document-review-2 | S1 | 1 | immediate-small | INV-71012-A | INV-17012-A |
| calibration-document-review-2 | S1 | 4 | cross | Grease 400g | UNREADABLE |
| calibration-document-review-2 | S1 | 5 | gist | ok | UNREADABLE |
| calibration-document-review-2 | S1 | 7 | late-log | 6309a3 | UNREADABLE |
| calibration-document-review-2 | S1 | 8 | late-small | ZT-3398-P17 | UNREADABLE |
| calibration-document-review-2 | S2 | 1 | immediate-small | INV-71012-A | INV-17012-A |
| calibration-document-review-2 | S2 | 8 | late-small | ZT-3398-P17 | shipment supply |
| calibration-document-review-2 | S3 | 1 | immediate-small | INV-71012-A | INV-17012-A |
| calibration-document-review-2 | S3 | 8 | late-small | ZT-3398-P17 | UNREADABLE |
| calibration-document-review-2 | S4 | 1 | immediate-small | INV-71012-A | INV-17012-A |
| calibration-report-check-1 | S1 | 4 | cross | yes | UNREADABLE |
| calibration-report-check-1 | S1 | 5 | gist | 28 | UNREADABLE |
| calibration-report-check-1 | S1 | 6 | late | Jul | UNREADABLE |
| calibration-report-check-1 | S1 | 8 | late-small | 13:27 | UNREADABLE |
| calibration-report-check-1 | S2 | 5 | gist | 28 | 1 |
| calibration-report-check-1 | S2 | 6 | late | Jul | January |
| calibration-report-check-1 | S3 | 5 | gist | 28 | 1 |
| calibration-report-check-1 | S3 | 8 | late-small | 13:27 | UNREADABLE |
| calibration-report-check-1 | S4 | 1 | immediate-small | 5,664 | The inspection sample size noted under the chart is **n = 5,661**. |
| calibration-report-check-1 | S4 | 5 | gist | 28 | 18 |
| calibration-report-check-2 | S0 | 5 | gist | 26 | 27 |
| calibration-report-check-2 | S1 | 4 | cross | no | UNREADABLE |
| calibration-report-check-2 | S1 | 5 | gist | 26 | UNREADABLE |
| calibration-report-check-2 | S1 | 6 | late | Aug | UNREADABLE |
| calibration-report-check-2 | S1 | 7 | late-log | 9 February 2026 | UNREADABLE |
| calibration-report-check-2 | S1 | 8 | late-small | 17:55 | UNREADABLE |
| calibration-report-check-2 | S2 | 5 | gist | 26 | 2 |
| calibration-report-check-2 | S2 | 6 | late | Aug | 985 |
| calibration-report-check-2 | S3 | 5 | gist | 26 | 2 |
| calibration-report-check-2 | S3 | 8 | late-small | 17:55 | UNREADABLE |
| calibration-report-check-2 | S4 | 5 | gist | 26 | 33 |
| calibration-ui-debugging-1 | S1 | 4 | cross | On | UNREADABLE |
| calibration-ui-debugging-1 | S1 | 5 | gist | sync | UNREADABLE |
| calibration-ui-debugging-1 | S1 | 6 | late-small | 95.2 GB | UNREADABLE |
| calibration-ui-debugging-1 | S1 | 7 | late-log | f32d3e | UNREADABLE |
| calibration-ui-debugging-1 | S1 | 8 | late-small | 20:38 | UNREADABLE |
| calibration-ui-debugging-1 | S2 | 6 | late-small | 95.2 GB | UNREADABLE |
| calibration-ui-debugging-1 | S4 | 1 | immediate-small | 8694 | 8684 |
| calibration-ui-debugging-2 | S1 | 4 | cross | Off | UNREADABLE |
| calibration-ui-debugging-2 | S1 | 5 | gist | sync | UNREADABLE |
| calibration-ui-debugging-2 | S1 | 6 | late-small | 57.0 GB | UNREADABLE |
| calibration-ui-debugging-2 | S1 | 7 | late-log | a99f16 | UNREADABLE |
| calibration-ui-debugging-2 | S1 | 8 | late-small | 07:03 | UNREADABLE |
| calibration-ui-debugging-2 | S2 | 6 | late-small | 57.0 GB | UNREADABLE |
| calibration-ui-debugging-2 | S3 | 6 | late-small | 57.0 GB | UNREADABLE |

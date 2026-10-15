# s3-heldout-gpt4o summary (experiment 3, split heldout)

Exploratory. Content-match scoring. Tokens are means per session over all calls (turns, tool rounds, compaction).

| condition | sessions | accuracy | immediate | cross | gist | late recall | prompt tokens | cached | list cost | cache-view cost | calls | compactions | tool calls | originals | UNREADABLE |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S0 | 24 | 90% | 93% | 92% | 67% | 93% | 33,892 | 26,613 | $0.0850 | $0.0518 | 8.0 | 0.0 | 0 | 0 | 0 |
| S1 | 24 | 40% | 93% | 0% | 0% | 14% | 16,021 | 10,832 | $0.0430 | $0.0294 | 10.0 | 2.0 | 0 | 0 | 108 |
| S2 | 24 | 85% | 92% | 83% | 67% | 85% | 23,295 | 11,024 | $0.0608 | $0.0470 | 15.6 | 0.0 | 190 | 10 | 10 |
| S3 | 24 | 84% | 89% | 92% | 67% | 82% | 22,257 | 9,227 | $0.0615 | $0.0499 | 19.0 | 2.0 | 223 | 18 | 15 |
| S4 | 24 | 89% | 93% | 92% | 67% | 92% | 33,884 | 25,957 | $0.0850 | $0.0526 | 8.0 | 0.0 | 0 | 0 | 0 |

Turns whose prompt exceeded the 4000-token threshold (would have triggered a threshold compact): S0 112, S1 32, S2 0, S3 0, S4 112.

Cache-view cost: cache reads at 0.5x and cache writes at 1x the input price (OpenAI, third-party sources [검증 필요]).

## Wrong answers

| session | condition | turn | type | gold | answer |
|---|---|---|---|---|---|
| heldout-document-review-1 | S0 | 1 | immediate-small | INV-51806-E | INV-61804-E |
| heldout-document-review-1 | S0 | 8 | late-small | ZT-9945-F55 | ZT-9945-F95 |
| heldout-document-review-1 | S1 | 1 | immediate-small | INV-51806-E | INV-61804-E |
| heldout-document-review-1 | S1 | 4 | cross | V-belt A48 | UNREADABLE |
| heldout-document-review-1 | S1 | 5 | gist | ok | UNREADABLE |
| heldout-document-review-1 | S1 | 6 | late | $10,426.14 | UNREADABLE |
| heldout-document-review-1 | S1 | 7 | late-log | 63b0c6 | UNREADABLE |
| heldout-document-review-1 | S1 | 8 | late-small | ZT-9945-F55 | UNREADABLE |
| heldout-document-review-1 | S2 | 1 | immediate-small | INV-51806-E | INV-61806-E |
| heldout-document-review-1 | S2 | 2 | immediate-log | B-5902 | UNREADABLE |
| heldout-document-review-1 | S2 | 4 | cross | V-belt A48 | V-belt A42 |
| heldout-document-review-1 | S2 | 8 | late-small | ZT-9945-F55 | UNREADABLE |
| heldout-document-review-1 | S3 | 1 | immediate-small | INV-51806-E | INV-61806-E |
| heldout-document-review-1 | S3 | 2 | immediate-log | B-5902 | UNREADABLE |
| heldout-document-review-1 | S3 | 8 | late-small | ZT-9945-F55 | UNREADABLE |
| heldout-document-review-1 | S4 | 1 | immediate-small | INV-51806-E | INV-61806-E |
| heldout-document-review-1 | S4 | 8 | late-small | ZT-9945-F55 | ZT-9945-F95 |
| heldout-document-review-2 | S0 | 8 | late-small | ZT-6800-F16 | ZT-8800-F16 |
| heldout-document-review-2 | S1 | 4 | cross | Hex bolt M8 | UNREADABLE |
| heldout-document-review-2 | S1 | 5 | gist | ok | UNREADABLE |
| heldout-document-review-2 | S1 | 6 | late | $13,674.10 | UNREADABLE |
| heldout-document-review-2 | S1 | 7 | late-log | c497fe | UNREADABLE |
| heldout-document-review-2 | S1 | 8 | late-small | ZT-6800-F16 | UNREADABLE |
| heldout-document-review-2 | S2 | 8 | late-small | ZT-6800-F16 | UNREADABLE |
| heldout-document-review-2 | S3 | 2 | immediate-log | B-8191 | UNREADABLE |
| heldout-document-review-2 | S3 | 8 | late-small | ZT-6800-F16 | UNREADABLE |
| heldout-document-review-2 | S4 | 8 | late-small | ZT-6800-F16 | ZT-8800-F16 |
| heldout-document-review-3 | S0 | 1 | immediate-small | INV-64670-E | INV-64870-E |
| heldout-document-review-3 | S0 | 8 | late-small | ZT-9839-B71 | ZT-893b-871 |
| heldout-document-review-3 | S1 | 1 | immediate-small | INV-64670-E | INV-64870-E |
| heldout-document-review-3 | S1 | 4 | cross | Hex bolt M10 | UNREADABLE |
| heldout-document-review-3 | S1 | 5 | gist | ok | UNREADABLE |
| heldout-document-review-3 | S1 | 7 | late-log | 1651aa | UNREADABLE |
| heldout-document-review-3 | S1 | 8 | late-small | ZT-9839-B71 | UNREADABLE |
| heldout-document-review-3 | S2 | 1 | immediate-small | INV-64670-E | INV-64870-E |
| heldout-document-review-3 | S2 | 8 | late-small | ZT-9839-B71 | UNREADABLE |
| heldout-document-review-3 | S3 | 1 | immediate-small | INV-64670-E | INV-64870-E |
| heldout-document-review-3 | S3 | 8 | late-small | ZT-9839-B71 | UNREADABLE |
| heldout-document-review-3 | S4 | 1 | immediate-small | INV-64670-E | INV-64870-E |
| heldout-document-review-3 | S4 | 8 | late-small | ZT-9839-B71 | ZT-893b871 |
| heldout-document-review-4 | S0 | 1 | immediate-small | INV-38503-A | INV-38650-A |
| heldout-document-review-4 | S0 | 8 | late-small | ZT-3669-M48 | ZT-3669-M88 |
| heldout-document-review-4 | S1 | 1 | immediate-small | INV-38503-A | INV-38650-A |
| heldout-document-review-4 | S1 | 4 | cross | V-belt A42 | UNREADABLE |
| heldout-document-review-4 | S1 | 5 | gist | ok | APPROVED |
| heldout-document-review-4 | S1 | 6 | late | $18,089.33 | UNREADABLE |
| heldout-document-review-4 | S1 | 7 | late-log | 8e62fb | UNREADABLE |
| heldout-document-review-4 | S1 | 8 | late-small | ZT-3669-M48 | UNREADABLE |
| heldout-document-review-4 | S2 | 1 | immediate-small | INV-38503-A | INV-38650-A |
| heldout-document-review-4 | S2 | 2 | immediate-log | B-2710 | UNREADABLE |
| heldout-document-review-4 | S2 | 4 | cross | V-belt A42 | Hex bolt M10 |
| heldout-document-review-4 | S2 | 8 | late-small | ZT-3669-M48 | UNREADABLE |
| heldout-document-review-4 | S3 | 1 | immediate-small | INV-38503-A | INV-38650-A |
| heldout-document-review-4 | S3 | 2 | immediate-log | B-2710 | UNREADABLE |
| heldout-document-review-4 | S3 | 4 | cross | V-belt A42 | Washer 25mm |
| heldout-document-review-4 | S3 | 8 | late-small | ZT-3669-M48 | UNREADABLE |
| heldout-document-review-4 | S4 | 1 | immediate-small | INV-38503-A | INV-38650-A |
| heldout-document-review-4 | S4 | 8 | late-small | ZT-3669-M48 | ZT-3698-M48 |
| heldout-document-review-5-v2 | S0 | 4 | cross | Gasket 50mm | Gasket 40mm |
| heldout-document-review-5-v2 | S0 | 8 | late-small | QR-7436-G81 | QR-7435-Q81 |
| heldout-document-review-5-v2 | S1 | 4 | cross | Gasket 50mm | UNREADABLE |
| heldout-document-review-5-v2 | S1 | 5 | gist | ok | UNREADABLE |
| heldout-document-review-5-v2 | S1 | 7 | late-log | 9dc957 | UNREADABLE |
| heldout-document-review-5-v2 | S1 | 8 | late-small | QR-7436-G81 | UNREADABLE |
| heldout-document-review-5-v2 | S2 | 8 | late-small | QR-7436-G81 | QR-7435-Q81 |
| heldout-document-review-5-v2 | S3 | 8 | late-small | QR-7436-G81 | Ref: QR-7435-Q81 |
| heldout-document-review-5-v2 | S4 | 8 | late-small | QR-7436-G81 | GR-7458-GR1 |
| heldout-document-review-6-v2 | S1 | 4 | cross | Bushing 20mm | UNREADABLE |
| heldout-document-review-6-v2 | S1 | 5 | gist | ok | UNREADABLE |
| heldout-document-review-6-v2 | S1 | 7 | late-log | b9bbbb | UNREADABLE |
| heldout-document-review-6-v2 | S1 | 8 | late-small | QR-9548-N65 | UNREADABLE |
| heldout-document-review-6-v2 | S2 | 8 | late-small | QR-9548-N65 | QR-9548-N85 |
| heldout-document-review-7-v2 | S1 | 4 | cross | Cable tie 200 | UNREADABLE |
| heldout-document-review-7-v2 | S1 | 5 | gist | ok | UNREADABLE |
| heldout-document-review-7-v2 | S1 | 7 | late-log | aac7f3 | UNREADABLE |
| heldout-document-review-7-v2 | S1 | 8 | late-small | QR-3514-N15 | UNREADABLE |
| heldout-document-review-7-v2 | S4 | 4 | cross | Cable tie 200 | Timing belt T10 |
| heldout-document-review-8-v2 | S1 | 4 | cross | Gasket 40mm | UNREADABLE |
| heldout-document-review-8-v2 | S1 | 5 | gist | ok | UNREADABLE |
| heldout-document-review-8-v2 | S1 | 7 | late-log | 389453 | UNREADABLE |
| heldout-document-review-8-v2 | S1 | 8 | late-small | QR-7522-N44 | UNREADABLE |
| heldout-document-review-8-v2 | S3 | 2 | immediate-log | B-8594 | 389453 |
| heldout-report-check-1 | S0 | 5 | gist | 31 | 36 |
| heldout-report-check-1 | S1 | 4 | cross | no | UNREADABLE |
| heldout-report-check-1 | S1 | 5 | gist | 31 | UNREADABLE |
| heldout-report-check-1 | S1 | 6 | late | Oct | UNREADABLE |
| heldout-report-check-1 | S1 | 7 | late-log | 15 August 2026 | UNREADABLE |
| heldout-report-check-1 | S1 | 8 | late-small | 22:47 | UNREADABLE |
| heldout-report-check-1 | S2 | 5 | gist | 31 | 1 |
| heldout-report-check-1 | S3 | 5 | gist | 31 | 1 |
| heldout-report-check-1 | S3 | 8 | late-small | 22:47 | UNREADABLE |
| heldout-report-check-1 | S4 | 5 | gist | 31 | 43 |
| heldout-report-check-2 | S0 | 5 | gist | 20 | 18 |
| heldout-report-check-2 | S1 | 4 | cross | yes | UNREADABLE |
| heldout-report-check-2 | S1 | 5 | gist | 20 | UNREADABLE |
| heldout-report-check-2 | S1 | 6 | late | Apr | UNREADABLE |
| heldout-report-check-2 | S1 | 8 | late-small | 20:02 | UNREADABLE |
| heldout-report-check-2 | S2 | 5 | gist | 20 | 1 |
| heldout-report-check-2 | S3 | 5 | gist | 20 | 3 |
| heldout-report-check-2 | S4 | 5 | gist | 20 | 22 |
| heldout-report-check-3 | S0 | 5 | gist | 22 | 28 |
| heldout-report-check-3 | S1 | 4 | cross | yes | UNREADABLE |
| heldout-report-check-3 | S1 | 5 | gist | 22 | UNREADABLE |
| heldout-report-check-3 | S1 | 6 | late | Jan | UNREADABLE |
| heldout-report-check-3 | S2 | 5 | gist | 22 | 2 |
| heldout-report-check-3 | S3 | 5 | gist | 22 | 2 |
| heldout-report-check-3 | S3 | 8 | late-small | 14:40 | UNREADABLE |
| heldout-report-check-3 | S4 | 5 | gist | 22 | 27 |
| heldout-report-check-4 | S0 | 5 | gist | 25 | 24 |
| heldout-report-check-4 | S1 | 4 | cross | no | UNREADABLE |
| heldout-report-check-4 | S1 | 5 | gist | 25 | UNREADABLE |
| heldout-report-check-4 | S1 | 6 | late | Jan | UNREADABLE |
| heldout-report-check-4 | S1 | 7 | late-log | 11 March 2026 | UNREADABLE |
| heldout-report-check-4 | S1 | 8 | late-small | 08:57 | UNREADABLE |
| heldout-report-check-4 | S2 | 5 | gist | 25 | 1 |
| heldout-report-check-4 | S3 | 5 | gist | 25 | 1 |
| heldout-report-check-4 | S4 | 5 | gist | 25 | 23 |
| heldout-report-check-5-v2 | S0 | 5 | gist | 28 | 36 |
| heldout-report-check-5-v2 | S1 | 4 | cross | no | UNREADABLE |
| heldout-report-check-5-v2 | S1 | 5 | gist | 28 | UNREADABLE |
| heldout-report-check-5-v2 | S1 | 6 | late | Mar | UNREADABLE |
| heldout-report-check-5-v2 | S1 | 8 | late-small | 10:20 | UNREADABLE |
| heldout-report-check-5-v2 | S2 | 5 | gist | 28 | 2 |
| heldout-report-check-5-v2 | S2 | 8 | late-small | 10:20 | UNREADABLE |
| heldout-report-check-5-v2 | S3 | 5 | gist | 28 | 1 |
| heldout-report-check-5-v2 | S4 | 5 | gist | 28 | 27 |
| heldout-report-check-6-v2 | S0 | 5 | gist | 28 | 27 |
| heldout-report-check-6-v2 | S1 | 4 | cross | no | UNREADABLE |
| heldout-report-check-6-v2 | S1 | 5 | gist | 28 | UNREADABLE |
| heldout-report-check-6-v2 | S1 | 6 | late | May | UNREADABLE |
| heldout-report-check-6-v2 | S1 | 7 | late-log | 21 August 2026 | UNREADABLE |
| heldout-report-check-6-v2 | S1 | 8 | late-small | 06:49 | UNREADABLE |
| heldout-report-check-6-v2 | S2 | 4 | cross | no | Yes |
| heldout-report-check-6-v2 | S2 | 5 | gist | 28 | 1 |
| heldout-report-check-6-v2 | S3 | 4 | cross | no | UNREADABLE |
| heldout-report-check-6-v2 | S3 | 5 | gist | 28 | 1 |
| heldout-report-check-6-v2 | S3 | 8 | late-small | 06:49 | UNREADABLE |
| heldout-report-check-6-v2 | S4 | 5 | gist | 28 | 27 |
| heldout-report-check-7-v2 | S0 | 1 | immediate-small | 9,666 | 9,656 |
| heldout-report-check-7-v2 | S0 | 5 | gist | 28 | 36 |
| heldout-report-check-7-v2 | S1 | 1 | immediate-small | 9,666 | 9,656 |
| heldout-report-check-7-v2 | S1 | 4 | cross | no | UNREADABLE |
| heldout-report-check-7-v2 | S1 | 5 | gist | 28 | UNREADABLE |
| heldout-report-check-7-v2 | S1 | 6 | late | May | UNREADABLE |
| heldout-report-check-7-v2 | S1 | 7 | late-log | 18 October 2026 | UNREADABLE |
| heldout-report-check-7-v2 | S1 | 8 | late-small | 07:18 | UNREADABLE |
| heldout-report-check-7-v2 | S2 | 5 | gist | 28 | 1 |
| heldout-report-check-7-v2 | S3 | 5 | gist | 28 | 1 |
| heldout-report-check-7-v2 | S3 | 8 | late-small | 07:18 | UNREADABLE |
| heldout-report-check-7-v2 | S4 | 1 | immediate-small | 9,666 | 9,966 |
| heldout-report-check-7-v2 | S4 | 5 | gist | 28 | 36 |
| heldout-report-check-8-v2 | S0 | 5 | gist | 25 | 29 |
| heldout-report-check-8-v2 | S1 | 4 | cross | no | UNREADABLE |
| heldout-report-check-8-v2 | S1 | 5 | gist | 25 | UNREADABLE |
| heldout-report-check-8-v2 | S1 | 6 | late | Nov | UNREADABLE |
| heldout-report-check-8-v2 | S1 | 8 | late-small | 18:43 | UNREADABLE |
| heldout-report-check-8-v2 | S2 | 5 | gist | 25 | 1 |
| heldout-report-check-8-v2 | S2 | 8 | late-small | 18:43 | UNREADABLE |
| heldout-report-check-8-v2 | S3 | 5 | gist | 25 | 1 |
| heldout-report-check-8-v2 | S3 | 8 | late-small | 18:43 | UNREADABLE |
| heldout-report-check-8-v2 | S4 | 5 | gist | 25 | 27 |
| heldout-ui-debugging-1 | S1 | 4 | cross | On | UNREADABLE |
| heldout-ui-debugging-1 | S1 | 5 | gist | sync | UNREADABLE |
| heldout-ui-debugging-1 | S1 | 6 | late-small | 26.8 GB | UNREADABLE |
| heldout-ui-debugging-1 | S1 | 7 | late-log | a77566 | UNREADABLE |
| heldout-ui-debugging-1 | S1 | 8 | late-small | 19:09 | UNREADABLE |
| heldout-ui-debugging-1 | S2 | 8 | late-small | 19:09 | UNREADABLE |
| heldout-ui-debugging-1 | S3 | 8 | late-small | 19:09 | UNREADABLE |
| heldout-ui-debugging-2 | S0 | 1 | immediate-small | 2493 | 2403 |
| heldout-ui-debugging-2 | S1 | 1 | immediate-small | 2493 | 2403 |
| heldout-ui-debugging-2 | S1 | 4 | cross | Off | UNREADABLE |
| heldout-ui-debugging-2 | S1 | 5 | gist | sync | UNREADABLE |
| heldout-ui-debugging-2 | S1 | 6 | late-small | 85.4 GB | UNREADABLE |
| heldout-ui-debugging-2 | S1 | 7 | late-log | 373b9f | UNREADABLE |
| heldout-ui-debugging-2 | S1 | 8 | late-small | 10:13 | UNREADABLE |
| heldout-ui-debugging-2 | S2 | 1 | immediate-small | 2493 | Build 2403 |
| heldout-ui-debugging-2 | S3 | 1 | immediate-small | 2493 | 2403 |
| heldout-ui-debugging-2 | S4 | 1 | immediate-small | 2493 | 2403 |
| heldout-ui-debugging-3 | S0 | 4 | cross | On | Off |
| heldout-ui-debugging-3 | S1 | 4 | cross | On | UNREADABLE |
| heldout-ui-debugging-3 | S1 | 5 | gist | sync | E4762 |
| heldout-ui-debugging-3 | S1 | 6 | late-small | 28.9 GB | UNREADABLE |
| heldout-ui-debugging-3 | S1 | 7 | late-log | 46fadb | UNREADABLE |
| heldout-ui-debugging-3 | S1 | 8 | late-small | 23:27 | UNREADABLE |
| heldout-ui-debugging-4 | S1 | 4 | cross | On | UNREADABLE |
| heldout-ui-debugging-4 | S1 | 5 | gist | sync | UNREADABLE |
| heldout-ui-debugging-4 | S1 | 6 | late-small | 77.6 GB | UNREADABLE |
| heldout-ui-debugging-4 | S1 | 7 | late-log | 7d9bfe | UNREADABLE |
| heldout-ui-debugging-4 | S1 | 8 | late-small | 10:40 | UNREADABLE |
| heldout-ui-debugging-4 | S2 | 4 | cross | On | Off |
| heldout-ui-debugging-4 | S3 | 8 | late-small | 10:40 | UNREADABLE |
| heldout-ui-debugging-4 | S4 | 4 | cross | On | Off |
| heldout-ui-debugging-5-v2 | S1 | 4 | cross | Off | UNREADABLE |
| heldout-ui-debugging-5-v2 | S1 | 5 | gist | sync | UNREADABLE |
| heldout-ui-debugging-5-v2 | S1 | 6 | late-small | 36.8 GB | UNREADABLE |
| heldout-ui-debugging-5-v2 | S1 | 7 | late-log | b2a777 | UNREADABLE |
| heldout-ui-debugging-5-v2 | S1 | 8 | late-small | 02:27 | UNREADABLE |
| heldout-ui-debugging-5-v2 | S2 | 8 | late-small | 02:27 | UNREADABLE |
| heldout-ui-debugging-6-v2 | S1 | 4 | cross | Off | UNREADABLE |
| heldout-ui-debugging-6-v2 | S1 | 5 | gist | sync | UNREADABLE |
| heldout-ui-debugging-6-v2 | S1 | 6 | late-small | 70.1 GB | UNREADABLE |
| heldout-ui-debugging-6-v2 | S1 | 7 | late-log | 7c2619 | UNREADABLE |
| heldout-ui-debugging-6-v2 | S1 | 8 | late-small | 16:32 | UNREADABLE |
| heldout-ui-debugging-7-v2 | S1 | 4 | cross | Off | UNREADABLE |
| heldout-ui-debugging-7-v2 | S1 | 5 | gist | sync | UNREADABLE |
| heldout-ui-debugging-7-v2 | S1 | 6 | late-small | 82.8 GB | UNREADABLE |
| heldout-ui-debugging-7-v2 | S1 | 7 | late-log | 93ea7d | UNREADABLE |
| heldout-ui-debugging-7-v2 | S1 | 8 | late-small | 11:44 | UNREADABLE |
| heldout-ui-debugging-8-v2 | S1 | 4 | cross | Off | UNREADABLE |
| heldout-ui-debugging-8-v2 | S1 | 5 | gist | sync | UNREADABLE |
| heldout-ui-debugging-8-v2 | S1 | 6 | late-small | 79.1 GB | UNREADABLE |
| heldout-ui-debugging-8-v2 | S1 | 7 | late-log | c182d6 | UNREADABLE |
| heldout-ui-debugging-8-v2 | S1 | 8 | late-small | 03:58 | UNREADABLE |
| heldout-ui-debugging-8-v2 | S2 | 8 | late-small | 03:58 | 00:58 |
| heldout-ui-debugging-8-v2 | S3 | 8 | late-small | 03:58 | 00:58 |
| heldout-ui-debugging-8-v2 | S4 | 8 | late-small | 03:58 | 05:38 |

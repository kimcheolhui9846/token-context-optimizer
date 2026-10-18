# s3-dev-haiku-001 summary (experiment 3, split dev)

Exploratory. Content-match scoring. Tokens are means per session over all calls (turns, tool rounds, compaction).

| condition | sessions | accuracy | immediate | cross | gist | late recall | prompt tokens | cached | list cost | cache-view cost | calls | compactions | tool calls | originals | UNREADABLE |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S0 | 3 | 92% | 89% | 100% | 67% | 100% | 46,265 | 37,039 | $0.0465 | $0.0149 | 8.0 | 0.0 | 0 | 0 | 0 |
| S1 | 3 | 75% | 89% | 67% | 67% | 67% | 22,797 | 17,128 | $0.0269 | $0.0115 | 10.0 | 2.0 | 0 | 0 | 5 |
| S2 | 3 | 29% | 44% | 0% | 0% | 33% | 68,375 | 14,976 | $0.0743 | $0.0626 | 25.3 | 0.0 | 52 | 3 | 3 |
| S3 | 3 | 29% | 44% | 0% | 0% | 33% | 60,853 | 11,084 | $0.0697 | $0.0605 | 29.3 | 2.0 | 58 | 2 | 0 |
| S4 | 3 | 88% | 78% | 100% | 67% | 100% | 46,249 | 37,025 | $0.0465 | $0.0149 | 8.0 | 0.0 | 0 | 0 | 0 |

Turns whose prompt exceeded the 4000-token threshold (would have triggered a threshold compact): S0 20, S1 5, S2 6, S3 5, S4 20.

Cache-view cost: cache reads at 0.1x and cache writes at 1.25x the input price (Anthropic reference).

## Wrong answers

| session | condition | turn | type | gold | answer |
|---|---|---|---|---|---|
| dev-document-review-1 | S1 | 4 | cross | Hose clamp 32 | UNREADABLE |
| dev-document-review-1 | S1 | 7 | late-log | f23e75 | UNREADABLE |
| dev-document-review-1 | S2 | 1 | immediate-small | INV-59162-E | INV-69162-E |
| dev-document-review-1 | S2 | 2 | immediate-log | B-2664 | Let me try searching with the invoice number: |
| dev-document-review-1 | S2 | 4 | cross | Hose clamp 32 | Let me search for the over_limit flag: |
| dev-document-review-1 | S2 | 5 | gist | ok |  |
| dev-document-review-1 | S2 | 7 | late-log | f23e75 | I apologize for the difficulty. The query_text_artifact function requires search |
| dev-document-review-1 | S2 | 8 | late-small | ZT-2316-F50 | The footnote text at the bottom is still not clearly readable. Let me query for  |
| dev-document-review-1 | S3 | 1 | immediate-small | INV-59162-E | INV-69162-E |
| dev-document-review-1 | S3 | 2 | immediate-log | B-2664 | Let me try searching with the invoice number: |
| dev-document-review-1 | S3 | 4 | cross | Hose clamp 32 |  |
| dev-document-review-1 | S3 | 5 | gist | ok | Let me get the original log to see its structure: |
| dev-document-review-1 | S3 | 7 | late-log | f23e75 |  |
| dev-document-review-1 | S3 | 8 | late-small | ZT-2316-F50 | Let me get the original log to see its contents: |
| dev-document-review-1 | S4 | 1 | immediate-small | INV-59162-E | INV-69162-E |
| dev-report-check-1 | S0 | 5 | gist | 19 | 8 |
| dev-report-check-1 | S1 | 5 | gist | 19 | UNREADABLE |
| dev-report-check-1 | S1 | 8 | late-small | 09:24 | UNREADABLE |
| dev-report-check-1 | S2 | 2 | immediate-log | January |  |
| dev-report-check-1 | S2 | 4 | cross | yes |  |
| dev-report-check-1 | S2 | 5 | gist | 19 | UNREADABLE |
| dev-report-check-1 | S2 | 7 | late-log | 4 June 2026 | UNREADABLE |
| dev-report-check-1 | S2 | 8 | late-small | 09:24 | Let me query for the timestamp area at the top of the image: |
| dev-report-check-1 | S3 | 2 | immediate-log | January |  |
| dev-report-check-1 | S3 | 4 | cross | yes | Let me try again with the correct artifact ID: |
| dev-report-check-1 | S3 | 5 | gist | 19 | Let me try searching for "legend" in the log: |
| dev-report-check-1 | S3 | 7 | late-log | 4 June 2026 |  |
| dev-report-check-1 | S3 | 8 | late-small | 09:24 | Let me try searching the images for update time information: |
| dev-report-check-1 | S4 | 5 | gist | 19 | 8 |
| dev-ui-debugging-1 | S0 | 1 | immediate-small | 7924 | 7347 (build 7304) |
| dev-ui-debugging-1 | S1 | 1 | immediate-small | 7924 | 7347 (build 7304) |
| dev-ui-debugging-1 | S1 | 8 | late-small | 06:07 | UNREADABLE |
| dev-ui-debugging-1 | S2 | 1 | immediate-small | 7924 | I can see text at the bottom right that appears to say "Firmware 7.7.47 (build 7 |
| dev-ui-debugging-1 | S2 | 2 | immediate-log | E5281 |  |
| dev-ui-debugging-1 | S2 | 4 | cross | On | I need to provide a query term. Let me search for "rejected": |
| dev-ui-debugging-1 | S2 | 5 | gist | sync | I apologize, but I'm unable to query the log artifact effectively. The query_tex |
| dev-ui-debugging-1 | S2 | 6 | late-small | 17.3 GB | I can see the Service Overview dashboard, but I don't see a storage usage metric |
| dev-ui-debugging-1 | S2 | 7 | late-log | e96b50 | UNREADABLE |
| dev-ui-debugging-1 | S3 | 1 | immediate-small | 7924 | I can see text at the bottom right that appears to say "Firmware 7.7.47 (build 7 |
| dev-ui-debugging-1 | S3 | 2 | immediate-log | E5281 |  |
| dev-ui-debugging-1 | S3 | 4 | cross | On | Let me search for "rejected": |
| dev-ui-debugging-1 | S3 | 5 | gist | sync |  |
| dev-ui-debugging-1 | S3 | 7 | late-log | e96b50 |  |
| dev-ui-debugging-1 | S3 | 8 | late-small | 06:07 | Let me get the original full resolution image to look for "last sync": |
| dev-ui-debugging-1 | S4 | 1 | immediate-small | 7924 | 7547 |

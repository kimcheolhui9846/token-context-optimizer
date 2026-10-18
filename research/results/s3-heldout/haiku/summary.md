# s3-heldout-haiku summary (experiment 3, split heldout)

Exploratory. Content-match scoring. Tokens are means per session over all calls (turns, tool rounds, compaction).

| condition | sessions | accuracy | immediate | cross | gist | late recall | prompt tokens | cached | list cost | cache-view cost | calls | compactions | tool calls | originals | UNREADABLE |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S0 | 24 | 90% | 94% | 92% | 67% | 93% | 46,143 | 36,928 | $0.0464 | $0.0148 | 8.0 | 0.0 | 0 | 0 | 2 |
| S1 | 24 | 79% | 94% | 71% | 63% | 72% | 22,743 | 17,069 | $0.0268 | $0.0114 | 10.0 | 2.0 | 0 | 0 | 31 |
| S2 | 24 | 77% | 92% | 100% | 29% | 71% | 56,696 | 10,171 | $0.0617 | $0.0544 | 18.5 | 0.0 | 255 | 17 | 10 |
| S3 | 24 | 74% | 92% | 96% | 4% | 74% | 56,575 | 12,094 | $0.0653 | $0.0553 | 21.8 | 2.0 | 301 | 24 | 0 |
| S4 | 24 | 89% | 93% | 92% | 67% | 90% | 46,143 | 36,928 | $0.0464 | $0.0148 | 8.0 | 0.0 | 0 | 0 | 2 |

Turns whose prompt exceeded the 4000-token threshold (would have triggered a threshold compact): S0 160, S1 40, S2 52, S3 52, S4 160.

Cache-view cost: cache reads at 0.1x and cache writes at 1.25x the input price (Anthropic reference).

## Wrong answers

| session | condition | turn | type | gold | answer |
|---|---|---|---|---|---|
| heldout-document-review-1 | S0 | 8 | late-small | ZT-9945-F55 | ZT-9045-F55 |
| heldout-document-review-1 | S1 | 4 | cross | V-belt A48 | UNREADABLE |
| heldout-document-review-1 | S1 | 7 | late-log | 63b0c6 | UNREADABLE |
| heldout-document-review-1 | S1 | 8 | late-small | ZT-9945-F55 | UNREADABLE |
| heldout-document-review-1 | S2 | 8 | late-small | ZT-9945-F55 | UNREADABLE |
| heldout-document-review-1 | S3 | 5 | gist | ok | Let me search for other potential status values: |
| heldout-document-review-1 | S4 | 8 | late-small | ZT-9945-F55 | ZT-9045-F55 |
| heldout-document-review-2 | S1 | 4 | cross | Hex bolt M8 | UNREADABLE  The log shows an over_limit amount of $114.36, but the invoice detai |
| heldout-document-review-2 | S1 | 7 | late-log | c497fe | UNREADABLE |
| heldout-document-review-2 | S1 | 8 | late-small | ZT-6800-F16 | UNREADABLE |
| heldout-document-review-2 | S2 | 8 | late-small | ZT-6800-F16 | UNREADABLE |
| heldout-document-review-3 | S0 | 8 | late-small | ZT-9839-B71 | ZT-9839-871 |
| heldout-document-review-3 | S1 | 8 | late-small | ZT-9839-B71 | UNREADABLE |
| heldout-document-review-3 | S2 | 5 | gist | ok | Let me try a different search to find all status values: |
| heldout-document-review-3 | S2 | 8 | late-small | ZT-9839-B71 | UNREADABLE |
| heldout-document-review-3 | S3 | 5 | gist | ok | Let me try a different approach and search for common status keywords: |
| heldout-document-review-3 | S4 | 8 | late-small | ZT-9839-B71 | ZT-0839-871 |
| heldout-document-review-4 | S1 | 4 | cross | V-belt A42 | UNREADABLE |
| heldout-document-review-4 | S1 | 8 | late-small | ZT-3669-M48 | UNREADABLE |
| heldout-document-review-4 | S2 | 2 | immediate-log | B-2710 | 8e62fb |
| heldout-document-review-4 | S2 | 8 | late-small | ZT-3669-M48 | UNREADABLE |
| heldout-document-review-4 | S3 | 2 | immediate-log | B-2710 | 8e62fb |
| heldout-document-review-4 | S3 | 5 | gist | ok | Let me try searching for "posted" to get all ledger entries: |
| heldout-document-review-4 | S4 | 8 | late-small | ZT-3669-M48 | ZT-3659-9448 |
| heldout-document-review-5-v2 | S1 | 7 | late-log | 9dc957 | UNREADABLE |
| heldout-document-review-5-v2 | S2 | 6 | late | $16,557.49 | Looking at the invoice image I already retrieved, the amount due is shown at the |
| heldout-document-review-5-v2 | S3 | 5 | gist | ok | The search results are limited. Let me try a broader search to see the full log  |
| heldout-document-review-5-v2 | S3 | 6 | late | $16,557.49 | $16,357.49 |
| heldout-document-review-6-v2 | S1 | 4 | cross | Bushing 20mm | UNREADABLE |
| heldout-document-review-6-v2 | S1 | 7 | late-log | b9bbbb | UNREADABLE |
| heldout-document-review-6-v2 | S2 | 5 | gist | ok | Let me try a different approach and search for common status values: |
| heldout-document-review-6-v2 | S2 | 6 | late | $18,101.88 | Based on the overview image, I can see the "Amount due" box at the bottom showin |
| heldout-document-review-6-v2 | S3 | 5 | gist | ok | Let me try a different approach and search for common status values: |
| heldout-document-review-7-v2 | S2 | 1 | immediate-small | INV-98302-B | INV-08302-B |
| heldout-document-review-7-v2 | S2 | 5 | gist | ok | Let me search for other common status values: |
| heldout-document-review-7-v2 | S3 | 1 | immediate-small | INV-98302-B | I can see the invoice in the image. Looking at the bottom of the document, I can |
| heldout-document-review-7-v2 | S3 | 5 | gist | ok | Let me search for other potential status values: |
| heldout-document-review-7-v2 | S4 | 1 | immediate-small | INV-98302-B | INV-08302-B |
| heldout-document-review-8-v2 | S1 | 4 | cross | Gasket 40mm | UNREADABLE  The log shows an over_limit flag amount of $1,443.81 for invoice INV |
| heldout-document-review-8-v2 | S2 | 2 | immediate-log | B-8594 | 389453 |
| heldout-document-review-8-v2 | S3 | 2 | immediate-log | B-8594 | 389453 |
| heldout-document-review-8-v2 | S3 | 5 | gist | ok | Let me try a different approach and search for common status keywords: |
| heldout-report-check-1 | S0 | 5 | gist | 31 | 16 |
| heldout-report-check-1 | S1 | 5 | gist | 31 | UNREADABLE |
| heldout-report-check-1 | S2 | 5 | gist | 31 | 1 |
| heldout-report-check-1 | S2 | 6 | late | Oct | Looking at the bar chart overview from the previous query, the tallest bar is in |
| heldout-report-check-1 | S2 | 8 | late-small | 22:47 | UNREADABLE |
| heldout-report-check-1 | S3 | 5 | gist | 31 | 1 |
| heldout-report-check-1 | S3 | 6 | late | Oct | From the overview, I can see October (Oct) has the tallest bar with a value of 9 |
| heldout-report-check-1 | S3 | 8 | late-small | 22:47 | Let me check the images for timestamp information: |
| heldout-report-check-1 | S4 | 5 | gist | 31 | 16 |
| heldout-report-check-2 | S0 | 5 | gist | 20 | 8 |
| heldout-report-check-2 | S1 | 5 | gist | 20 | UNREADABLE |
| heldout-report-check-2 | S2 | 5 | gist | 20 | 1 |
| heldout-report-check-2 | S2 | 6 | late | Apr | Looking at the bar chart image I already retrieved, the tallest bar is in Decemb |
| heldout-report-check-2 | S2 | 8 | late-small | 20:02 | UNREADABLE |
| heldout-report-check-2 | S3 | 5 | gist | 20 | 2 |
| heldout-report-check-2 | S3 | 6 | late | Apr | Looking at the bar chart from the previous image, the tallest bar is in **April* |
| heldout-report-check-2 | S3 | 8 | late-small | 20:02 |  |
| heldout-report-check-2 | S4 | 5 | gist | 20 | 8 |
| heldout-report-check-3 | S0 | 5 | gist | 22 | 12 |
| heldout-report-check-3 | S1 | 4 | cross | yes | No |
| heldout-report-check-3 | S1 | 5 | gist | 22 | UNREADABLE |
| heldout-report-check-3 | S2 | 5 | gist | 22 | 2 |
| heldout-report-check-3 | S2 | 6 | late | Jan | Looking at the bar chart overview from img-A, the tallest bar appears to be in J |
| heldout-report-check-3 | S2 | 8 | late-small | 14:40 | Let me check the image for any timestamp information: |
| heldout-report-check-3 | S3 | 5 | gist | 22 | 2 |
| heldout-report-check-3 | S4 | 5 | gist | 22 | 12 |
| heldout-report-check-4 | S0 | 1 | immediate-small | 7,533 | 7,633 |
| heldout-report-check-4 | S0 | 5 | gist | 25 | 12 |
| heldout-report-check-4 | S1 | 1 | immediate-small | 7,533 | 7,633 |
| heldout-report-check-4 | S1 | 5 | gist | 25 | UNREADABLE |
| heldout-report-check-4 | S2 | 5 | gist | 25 | 1 |
| heldout-report-check-4 | S2 | 6 | late | Jan | Looking at the bar chart overview from the previous query, the tallest bar is in |
| heldout-report-check-4 | S2 | 8 | late-small | 08:57 | Let me check the image for any timestamp information: |
| heldout-report-check-4 | S3 | 5 | gist | 25 | 1 |
| heldout-report-check-4 | S3 | 8 | late-small | 08:57 |  |
| heldout-report-check-4 | S4 | 1 | immediate-small | 7,533 | 7,633 |
| heldout-report-check-4 | S4 | 5 | gist | 25 | 12 |
| heldout-report-check-5-v2 | S0 | 5 | gist | 28 | 12 |
| heldout-report-check-5-v2 | S1 | 5 | gist | 28 | UNREADABLE |
| heldout-report-check-5-v2 | S2 | 5 | gist | 28 | 1 |
| heldout-report-check-5-v2 | S2 | 8 | late-small | 10:20 | UNREADABLE |
| heldout-report-check-5-v2 | S3 | 5 | gist | 28 | 1 |
| heldout-report-check-5-v2 | S3 | 6 | late | Mar | Looking at the original image of the bar chart, the tallest bar is for **Mar** w |
| heldout-report-check-5-v2 | S3 | 8 | late-small | 10:20 |  |
| heldout-report-check-5-v2 | S4 | 5 | gist | 28 | 12 |
| heldout-report-check-6-v2 | S0 | 5 | gist | 28 | 16 |
| heldout-report-check-6-v2 | S1 | 5 | gist | 28 | UNREADABLE |
| heldout-report-check-6-v2 | S2 | 5 | gist | 28 | 1 |
| heldout-report-check-6-v2 | S2 | 8 | late-small | 06:49 | UNREADABLE |
| heldout-report-check-6-v2 | S3 | 5 | gist | 28 | 1 |
| heldout-report-check-6-v2 | S3 | 6 | late | May | Looking at the bar chart from img-A, the tallest bar is for **May** with a value |
| heldout-report-check-6-v2 | S3 | 8 | late-small | 06:49 |  |
| heldout-report-check-6-v2 | S4 | 5 | gist | 28 | 16 |
| heldout-report-check-7-v2 | S0 | 5 | gist | 28 | 12 |
| heldout-report-check-7-v2 | S1 | 5 | gist | 28 | UNREADABLE |
| heldout-report-check-7-v2 | S2 | 5 | gist | 28 | 1 |
| heldout-report-check-7-v2 | S2 | 6 | late | May | December |
| heldout-report-check-7-v2 | S2 | 8 | late-small | 07:18 | UNREADABLE |
| heldout-report-check-7-v2 | S3 | 5 | gist | 28 | 1 |
| heldout-report-check-7-v2 | S3 | 6 | late | May | Looking at the bar chart image I already retrieved, the tallest bar is for **May |
| heldout-report-check-7-v2 | S4 | 5 | gist | 28 | 12 |
| heldout-report-check-8-v2 | S0 | 5 | gist | 25 | 10 |
| heldout-report-check-8-v2 | S1 | 4 | cross | no | UNREADABLE |
| heldout-report-check-8-v2 | S1 | 5 | gist | 25 | 1 |
| heldout-report-check-8-v2 | S2 | 5 | gist | 25 | 1 |
| heldout-report-check-8-v2 | S2 | 6 | late | Nov | Sep |
| heldout-report-check-8-v2 | S2 | 8 | late-small | 18:43 | UNREADABLE |
| heldout-report-check-8-v2 | S3 | 5 | gist | 25 | 1 |
| heldout-report-check-8-v2 | S3 | 6 | late | Nov | Looking at the bar chart image I retrieved earlier, the tallest bar is for Septe |
| heldout-report-check-8-v2 | S4 | 5 | gist | 25 | 10 |
| heldout-ui-debugging-1 | S0 | 1 | immediate-small | 2195 | 7.4.35 (build 2196) |
| heldout-ui-debugging-1 | S0 | 6 | late-small | 26.8 GB | 26.9 GB |
| heldout-ui-debugging-1 | S1 | 1 | immediate-small | 2195 | 7.4.35 (build 2196) |
| heldout-ui-debugging-1 | S1 | 5 | gist | sync | UNREADABLE |
| heldout-ui-debugging-1 | S1 | 6 | late-small | 26.8 GB | 26.9 GB |
| heldout-ui-debugging-1 | S1 | 8 | late-small | 19:09 | UNREADABLE |
| heldout-ui-debugging-1 | S2 | 1 | immediate-small | 2195 | Based on the original image, I can see the text at the bottom right corner of th |
| heldout-ui-debugging-1 | S2 | 5 | gist | sync | Let me search for specific subsystem tags with ERROR: |
| heldout-ui-debugging-1 | S3 | 1 | immediate-small | 2195 | Based on the original image, I can see the text at the bottom right corner of th |
| heldout-ui-debugging-1 | S3 | 5 | gist | sync | Let me try a different approach and search for just "ERROR": |
| heldout-ui-debugging-1 | S3 | 8 | late-small | 19:09 | Based on the earlier conversation summary, line 22 had a sync error at 2026-03-2 |
| heldout-ui-debugging-1 | S4 | 1 | immediate-small | 2195 | 2186 |
| heldout-ui-debugging-1 | S4 | 6 | late-small | 26.8 GB | 26.9 GB |
| heldout-ui-debugging-2 | S0 | 1 | immediate-small | 2493 | 2495 |
| heldout-ui-debugging-2 | S0 | 4 | cross | Off | On |
| heldout-ui-debugging-2 | S1 | 1 | immediate-small | 2493 | 2495 |
| heldout-ui-debugging-2 | S1 | 7 | late-log | 373b9f | req=0x2a8f1c |
| heldout-ui-debugging-2 | S1 | 8 | late-small | 10:13 | UNREADABLE |
| heldout-ui-debugging-2 | S2 | 1 | immediate-small | 2493 | Looking at the original image, I can see text at the bottom right corner. From t |
| heldout-ui-debugging-2 | S2 | 5 | gist | sync | Let me search for all instances with different keywords: |
| heldout-ui-debugging-2 | S3 | 1 | immediate-small | 2493 | Looking at the original image, I can see text at the bottom right corner. From t |
| heldout-ui-debugging-2 | S3 | 5 | gist | sync | Let me search for all lines with ERROR to get a complete count: |
| heldout-ui-debugging-2 | S3 | 8 | late-small | 10:13 | Let me search for "last" or look at the end of the log: |
| heldout-ui-debugging-2 | S4 | 1 | immediate-small | 2493 | 2486 |
| heldout-ui-debugging-2 | S4 | 4 | cross | Off | On |
| heldout-ui-debugging-3 | S1 | 8 | late-small | 23:27 | UNREADABLE |
| heldout-ui-debugging-3 | S2 | 5 | gist | sync | Let me search for all instances with different subsystem tags: |
| heldout-ui-debugging-3 | S3 | 5 | gist | sync | Let me try a different search approach to find all ERROR entries: |
| heldout-ui-debugging-3 | S3 | 8 | late-small | 23:27 | 22:34 |
| heldout-ui-debugging-4 | S1 | 7 | late-log | 7d9bfe | UNREADABLE |
| heldout-ui-debugging-4 | S3 | 5 | gist | sync | The search is only returning 3 lines. Let me try a different approach to find al |
| heldout-ui-debugging-4 | S3 | 8 | late-small | 10:40 | Based on the earlier conversation summary, the last sync entry mentioned was the |
| heldout-ui-debugging-4 | S4 | 8 | late-small | 10:40 | 10:45 |
| heldout-ui-debugging-5-v2 | S1 | 8 | late-small | 02:27 | UNREADABLE |
| heldout-ui-debugging-5-v2 | S2 | 5 | gist | sync | Let me try different searches to find all ERROR entries: |
| heldout-ui-debugging-5-v2 | S2 | 8 | late-small | 02:27 | Let me search for the latest sync entry more systematically: |
| heldout-ui-debugging-5-v2 | S3 | 5 | gist | sync | Let me search for all lines with ERROR to get a complete picture: |
| heldout-ui-debugging-5-v2 | S3 | 8 | late-small | 02:27 | Based on the summary provided earlier, the last sync entry mentioned was on line |
| heldout-ui-debugging-6-v2 | S0 | 1 | immediate-small | 9835 | 9435 |
| heldout-ui-debugging-6-v2 | S0 | 8 | late-small | 16:32 | UNREADABLE |
| heldout-ui-debugging-6-v2 | S1 | 1 | immediate-small | 9835 | 9435 |
| heldout-ui-debugging-6-v2 | S1 | 7 | late-log | 7c2619 | UNREADABLE |
| heldout-ui-debugging-6-v2 | S1 | 8 | late-small | 16:32 | UNREADABLE |
| heldout-ui-debugging-6-v2 | S2 | 5 | gist | sync | The query is only returning one result. Let me try a different approach to find  |
| heldout-ui-debugging-6-v2 | S3 | 4 | cross | Off | Based on the overview, I can clearly see "Auto-update" with "Status: Off" in the |
| heldout-ui-debugging-6-v2 | S3 | 5 | gist | sync | Let me try a different approach and search for all lines with brackets to see th |
| heldout-ui-debugging-6-v2 | S3 | 8 | late-small | 16:32 | Based on the log, the last sync entry shows a timestamp of 2026-03-20T15:22:27Z. |
| heldout-ui-debugging-6-v2 | S4 | 1 | immediate-small | 9835 | 9435 |
| heldout-ui-debugging-6-v2 | S4 | 8 | late-small | 16:32 | UNREADABLE |
| heldout-ui-debugging-7-v2 | S0 | 4 | cross | Off | On |
| heldout-ui-debugging-7-v2 | S1 | 8 | late-small | 11:44 | UNREADABLE |
| heldout-ui-debugging-7-v2 | S2 | 5 | gist | sync | Let me try a different approach to find all ERROR lines: |
| heldout-ui-debugging-7-v2 | S3 | 5 | gist | sync | Let me search for all lines with brackets to find subsystem tags: |
| heldout-ui-debugging-7-v2 | S3 | 8 | late-small | 11:44 | Based on the summary provided, the last sync entry mentioned was: - 2026-03-20T0 |
| heldout-ui-debugging-7-v2 | S4 | 4 | cross | Off | On |
| heldout-ui-debugging-8-v2 | S0 | 8 | late-small | 03:58 | UNREADABLE |
| heldout-ui-debugging-8-v2 | S1 | 7 | late-log | c182d6 | 6a7f9c2e |
| heldout-ui-debugging-8-v2 | S1 | 8 | late-small | 03:58 | UNREADABLE |
| heldout-ui-debugging-8-v2 | S2 | 1 | immediate-small | 6609 | 6009 |
| heldout-ui-debugging-8-v2 | S3 | 1 | immediate-small | 6609 | 6009 |
| heldout-ui-debugging-8-v2 | S3 | 5 | gist | sync | Let me try a different approach and search for just "ERROR" with different conte |
| heldout-ui-debugging-8-v2 | S4 | 8 | late-small | 03:58 | UNREADABLE |

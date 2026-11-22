# Gold set: labelling methodology

`gold.csv` (`url,module,label`) holds 120 rows, 40 per module. Label `1` = the module should flag the document, `0` = it should not. Full rules per module are in `rubric.md`.

## How labels were made
- A human assigned and approved every label. For the demo fixtures, one borderline M2 page and the extra synthetic rows the agent proposed a label first; the human reviewed and approved each of them (see the notes column of `label_sheet.csv`).
- The labelling rules come from the UKNF resource materials: Commission Delegated Regulation 2017/565 art. 44 (M2) and art. 76 of the Act on Trading in Financial Instruments (M3). The M1 rule uses the KNF register in `ai/seed/entities.csv`.
- Rows are keyed by URL. `/eval` joins them to `documents.url_hash`, so labels survive a database re-seed.

## Per module
- **M1:** `1` when a registered firm or its product is mentioned by a publisher outside that firm's `official_domains` / `social_handles`. `0` for the firm's own material or no registered firm.
- **M2:** `1` when the firm's own material breaks at least one of the 18 risk-information rules. `0` when it is compliant.
- **M3:** `1` when an unregistered publisher recommends buying, selling or holding a financial instrument. `0` for education, news, or a registered publisher.

## Metrics
`/eval?module=&threshold=` reads the highest stored finding score per document and compares it with the gold labels: flagged means `score >= threshold`. It returns TP, FP, FN, TN, precision and recall without calling the LLM, so the slider reacts immediately. A gold document with no finding counts as score 0 (not flagged) and is reported as `missing_findings`.
`calibration_table.py` runs the same code for thresholds 0.3 to 0.9 and writes a Markdown table for the slide.

## Limits to state in the presentation
- 40 rows per module is a small sample: single rows move precision and recall noticeably.
- M2 positives are mostly synthetic (`synthetic_m2.jsonl`), because real firm pages are almost always compliant. Some live pages geo-block or serve English text.
- Live page content changes, so the collector's copy can differ from what was labelled.
- Text-only M2 rules were labelled; layout rules (4, 5, 7, 8, 13) need rendered HTML or a screenshot.

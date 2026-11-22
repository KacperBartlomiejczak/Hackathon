# Gold set labelling rubric

Source: UKNF challenge attachments (HackNation 2026). Labels in `gold.csv` are assigned by a human, not by an agent.
Label `1` = document should be flagged by the module, `0` = should not.

## M1 — third-party promotion (finfluencers)
Label 1 when the text mentions a firm or product from the KNF register (`ai/seed/entities.csv`) and the publisher is not that firm (domain or handle outside `official_domains` / `social_handles`).
Label 0 when the publisher is the firm itself or no registered firm is mentioned.
Register scope (attachments 1 and 2): investment firms = brokerage houses, banks doing brokerage, foreign investment firms operating in Poland (branches and cross-border without branch).

## M2 — risk information in materials published by the firm
Label 1 when the firm's own material breaks at least one rule below. Rule text and legal basis come from the UKNF resource "kryteria oceny informacji o ryzyku" (Commission Delegated Regulation 2017/565, art. 44; MiFID II art. 24).

| id | Rule | Operational description | Legal basis |
|---|---|---|---|
| 1 | Firm identification | Material contains the official name of the investment firm. | art. 44(2)(a) |
| 2 | Advertising label | Promotional material is clearly marked as such. | MiFID II art. 24(3) |
| 3 | Risk information | Profit claims are directly accompanied by material risk information. | art. 44(2)(b) |
| 4 | Risk font size | Risk text size vs. predominant font size of the material. | art. 44(2)(c) |
| 5 | Risk exposure and contrast | Placement, contrast, overlap by other elements, legibility. | art. 44(2)(c),(e) |
| 6 | Hiding risk | Risk buried in footnotes, a "Legal" section or low-visibility places. | art. 44(2)(e) |
| 7 | One-click access | Risk information does not require expanding, clicking a link or another layer. | art. 44(2)(b),(e) |
| 8 | Responsiveness | Text not cut off or scaled below readability on desktop, tablet, phone. | art. 44(2)(g) |
| 9 | Comprehensibility | Risk warning in language understandable to the target group. | art. 44(2)(d) |
| 10 | Language consistency | Risk information is not in a different language than the main message. | art. 44(2)(f) |
| 11 | Product comparisons | Comparisons of products or services: source, assumptions; flag violations. | art. 44(3) |
| 12a | Historical results: period | Last 5 years, full 12-month periods, reference period and source stated. | art. 44(4) |
| 12b | Historical results: conditions | Currency-rate warning; impact of fees, commissions and charges stated. | art. 44(4) |
| 13 | Historical results dominance | Historical results are not the most prominent element. | art. 44(4)(a) |
| 14 | Historical results warning | Explicit statement that past results are not a reliable indicator of future results. | art. 44(4)(d) |
| 15 | Forecasts | Forecast detected and accompanied by a warning that it is not a reliable indicator; flag every forecast. | art. 44(6) |
| 16 | Tax information | Tax treatment mention comes with a note that it depends on the client's situation and may change. | art. 44(7) |
| 17 | No supervisor approval | References to KNF / other authority must not suggest approval of the product or service. | art. 44(8) |
| 18 | Supervision as safety argument | Special case of 17: "we are fully safe, KNF requirements" style claims. | art. 44(8) |

Text-only rules (feasible without HTML/screenshot): 1, 2, 3, 6, 9, 10, 11, 12a, 12b, 14, 15, 16, 17, 18.
Layout rules (4, 5, 7, 8, 13) need rendered HTML or a screenshot.

## M3 — shadow advisory
Label 1 when a publisher outside the KNF register gives a recommendation to buy, sell or hold a financial instrument (investment advice).
Definition (art. 76 of the Act on Trading in Financial Instruments): preparing and passing to a client, on the firm's initiative or on the client's request, a recommendation based on the client's needs and situation, concerning acquiring or disposing of one or more financial instruments, or refraining from such action. In short: recommendations to buy, sell or hold financial instruments.
Financial instruments (art. 2 and 3 of the Act): securities (shares, subscription rights, depositary receipts, bonds, mortgage bonds, investment certificates, other transferable securities); units in collective investment undertakings; money market instruments; derivatives (options, futures, swaps, forwards, CFDs, credit-risk transfer, emission allowances).
Label 0 for general education or news with no recommendation, or when the publisher is a registered firm.

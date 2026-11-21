# Master prompt: make CivicOps Mumbai + WardProof win the hackathon

Role: you are the project manager, product designer, data-visualisation lead and full-stack engineer for the final push. The functionality is done and tested (47 unit/integration tests, 11 browser tests, deployed on Vercel with Neon Postgres). What is missing is **impact**: a judge must understand the product in 10 seconds and remember it after the demo. Ship visuals that make the data obvious, with no loss of accuracy or fairness.

Live URLs: production https://civicops-mumbai.vercel.app · code https://github.com/Mehulkarotra098/civicops-mumbai

## 1. What testing the live site showed (21 Nov 2026, 14:20 IST)

| Page | Works | Why it does not wow yet |
|---|---|---|
| Home `/` | Loads, links work | Plain navy box and a list of categories. No numbers, no map, no motion, no story. It does not say "we found ₹3.6 Cr of questions in ₹13.4 Cr of repairs". |
| Where did the money go? `/spending` | Correct totals, search, CSV | A 24-row table. Nobody can see at a glance which wards overspent or where questioned money sits. |
| Work order `/spending/wo/WO25-01590` | Exact figures, sources, ask form | Strong content but all text; the 1.91× overbilling should be a picture. |
| Wards `/wards` | 24 wards, search | Grey SVG polygons without a real city underneath; it does not look like Mumbai. |
| Ticket and admin screens | Full workflow | Functional but flat; no city-wide live view for the "command centre" moment. |
| Missing entirely | | **A live dashboard**: a map of Mumbai with tickets and ward risk, counters that move, and a live activity feed. |

## 2. Judging rubric → what the screen must show

| Criterion (weight) | The judge should see, without scrolling |
|---|---|
| Audit accuracy (25%) | A chart where 113 over-rate bills stand clearly apart from the normal band (≤1.3×), with "normal variation is never flagged" stated next to it |
| Fair accountability (20%) | Rain-adjusted speed and method-adjusted durability beside every contractor score; "a question, not a finding" on every flag |
| Budget smarts (20%) | The next-rupee plan for a ward as a ranked visual (risk bars + recommended lasting method + ₹ allocated) |
| Connects the trail (15%) | One animated chain: complaint (Hinglish) → issue → work order → bill vs rate card → reopened → case → decision |
| Usable + demo (20%) | A live map that updates when the demo ticket is filed; the resident's green 100% |

## 3. Build list (priority order; each item is independently shippable)

1. **Live dashboard `/live`** (public, projector-friendly, dark):
   - Real Mumbai basemap via **Leaflet + OpenStreetMap/CARTO tiles** (open, no API key), loaded from CDN.
   - Ward polygons as a choropleth, switchable between budget used, flags and open tickets.
   - Pulsing markers for critical or overdue tickets.
   - 8 count-up KPIs: open, critical, overdue, escalated, verified today, average first action, ₹ questioned, cases overdue.
   - A live activity feed that slides new events in, polling every 10 s.
   - Budget-vs-billed bars, a deadline-health donut, and reports by category.
   - A ward click shows a detail card linking to the public ward page.
2. **Landing page rebuild**:
   - An animated gradient hero with the line "Every complaint has an owner. Every rupee has a reason."
   - Count-up stats from the database.
   - Three big doors: Report, Where did the money go?, Live dashboard.
   - A 4-step "how it works" flow.
   - A Link Road teaser with ₹23,311 vs ₹12,220 drawn as bars.
3. **Spending visuals**:
   - Animated budget-vs-billed bars for all 24 wards, red when over 100%.
   - A breakdown of where the questioned money sits, linked to each flag list.
4. **Work order page**: a bar comparison (billed vs rate card vs 1.3× band) and a horizontal trail timeline (complaint → assigned → completed → reopened → case).
5. **Real map everywhere**: reuse the Leaflet map in `/wards`, the ward detail page, and the report wizard's pin drop, keeping the SVG as the offline fallback.
6. **Motion system**: fade-up on load, count-ups, bar growth, pulsing live dots. Respect `prefers-reduced-motion`, and never animate numbers people must read precisely before they settle.
7. **Next-rupee visual**: ranked cards per ward with risk-factor chips and ₹ allocation bars.

## 4. Design rules (keep the current system)

- Navy navigation, neutral surfaces, one teal action colour. Priority colours always come with an icon and text.
- Every visual is a link to the records behind it; every number shows its source on hover or in a caption.
- Label synthetic data, synthetic boundaries, illustration photos and demo examples wherever they appear.
- Mobile at 390 px and projector at 1440 px must both look intentional.
- No new heavy dependencies: Leaflet from CDN, charts in plain SVG.

## 5. Demo script with the new visuals (3 minutes)

1. **0:00** Open `/live` on the projector: "This is Mumbai right now." The map, the pulsing critical tickets and the counters are on screen.
2. **0:20** On a phone, the resident reports waterlogging in Juhu. Within 10 s the K/W marker pulses red on `/live` and "Report submitted · Routed to K/W" slides into the feed.
3. **0:50** The officer acts and uploads the after photo; the feed shows "First action", then "Completion evidence".
4. **1:20** The super admin compares the photos and approves; the feed shows "Closure verified" and "Verified today" ticks up.
5. **1:40** Click Ward K/W on the map, then "Where did the money go?": the budget bars, then Link Road WO25-01590 (₹23,311 vs ₹12,220, 1.91×, reopened).
6. **2:20** Ask about this expense; the oversight deadline passes; the case turns "Response overdue" in public; the office responds; the auditor orders a correction to ₹15,886.
7. **2:50** Close: "Every complaint has an owner. Every rupee has a reason."

## 6. Definition of done

Lint, typecheck, unit/integration tests and browser tests pass. `/live`, `/`, `/spending` and `/wards` are checked by eye at 390 px and 1440 px. The change is deployed to Vercel production and checked on the real URL. Nothing is described as working that was not run.

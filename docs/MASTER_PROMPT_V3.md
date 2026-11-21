# WardProof Mumbai | Redesign, fix, test and ship (v3)

Act as lead product designer, frontend engineer, GIS engineer, project manager and QA lead. Decide and implement; do not stop to ask unless a step needs a secret you do not have. Reuse the existing Next.js 15 app, APIs, Postgres schema, row-level security, auth, importer and tests. Start from the latest `main`.

- Repo: https://github.com/Mehulkarotra098/civicops-mumbai (public, so never commit secrets)
- Production: https://civicops-mumbai.vercel.app (real admin only; demo passwords are refused by design)
- Preview: create a new preview deployment; demo accounts work there (`DEMO_MODE=1`, `ALLOW_CLOCK_OVERRIDE=1`)

## 0. Ground rules

1. **Timebox and cut line.** Ship in this order and deploy after each block: P0 → map → four priority screens → charts → P2. If time runs out, stop at a finished block. Never stop halfway through a block.
2. **Protect what is judged.** The rubric:
   - Audit accuracy: 25%
   - Fair accountability: 20%
   - Budget smarts: 20%
   - Connects the trail: 15%
   - Usable + demo: 20%

   65% of the score is about the **numbers being right and fair**. No redesign may change a flag, a total or a routing result. Run `npm test` after every block. The 47 unit/integration tests must stay green.
3. **Build on what shipped on 21 Nov.** These already exist and should be redesigned, not rebuilt from scratch:
   - `/live` dashboard (Leaflet + CARTO map, KPIs, live feed)
   - Landing hero and count-ups
   - `/spending` budget bars and questioned-money tiles
   - The work-order "At a glance" panel
   - Next-rupee risk bars
   - The public case tracker `/spending/case/[ref]`
4. **One map component.** Replace `src/components/LiveMap.tsx` with a MapLibre version that keeps the same props, so `/live`, `/wards` and the report wizard all switch at once. Keep the existing SVG `WardMap` as the offline fallback.
5. **No secrets in code or output.** Secrets live in Vercel env and gitignored `.data/*.txt` files.

## P0 — verified defects (fix first, each with a test)

| # | Defect (reproduced) | Done when |
|---|---|---|
| 1 | At 390 px the header nav is a horizontal scroll strip (`layout.tsx` `overflow-x-auto`) | Residents see Report, My tickets and Wards without scrolling. Staff get a desktop sidebar and an accessible mobile menu (focus trap, Esc closes, `aria-current` on the current page). |
| 2 | Sign-in drops the resident's intent (no return path in `LoginForm`) | `/login?next=/report?category=waterlogging` lands in the report flow with the category chosen. `next` accepts only same-origin relative paths starting with `/` and not `//`; anything else falls back to the role's home. Covered by a unit test of the validator. |
| 3 | "Verified resolved" KPI opens a board that hides verified tickets | Every KPI links to a URL filter that returns exactly the rows it counts. An E2E test compares the KPI number with the row count for verified, reopened, overdue and awaiting verification. |
| 4 | Public spending mixes periods and double-counts flags | Covered by the four rules below. |
| 5 | Same figure differs between pages (production, 21 Nov 14:50 IST): billed ₹13.23 Cr on `/`, ₹13.35 Cr on `/live`, ₹13.43 Cr on `/spending`; work orders 2,461 vs 2,499; cases 702 vs 713; questioned ₹3.55 Cr vs ₹3.60 Cr | One shared function per figure (e.g. `src/lib/figures.ts`) used by `/`, `/live`, `/spending`, the CSV and the README. Each figure states its period. A unit test asserts that all pages read the same value. |
| 6 | The CARTO basemap now needs an API key and shows "API KEY REQUIRED" watermarks (temporarily swapped to OSM tiles) | Fixed for good by the MapLibre + OpenFreeMap switch below; no tile provider that needs a key. |
| 7 | `/live` KPI "₹3.60 Cr" wraps onto two lines in its tile | No tile value wraps at 1440, 768 or 390 px. |
| 8 | README and demo docs do not name the Vercel URL | The Vercel URL is the first link in the README and demo script. GitHub Pages is labelled "static snapshot, read-only". |

Rules for defect 4:

- Every headline, chart, drill-down and CSV states its period (budget 1 Jun – 30 Sep 2025; work orders Jun – Oct 2025) and source file. Out-of-period work orders are counted separately and labelled.
- Approved, committed, billed and paid stay in separate columns. Paid shows "Not published in the dataset", never ₹0.
- The questioned amount is **deduplicated per work order**: the largest single flag amount per work order, not the sum of overlapping flags. A visible note explains this, and the raw per-flag sums stay available in the table. The `/live` "Amount questioned" and the landing stat use the same function.
- A unit test pins the deduplicated total.

## P1 — design system

- Fonts via `next/font` (self-hosted, so nothing is fetched at runtime): **Inter** for Latin and **Noto Sans Devanagari** for Marathi/Hindi, with `font-variant-numeric: tabular-nums` on every ₹ amount, deadline and count.
- Tokens in `globals.css` `@theme`: ink navy `#0b1324`, warm white `#faf8f4`, teal action `#0f766e`, plus status tokens. Statuses always come with an icon and text, never colour alone. Also define tokens for type scale, spacing, radius, border and elevation.
- Visuals: original SVG illustration of Mumbai (sea link, local train, monsoon rain; no third-party photos to license), exported as optimised WebP/SVG. Category icons share one 24 px, 1.75-stroke set.
- Demo imagery is labelled "Illustration". The evidence viewer shows only recorded uploads or evidence labelled "Demo evidence".

### The four priority screens

1. **Public home.** One-line benefit headline. Primary button "Report an issue"; secondary "Explore public spending". The Mumbai illustration. Clickable category chips that carry `?category=` through sign-in (P0-2). A compact 4-step flow. A link to `/live`.
2. **Ward Explorer (`/wards`).** A MapLibre map, a searchable ward list and a detail panel (see Map).
3. **Ticket detail and evidence review.**
   - Above the fold: status, ward, department, next action, deadline with countdown.
   - An IST milestone stepper that keeps first action, work completed and verified closure visibly distinct, and shows rework/reopen history.
   - Review screen: labelled before/after panels, a keyboard-operable comparison slider (arrow keys), and upload timestamps. Claude's observations and uncertainty sit beside the manual checklist.
   - Approve, request evidence and return for rework each produce a visible toast and a timeline entry.
4. **Public spending.**
   - The path Approved budget → Work order → Bill → Evidence → Review.
   - A questioned expense shows amount, reason, responsible office, response deadline and decision first.
   - On mobile, one card per ward, with the full table behind a toggle.

The rest (report flow, officer workspace, oversight) adopts the tokens:

- **Officer workspace:** leads with Due soon / Overdue / Unassigned; filters in a drawer on mobile.
- **Report flow:**
  - A sticky mobile action bar and the current step.
  - The chosen ward, team and urgency.
  - Photo previews, upload progress, and retry for a failed upload.
  - The existing photo-free path.

## P1 — Mumbai Ward Explorer (MapLibre + OpenFreeMap)

- MapLibre GL JS from a pinned CDN version (`maplibre-gl@4.7.1`), loaded on demand, with fixed-height reserved space while loading. Style URL: `NEXT_PUBLIC_MAP_STYLE`, defaulting to `https://tiles.openfreemap.org/styles/liberty`. Attribution to OpenFreeMap, OpenMapTiles and OpenStreetMap stays visible.
- The 24 ward polygons from the dataset, captioned "Approximate demo boundaries". Basemap, ward geometry and server routing stay separate: routing never reads the map.
- **Selection:**
  - Map click and list selection (keyboard: arrow keys + Enter) highlight the same ward.
  - Selecting fits the ward's bounds and opens a summary: localities, budget/billed/flags, links to the ward page and to spending.
  - The URL updates: `/wards?ward=K%2FW&layer=flood`.
- **Layers, with a legend that has text labels:**
  - Service issues: clustered; public sees aggregate counts only.
  - Historical flood hotspots: from `hist_complaints` + `rainfall`.
  - Road segments: from `roads.csv`, coloured by reopen rate.
  - Ward spending choropleth.
  - Staff-only ticket points pass through the existing RLS (a ward officer sees only their ward).
- **Report flow:** GPS on request, a draggable pin with Confirm, and locality search via the existing API. On mobile, a bottom sheet for the selected place.
- **Failure:** if tiles fail (`map.on('error')` or no `load` within 8 s), show the SVG fallback with the message "Map unavailable, use locality search". A GPS denial falls back to search. Neither may block a report.
- **Routing must still pass:**
  - Juhu → K/W
  - Andheri East → K/E
  - Bare "Andheri" → confirm
  - GPS accuracy above the existing threshold → confirm
  - Pin–locality conflict → confirm
  - Outside Mumbai → triage

  Write these as E2E assertions.

## P1 — charts and motion (real queries only)

- **Charts:** each states its period, unit, n and source, has a legend, and has a linked data table (`<details>` or toggle) for keyboard and screen-reader users.
  - Budget vs billed per ward, same period.
  - Tickets by date × status, stacked.
  - Unresolved accountability cases, ranked by office and age.
- **Motion:** short CSS transitions for the drawer, map fly-to (≤600 ms), step changes, upload progress and the verified state.
  - `prefers-reduced-motion`: no fly-to (jump instead), no count-ups (final values at once), no pulses.
  - No animation may delay a button.
- **States:** loading skeletons, empty, offline and error for map, charts and lists.
- **Languages:** check English, Marathi and Hindi at 360 px with the longest labels; nothing may clip or overflow.

## P2 — only after everything above passes

1. Filters saved in the URL on wards, spending and accountability, so views can be shared.
2. A recurring-issues view: the same road or locality with repeated flooding, missed pickups or reopened repairs, each linked to its records (reuse `trail.ts` clustering).
3. A polish pass on the existing public question tracker: submitted → response due → escalated → response → independent decision → correction.
4. A seeded judge walkthrough (waterlogging ticket in Juhu + WO25-01590), labelled "Demo data", resettable from the super-admin console.

## QA and release gate

**Before screenshots.** Capture them first, from the current production at 360, 390, 768 and 1440 px:

- `/`
- `/wards`
- `/live`
- `/spending`
- `/spending/wo/WO25-01590`
- one ticket detail
- the review screen

Save them to `docs/qa/before/`. After screenshots go to `docs/qa/after/` with the same names.

**Checks.** Run `npm run lint`, `npx tsc --noEmit`, `npm test`, `next build`, and Playwright with the local headless shell. Also check by hand:

- keyboard-only path through the report flow and the review
- visible focus
- reduced motion (emulated)
- contrast of at least 4.5:1 for text
- no horizontal overflow at 360 px
- tiles blocked (route `tiles.openfreemap.org` to abort)
- slow upload (throttled to 3G)

**Scenarios.** Run them on a fresh preview with its own Neon database: bootstrap through `/api/admin/bootstrap` with `CRON_SECRET`. Move time only with `/api/cron/sla?now=` on the preview.

1. **Waterlogging.** A resident reports waterlogging in Juhu with a photo. The officer records first action and restored access, uploads an after photo and submits. The reviewer approves. After a reload, the resident sees green, 100% and the full IST timeline.
2. **Map and GPS failure.** With tiles blocked and GPS denied, the report is completed through locality search. Bare "Andheri" asks for confirmation. A fallen tree hands off to the supporting team.
3. **KPI counts.** Verified resolved, Reopened and Overdue each match their rows in the KPI, the board, the table and the map.
4. **WO25-01590.**
   - Find it by ID. The figures are ₹23,311 billed, ₹12,220 reference and ₹11,091 variance.
   - Submit a question. Advance the clock so it escalates once.
   - The office responds. The auditor publishes the decision.
   - Paid shows its source ("not published").
5. **Roles and privacy.**
   - Roles stay separate.
   - Private photos return 403 to other users.
   - A failed upload retries.
   - Manual review works with no Claude key. The Claude path is **Blocked** unless `ANTHROPIC_API_KEY` is set; record it as Blocked, never Passed.
   - Data persists after a reload.

**Release.** Fix failures, rerun the affected tests, then `vercel deploy --prod` and repeat scenarios 3–4 read-only on production with the real admin.

**Deliverables, as files in `docs/`, not hosted documents:**

- preview and production URLs and the commit SHA
- before/after screenshot pairs
- a Passed / Failed / Blocked matrix with evidence for each row
- the 3-minute demo script, opening on `/live`
- a judge Q&A covering ward routing, repair evidence, public spending, and what happens after an expense is questioned

# CivicOps Mumbai + WardProof: design system (hackathon final)

**Concept line:** *Every complaint has an owner. Every rupee has a reason.*
**Signature graphic: the trail line.** A thin teal line with dots that connects each step of a story:

- **Tickets:** complaint → ward → crew → proof → verified
- **Money:** budget → work order → bill → evidence → review

Use it wherever a process or history is shown: stepper, timeline, money path. It is the one visual that makes this product recognisable.

## Laws (from the U Scale landing-page method)
1. **Visual first, not raw data.** Every number gets a picture: bar, ring, sparkline, map, chip, progress or icon. A plain table is never the first thing on a page. Tables stay available behind a "Show records table" `<details>` toggle, or on desktop below the visual, for accuracy and accessibility.
2. **Every section = surface + subject + content.** A tinted or dark surface, one focal visual, then the words. No text-only sections on flat white.
3. **One focal subject per screen.** Lead with the single most important thing:
   - Ticket: status and deadline.
   - Ward: budget used.
   - Case: amount, reason, deadline.
4. **Phone first:** design at 390×620 visible and 360×560, then check 1440×626 (the founder's laptop). Never let anything overflow sideways at 320–2560 px. Tap targets are at least 44 px.
5. **Motion that helps:** short, CSS first (≤300 ms UI, ≤600 ms map fly-to). Respect `prefers-reduced-motion`: values show at once, no pulses.
6. **Honest labels:**
   - "Synthetic dataset" and "Approximate demo boundaries" appear on every map.
   - "Demo example" marks seeded outcomes.
   - Paid stays "Not published", never ₹0.

## Tokens (src/app/globals.css `@theme`)
- **Ink navy:** `navy-950 #0b1324`, `navy-900 #0f1b33`, `navy-800 #17264a`.
- **Warm white surface:** `#f7f6f2`. Cards are white, with `--radius-card` 16px, `--shadow-1` and `--shadow-2`.
- **Action teal:** `#0f766e` (`bg-action`, `text-action`, `action-soft`). Teal is the only action colour.
- **Statuses:** always icon + text + colour.

  | Status | Text | Soft fill |
  |---|---|---|
  | Critical | `#b42318` | `crit-soft` |
  | Medium | `#8a6100` | `med-soft` |
  | Standard | `#b54708` | `std-soft` |
  | Done | `#067647` | `ok-soft` |
- **Accent for money questions:** amber `#d97706`, used sparingly.
- **Type:** Inter for Latin and Noto Sans Devanagari for Marathi and Hindi, loaded in the layout.
  - Headings `font-extrabold tracking-tight`.
  - Every ₹ amount, count, deadline and time uses `tnum` (tabular numerals).
- **Existing utilities:** `card`, `btn-primary`, `btn-secondary`, `btn-sm`, `chip`, `kicker`, `h1`, `h2`, `input`, `label`, `table`, `tnum`.
- **Existing components** (reuse them, don't duplicate):
  - `src/components/ui.tsx`: `Kpi`, `PageHeader`, `StatusBadge`, `PriorityBadge`, `Empty`, `SyntheticNote`, `CategoryIcon`.
  - `src/components/Visuals.tsx`: `CountUp`, `AnimatedBar`, `SegmentBar`, `formatInr`.
  - `src/components/icons.tsx`: `Icon` (24 px, 2 stroke).
  - `src/components/client.tsx`: `DeadlineClock`.
  - `src/components/AutoRefresh.tsx`.

## Maps
**MapLibre GL JS 4.7.1** from `https://unpkg.com/maplibre-gl@4.7.1/dist/` with OpenFreeMap vector tiles. The style comes from `NEXT_PUBLIC_MAP_STYLE` and defaults to `https://tiles.openfreemap.org/styles/liberty`. No API key is needed.

- **Attribution:** OpenFreeMap © OpenMapTiles, data © OpenStreetMap contributors, always visible.
- **Fallback:** if the map does not load within 8 s, show the SVG `WardMap`.
- **Separation:** routing is done on the server and never reads the map.

## Data sources
- **One source for headline money figures:** `src/lib/figures.ts` (`publicFigures`, `questionedByWorkOrder`). Never sum money in a page.
- **History:** `src/lib/history.ts` (`loadHistory`, `moneyTrail`, `scorecards`, `nextRupee`).
- **Trail:** `src/lib/trail.ts`.
- **Spending:** `src/lib/spending.ts`.

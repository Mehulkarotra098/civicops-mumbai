# CivicOps Mumbai: timeboxed task board

**Demo in one sentence:** a resident reports waterlogging in Juhu, CivicOps routes it to Ward K/W's storm-water team and starts the priority clock, the officer posts progress and proof, the super admin approves after a Claude-assisted (or manual) evidence check, and the resident sees green at 100%. Then the historical Link Road job `WO25-01590` is traced from complaint to bill to rate card to reopening.

Start: Sat 21 Nov 2026, 11:00 IST. Target: demo-ready by 17:00 IST. The last 40 minutes are kept for rehearsal and packaging.

## Constraints found at inspection (11:00)

| Constraint | Effect | Decision |
|---|---|---|
| Venue network is about 13–40 KB/s | A 420 MB Postgres + PostGIS download would take hours, and so would heavy npm trees | Use packages already in the npm cache: Next.js 15.5.29, PGlite 0.2.17, `pg`, `sharp`, Playwright 1.65.1. Download only small packages (Tailwind, Anthropic SDK) |
| No Docker and no Postgres binaries on the machine | No local PostGIS | **PGlite** (real Postgres compiled to WASM, persisted to `.data/pgdata`) runs locally. The same SQL migrations run on hosted Postgres via `DATABASE_URL`. An optional PostGIS migration is provided for hosted use; it is not verified here |
| Ward polygons are a synthetic Voronoi approximation | A street basemap would suggest false precision, and map tiles would not load on this network | An offline SVG ward map drawn from `wards.geojson` and `roads.geojson`, labelled as synthetic |
| No `ANTHROPIC_API_KEY` set (to be confirmed) | Claude Vision cannot run live | The server-side integration is built. Without a key the review panel says "Claude unavailable" and manual review is used. Tests use a stub provider that is clearly marked as a stub |
| No Vitest download | — | Use Node's built-in test runner (`node --test`, type stripping) and the Playwright library for browser checks |

## Board

| # | Time (IST) | Owner role | Task | Acceptance criteria | Fallback if blocked |
|---|---|---|---|---|---|
| 1 | 11:00–11:20 | PM, data analyst | Inspect the dataset, profile all 17 files, verify the Link Road example | WO25-01590: bill ₹23,311; 4.7 m² × ₹2,600 = ₹12,220; 72 h SLA missed; reopened within 30 days; complaint BMC25-004138 (Juhu) | — (done) |
| 2 | 11:20–11:40 | Architect | Scaffold, environment decisions, task board | `npm install` succeeds from cache; this board exists | Plain CSS if Tailwind cannot download |
| 3 | 11:40–12:40 | Architect, data/GIS analyst | Schema migrations, repeatable importer for all 17 files, validation report | 24 wards; all row counts recorded with the commit SHA; complaint-to-work-order links imported and orphans flagged; Link Road found by ID | Import a subset only if a file is unparseable, and report it |
| 4 | 12:40–13:50 | Full-stack, product designer | Auth (3 roles), resident report form (category questions, GPS/pin/locality/address), routing suggestion, triage, uploads, SLA policy v1 | A Juhu waterlogging ticket persists, shows K/W and the storm-water team, and appears in the K/W officer queue with its due time | Manual locality selection if GPS is denied |
| 5 | 13:50–14:50 | Full-stack, AI engineer | Officer actions (assign, acknowledge, first action, progress, transfer, evidence, submit), super-admin review (Claude Vision + manual), notifications, SLA scheduler | One ticket goes through all three roles and reaches green at 100%; scheduler retries do not duplicate notifications | Manual review path when Claude is unavailable |
| 6 | 14:50–15:30 | Data analyst, UI designer | Historical accountability: ward money trail, audit flags, contractor scorecards, next-rupee ranking, Link Road trace; ward dashboards with drill-downs | Link Road values match the repo; every KPI opens its source records | Keep tables if charts take too long |
| 7 | 15:30–16:20 | QA lead | Unit tests (routing, SLA, cost maths, permissions, scheduler dedupe), Playwright run with three role sessions, lint, typecheck, build | All checks run; failures fixed or reported | Record results as Untested with the reason |
| 8 | 16:20–17:00 | Pitch lead | README, ER diagrams, coverage matrix, judge Q&A, 3-minute demo script, backup completed ticket | A teammate can run the demo from the README | — |

## Screen map

| Role | Home (first action) | Other screens |
|---|---|---|
| Resident | **Report an issue**, **My tickets** | Report wizard (category → details → location → photos → review), ticket detail (status, owner, next action, due, progress, evidence, timeline, reply to an info request, request reopening), notifications |
| Ward officer | **My ward queue**: Due soon, Overdue, Unassigned | Board view and table view with filters, ticket workspace (assign, acknowledge, first action, progress, transfer, evidence upload, submit for review), ward map |
| Super admin | **Escalations**, **Awaiting verification**, **Ward performance** | Evidence review (side by side, zoom, Claude assessment, decision), triage queue, routing rules, SLA policies (versioned), audit log, social signals, city/ward dashboards, historical accountability (money trail, audit flags, scorecards, next rupee, Link Road trace) |
| Public | Landing page, ward directory, ward pages | — |

## Edge cases judges are likely to try

Ambiguous "Andheri" (asks K/E or K/W, else triage) · GPS denied (locality search or typed address) · pin outside all wards (triage) · address and pin in different wards (triage with both shown) · duplicate nearby report (suggest follow; staff confirm the link) · wrong department (transfer keeps ID, evidence and SLA clock) · upload failure (retry; the draft survives) · missed deadline (escalation notification plus history entry) · mismatched evidence (return for rework; the old decision stays) · reopening · two admins editing (version check) · direct URL to another person's ticket or evidence (403).

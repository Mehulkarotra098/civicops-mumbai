# Coverage matrix

Checks run on 21 Nov 2026 (IST) on Windows 11, Node 22.22, Next.js 15.5.29 production build, PGlite 0.2.17.

| Check | Command | Result |
|---|---|---|
| Lint | `npm run lint` (ESLint 10, typescript-eslint, react-hooks) | Passed: 0 problems |
| Types | `npm run typecheck` | Passed: 0 errors |
| Unit + integration | `npm test`: 38 tests on a freshly imported test database | Passed: 38/38 |
| Production build | `npm run build` | Passed: 43 routes |
| Browser (Playwright, headless Chromium) | `npm run test:e2e` against `npm start`: separate resident, officer and super-admin sessions, real uploads, phone (390 px) and desktop viewports | Passed: 9/9. Screenshots and video in `docs/qa/` |
| Scheduler over HTTP | `POST /api/cron/sla?now=2026-12-15T00:00:00Z` twice with `Bearer` secret; once without | Run 1 fired 7 breaches, run 2 fired 0, no secret → 403 |
| Import guard | `npm run db:import` while the server holds the database | Refused with a clear message |

Test IDs below: **H** = `tests/unit/history.test.ts`, **R** = `routing.test.ts`, **S** = `sla.test.ts`, **W** = `workflow.test.ts`, **E** = `tests/e2e/demo-flow.test.ts`. **Smoke** = the page returned 200 for the right role and redirected the wrong role, checked with curl.

## 1. Dataset

| Requirement | Implemented in | Verification | Result |
|---|---|---|---|
| Use all 17 files; record commit SHA, row counts, validation errors, unmatched references | `scripts/import.ts`, `import_runs`, `import_issues`, `docs/IMPORT_REPORT.md`, Admin → Data quality | H "All 17 source files imported…" (counts and 40-char SHA) | Passed |
| Repeatable import, organiser repo read-only | Idempotent upserts; `--reset` for a clean run; the repo is only read | Import run 6+ times today; H tests run on a fresh import each time | Passed |
| Preserve source IDs, original descriptions, statuses, timestamps (IST → UTC) | `hist_*` tables | H Link Road (IDs, values); UI trace shows original Hinglish text | Passed |
| `complaints_sample_200` deduplicated against the full set | Compared field by field; flagged `in_sample_200` | H (200 sample rows flagged); report: 200 identical | Passed |
| Complaint → work-order links imported; missing or inconsistent records flagged | `hist_work_order_complaints.link_status`; `import_issues` | H "links complete…" (0 missing, 45 unlinked jobs, 1 SLA inconsistency) | Passed |
| Synthetic labelling everywhere (records, boundaries, illustrations, live tickets) | Banner on every page, `SyntheticNote`, `OriginBadge`, map caption, illustration watermark | Screenshots in `docs/qa/` | Passed |
| Historical SLA kept separate from the new ticket policy | `hist_work_orders.sla_*` vs `sla_policies`; labelled on the trace page | H Link Road; trace page step 4 | Passed |
| Historical rainfall and tides tied to their recorded dates | `hist_rainfall`, `hist_tides`; rain chips per job date | Trace page (WO25-01590 shows 12–16 Aug values) | Passed |
| Social posts as unverified signals staff can link | `/admin/signals`, `/api/admin/signals/[id]` | E9 (post SOC00362 linked to complaint BMC25-004138; audit entry `signal.link`) | Passed |

## 2. Wards and routing

| Requirement | Implemented in | Verification | Result |
|---|---|---|---|
| 24 wards: directory, map, detail pages, working board | `/wards`, `/wards/[code]`, `/ward?ward=` | R "24 ward boundaries"; Smoke `/wards`, `/wards/K%2FW` | Passed |
| Juhu → K/W, Andheri East → K/E (incl. alias and Marathi) | `src/lib/routing.ts` | R Juhu; R Andheri East; E1 (UI shows Ward K/W) | Passed |
| "Andheri" alone: ask to confirm or triage | Ambiguity candidates in preview; 409 unless triage accepted | R ambiguous; W ambiguous; seeded triage ticket | Passed |
| GPS, map pin, locality search, typed address + landmark | Report wizard step 3 | E1 (GPS); E6 (denied GPS → locality search); R conflict (pin + address) | Passed |
| Suggested ward and department before submission | Routing card | E1, E6 | Passed |
| Conflict, out of bounds, unclear team → visible triage queue | `in_triage`, `/admin/triage` | R conflict; R out of bounds; R department (team unclear); W triage | Passed |
| Configurable routing by ward and category; primary + supporting | `routing_rules` (versioned), `/admin/config` | R department routing (incl. ELE + DMC support); E9 (new K/W rule applied by the next preview, audited) | Passed |
| Transfer records previous owner, new owner, actor, time, reason; keeps ID, evidence, SLA | `performAction('transfer')` | W cross-ward transfer | Passed |

## 3. Category flows

| Requirement | Implemented in | Verification | Result |
|---|---|---|---|
| One form, category questions, urgency guidance, evidence requirement, closure check (9 categories) | `src/lib/config.ts`, wizard step 2 | E1 (waterlogging), E6 (streetlight); config reviewed | Passed |
| Submit without a photo when unsafe | "Not safe to take a photo" | W fallen tree (`photo_unsafe`) | Passed |
| Waterlogging: stretch, depth, rising/receding, access; access-restored time before review | `restore` action, review guard | W waterlogging; E2 | Passed |
| Fallen tree: obstruction, wires → supporting team handoff; evidence before closure | Routing + `add_supporting` | W fallen tree | Passed |
| Burst pipe: separate supply-restored update | Review guard on `supply_stopped` | W burst pipe | Passed |
| Missed pickup: solid waste; recurring service visible | SWM routing; ward page "recurring problem spots" | W missed pickup | Passed |
| Priority suggestion from impact and exposure; staff can revise with a reason | `src/lib/priority.ts`; `priority` action | R priority; W priority revise (reason required, recorded with actor; deadline from the original start; original priority kept) | Passed |
| Duplicates: nearby same-type suggestion, follow instead, staff confirmation, identities protected | `nearby_active_tickets`, follow, `confirm_duplicate` | W missed pickup (suggested ≠ merged; follower can't see the other report photo) | Passed |

## 4. Access

| Requirement | Implemented in | Verification | Result |
|---|---|---|---|
| Real sign-in, sessions, three roles | scrypt hashes, DB sessions, httpOnly cookies | E1–E8 sign in per role | Passed |
| Enforced on server and in the database | Route checks + RLS + `tickets_guard` trigger + column grants | W permissions (other resident, other ward, wrong department, officer approve, raw SQL update, password hash, append-only history) | Passed |
| Direct URL and API to another user's ticket, ward queue, evidence, super-admin actions | — | E7 (404 / 403 / 401 / redirect to `/denied`) | Passed |
| Private photos, metadata removed | `sharp` re-encode, auth-checked route, `Cache-Control: private, no-store` | E1 ("metadata removed"); E7 (evidence 404/401 for others) | Passed |
| Local demo accounts for all roles | `src/lib/demo-seed.ts`, sign-in page | E1–E8 | Passed |

## 5. Progress, timestamps, SLA

| Requirement | Implemented in | Verification | Result |
|---|---|---|---|
| Lifecycle and milestone % (10/25/40/60/85/100) | `MILESTONES`, `progressFor` | W burst pipe (each %); E4 (100%) | Passed |
| Progress bar + timeline; owner, next action, due time, latest update at the top | Ticket page | E4 timeline check; screenshots 06 | Passed |
| Timestamps stored in UTC, shown as `21 Nov 2026, 10:42 AM IST` | `formatIST` | S IST; E4 regex | Passed |
| Red: alert at once, first action ≤ 5 h; resolution separate | Policy v1, sweep | S critical; W burst pipe; W scheduler | Passed |
| Yellow: day-2 reminder, day 7. Orange: day 10 | Policy v1 | S medium; S standard | Passed |
| Versioned, configurable policies | `sla_policies` + `/admin/config` | E9 (new standard version published by super admin, refused for a resident, audited) | Passed |
| Background job; notifications de-duplicated across retries | `runSlaSweep`, unique `dedupe_key`; in-process + `/api/cron/sla` + `npm run scheduler` | W scheduler (retry reports nothing new; one event per threshold; both admins notified once); HTTP run above | Passed |
| Approval stops the clock; original priority kept | `sla_stopped_at`, `original_priority` | S approval; W burst pipe | Passed |
| Needs info, referral, duplicate, cancel, rework, reopen without false verification | Action rules + guard | W triage (info round trip, cancel); W rework/reopen; W referral (clock stopped, not verified) | Passed |

## 6. Evidence and Claude review

| Requirement | Implemented in | Verification | Result |
|---|---|---|---|
| Camera or upload with progress, retry, preview | Wizard step 4, `EvidenceUploader` (XHR progress, retry button) | E1, E2 uploads; E8 bad file → 422 with message | Passed |
| Before / during / after with note and work-order ID | Staff uploader | E2 (after photo) | Passed |
| Side-by-side, zoom, timestamps, location, officer notes | `/admin/review/[ref]` | E3; screenshot 05 | Passed |
| Claude Vision structured assessment (server-side, env-configured) | `src/lib/vision.ts` (`claude-opus-5-5`, JSON schema, refusal fallbacks) | Code path written and typechecked; no API key on this machine | **Blocked**: needs `ANTHROPIC_API_KEY` |
| Manual review when Claude is unavailable | Unavailable state + checklist | W "Claude unavailable"; E3 (no key → manual approve) | Passed |
| Store assessment, model, reviewer, decision, reason, timestamps | `evidence_assessments`, `review_decisions` | W rework (decisions with model id, manual flag) | Passed (stub provider) |
| Mismatched or duplicate photos, rework with history kept | Stub comparison (tests only), duplicate-hash warning | W rework/reopen (mismatch → rework → approve; 3 photos kept) | Passed |

## 7. Product and accessibility

| Requirement | Implemented in | Verification | Result |
|---|---|---|---|
| Design system: navy nav, neutral surfaces, teal action, priority colours + icons + text | `globals.css`, `components/ui.tsx` | Screenshots | Passed |
| Resident mobile flow, draft recovery, tracking ID at once | Wizard | E1 (390 px), E6 (draft restored after reload) | Passed |
| Ward workspace: board + table, due soon / overdue / unassigned, filters, map | `/ward`, `/ward/map` | E2; Smoke table view | Passed |
| Super admin: dashboards, escalations, review queue, audit, KPI drill-downs | `/admin`, `/admin/*` | E3; Smoke all admin pages | Passed |
| Ward intelligence: live workload separate from history | `/wards/[code]`, admin ward table | Smoke; screenshot | Passed |
| Keyboard navigation and visible focus | Skip link, native controls, `:focus-visible` | E8 (Tab reaches the skip link) | Partial: full keyboard-only run not done |
| English, Marathi, Hindi localisation; original report kept | `src/i18n/*.json`, language switch | Manual switch | Partial: navigation, statuses and banner are translated; form questions are English only |
| Empty, error, upload-failure, network, permission-denied states | `Empty`, `Alert`, `/denied`, network message in `postJson` | E7 (denied), E8 (upload failure) | Passed |
| Two admins on the same ticket | `version` check | W concurrency (second gets 409) | Passed |
| Double submission | `clientRequestId` | W double submission | Passed |

## 8. Historical accountability (judged)

| Requirement | Implemented in | Verification | Result |
|---|---|---|---|
| Budget vs bills for a labelled period | `/accountability` money trail (1 Jun – 30 Sep 2025; later jobs shown separately) | H totals reconcile with `work_orders.csv` and `wards.csv` | Passed |
| Per-job and per-m² cost maths | `history.ts` | H per-job vs per-m² | Passed |
| Link Road, Juhu, WO25-01590: ₹23,311 vs ₹12,220 | `/accountability/work-orders/WO25-01590` | H Link Road (checked against the CSV files); screenshot | Passed |
| Audit flags catch real problems, not normal variation | Over-rate (>1.35×), double billing, DLP paid; context signals; data quality | H audit flags (113 / 45 / DLP) and performance signals | Passed |
| Complaint → issue → work order trail; messy input | `/accountability/complaints`, `/accountability/complaints/[id]` | H trail (6,501 → 4,948 → 2,454 jobs; 454/457 blank wards inferred; Marathi/Hindi/Hinglish classification) | Passed |
| Fair contractor scorecards | Rain-adjusted speed, durability vs method mix | H totals (2,499 jobs) | Passed |
| Next-rupee plan | Risk ranking + cost per lasting fix + DLP claims | H next rupee | Passed |

## 9. Delivery

| Requirement | Where | Result |
|---|---|---|
| Migrations, seed and import scripts, `.env.example` | `migrations/`, `scripts/`, `.env.example` | Passed |
| Run and demo instructions, scheduler, Claude, re-import, deploy | `README.md` | Passed |
| Mermaid ER diagrams (operational + historical), lifecycle | `docs/ARCHITECTURE.md` | Passed |
| PostgreSQL with PostGIS | PGlite (real Postgres, no PostGIS) locally; `migrations/optional/postgis.sql` | **Blocked**: the venue network (≈20 KB/s) could not download Postgres or PostGIS. The geometry runs in TypeScript and the PostGIS file is unverified |
| Hosted Postgres path (`DATABASE_URL`) | `openPostgres` in `src/lib/db.ts` | Untested: no hosted database available |
| Private object storage (S3/R2) | Local private folder; driver functions to swap | Gap: S3 driver not written |

## Known gaps, in order of importance

1. **Live Claude Vision has not run.** It needs an API key. With one, open any ticket awaiting verification, click Run Claude assessment, and confirm a stored assessment with the model id.
2. PostGIS and hosted Postgres are unverified. The SQL is plain PostgreSQL, so the risk is low, but it hasn't been run.
3. Marathi and Hindi cover the page chrome only, not the category questions.
4. The routing-rule and SLA forms are tested through their API (E9), not by clicking the form fields.
5. Seeded "illustration" photos are generated drawings. Real phone photos work through the same upload path (E1/E2 used generated JPEGs).

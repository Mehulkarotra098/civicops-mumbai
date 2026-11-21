# CivicOps Mumbai

Municipal issue reporting and repair accountability for Mumbai's 24 wards, built for Claude Impact Lab Mumbai (21 Nov 2026, "Follow the Rupee").

A resident reports a flooded road, fallen tree, burst pipe, missed pickup or other civic problem. CivicOps routes it to the right ward and department, starts a visible deadline clock, and records every step until a super admin verifies the repair from photo evidence. The same app traces the organiser's historical repair data from complaint to work order to bill to rate card, and flags what does not add up.

> **All historical data is synthetic.** It comes from the organiser's repo [SumeetGDoshi/Claude-Impact-Labs-data-2](https://github.com/SumeetGDoshi/Claude-Impact-Labs-data-2) (imported read-only at commit `81d22806af98bded38bc15b0e7be248e4fbdfd3b`). It is not BMC data, and all contractors are fictional. The UI labels synthetic records, synthetic ward boundaries, illustration photos and live tickets separately.

## Quick start

Requirements: Node 22+, git. No Docker, Postgres install or internet connection is needed after `npm install`.

```bash
git clone https://github.com/SumeetGDoshi/Claude-Impact-Labs-data-2.git   # next to this folder
cd civicops-mumbai
npm install
npm run db:reset        # migrations + import of all 17 files + demo accounts and demo tickets
npm run dev             # http://localhost:3000
```

The importer looks for the dataset at `../Claude-Impact-Labs-data-2` (set `DATA_REPO` to change). It writes a validation report to `docs/IMPORT_REPORT.md`.

Production build: `npm run build && npm start`.

### Demo accounts

Password for every account: `CivicOps@2026`. The sign-in page lists them with one-click buttons (`DEMO_MODE=0` hides them). Use separate browser windows or a private window to keep roles signed in side by side.

| Account | Role | Scope |
|---|---|---|
| asha@civicops.demo | Resident | Juhu |
| ravi@civicops.demo | Resident | Andheri East |
| neha@civicops.demo | Resident | Andheri West |
| kw.officer@civicops.demo | Ward officer | K/W, all departments |
| kw.swm@civicops.demo | Ward officer | K/W, Solid Waste only |
| kw.admin@civicops.demo | Ward admin | K/W |
| ke.officer@civicops.demo | Ward admin | K/E |
| admin@civicops.demo | Super admin | City |
| admin2@civicops.demo | Super admin | City (for concurrency tests) |

## What is in it

| Area | Where |
|---|---|
| Resident reporting: category questions, GPS / map pin / locality search / address, routing preview, duplicate check, photos with progress and retry, draft recovery, tracking ID | `/report`, `/my`, `/tickets/[ref]` |
| Ward workspace: due soon, overdue, unassigned; board and table views; filters; ward map | `/ward`, `/ward/map` |
| Super admin: escalation inbox, evidence review with Claude-assisted comparison, triage queue, ward performance, routing rules and SLA versions, audit log, social signals, data quality | `/admin/*` |
| Ward directory and ward pages (24 wards, synthetic boundaries, live workload kept separate from historical context) | `/wards`, `/wards/[code]` |
| Historical accountability: money trail, audit flags, contractor scorecards, next-rupee plan, complaint → issue → work order trail, single-job trace | `/accountability/*` |

Lifecycle: Submitted 10% → Assigned 25% → Acknowledged 40% → Work started 60% → Completion evidence submitted 85% → Closure verified 100%. Side states: needs info, triage, duplicate, referred, cancelled, rework and reopening.

SLA policy v1 (versioned and editable): Red · Critical gets an alert at once, a meaningful first action within 5 hours and resolution within 48 hours. Yellow · Medium gets a reminder on day 2 and must be resolved by day 7. Orange · Standard must be resolved by day 10. The clock runs from submission (or reopening) and stops at verified closure.

## Architecture in one paragraph

Next.js 15 (App Router, TypeScript, Tailwind 4) with PostgreSQL. Locally the database is **PGlite**, real PostgreSQL compiled to WebAssembly and stored in `.data/pgdata`. Set `DATABASE_URL` to run the same SQL migrations on hosted PostgreSQL. Every user request runs inside a transaction that switches to the restricted `civicops_app` role and sets the user's id and role. **Row-level security policies and a guard trigger enforce access in the database**. For example, only a super admin can move a ticket to verified, residents only see their own tickets, and officers only see their ward and department. Photos are re-encoded with `sharp`, which strips EXIF and GPS data, and stored in a private folder served only through an authenticated route. Diagrams are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Configuration

Copy `.env.example` to `.env.local`.

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | Hosted PostgreSQL. Empty uses local PGlite | empty |
| `ANTHROPIC_API_KEY` | Enables live Claude Vision evidence assessment | empty: manual review |
| `CLAUDE_VISION_MODEL` / `CLAUDE_VISION_EFFORT` | Model and effort for the assessment | `claude-opus-5-5` / `medium` |
| `CRON_SECRET` | Bearer secret for `POST /api/cron/sla` | none: only super admins can trigger it |
| `SCHEDULER_INPROCESS` | Run the SLA sweep inside the server every minute | `1` |
| `ALLOW_CLOCK_OVERRIDE` | Allow `?now=` on the scheduler endpoint for controlled-clock demos | `0` |
| `DEMO_MODE` | Show demo accounts on the sign-in page | `1` |
| `STORAGE_DIR`, `PGLITE_DIR`, `DATA_REPO` | Paths for uploads, the local database and the dataset | `.data/...`, `../Claude-Impact-Labs-data-2` |

### Claude Vision

Put a key in `ANTHROPIC_API_KEY` and restart. On a ticket awaiting verification, the super admin opens **Evidence review** and clicks **Run Claude assessment**. The server sends the before and after photos, the category's closure check and the officer's notes. It asks for a structured answer: same place, same issue, visible changes, a verdict (repaired, partly repaired, mismatched or unclear), supporting details, and what the photos cannot verify. It uses server-side refusal fallbacks. The assessment, model id, reviewer, decision, reason and timestamps are stored. Without a key, or if Claude errors, the panel says so and the manual checklist is used. Claude never closes a ticket.

### SLA scheduler

The server sweeps deadlines every minute in-process. On hosting with many instances, set `SCHEDULER_INPROCESS=0` and either run `CRON_SECRET=... npm run scheduler` or point a cron job at `POST /api/cron/sla` with `Authorization: Bearer $CRON_SECRET`. Each threshold (critical alert, first-action due soon or breached, day-2 reminder, resolution due soon or breached) writes one history entry and one notification per person. Retries are de-duplicated by unique keys in the database.

### Re-running the import

`npm run db:import` re-imports all 17 files and keeps operational tickets. Use `npm run db:reset` for a clean database with fresh demo data. Stop the server first: PGlite allows one process per data folder, and the importer refuses to run while the server's lock is live.

## Tests and checks

```bash
npm run lint        # ESLint (TypeScript + React Hooks rules)
npm run typecheck   # tsc --noEmit
npm test            # 37 unit + integration tests on a freshly imported test database (.data/test-db)
npm run build       # production build
npm run test:e2e    # 8 browser tests (Playwright) against a running server; saves screenshots and video to docs/qa/
```

Results and the requirement-by-requirement matrix are in [docs/COVERAGE.md](docs/COVERAGE.md). The demo script and judge Q&A are in [docs/DEMO_AND_QA.md](docs/DEMO_AND_QA.md).

## Deploying

1. Provision PostgreSQL 15+ (Neon, Supabase, RDS). Set `DATABASE_URL` and run `npm run db:import` once from a machine with the dataset.
2. Optional: run `migrations/optional/postgis.sql` for spatial columns and indexes (not verified in this build).
3. Replace the local photo store in `src/lib/evidence.ts` (`putObject` / `getObject`) with a private S3 or R2 bucket. Serverless file systems are not persistent.
4. Set `CRON_SECRET`, `SCHEDULER_INPROCESS=0` and a cron job calling `/api/cron/sla` every minute.
5. Set `DEMO_MODE=0`, and create real staff accounts and ward/department memberships.

## What needs real-world input before a pilot

Official ward boundaries (the dataset's polygons are a Voronoi approximation), the official department list and routing rules for each ward, real SLA policy, staff directory and memberships, SMS or WhatsApp notification gateways, a hosted database, object storage and an Anthropic API key.

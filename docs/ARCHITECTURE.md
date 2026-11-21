# Architecture

## Components

```mermaid
flowchart LR
  R[Resident browser] -->|report, photos| N[Next.js server<br/>App Router + API routes]
  O[Ward officer] --> N
  S[Super admin] --> N
  N -->|withUser: SET LOCAL ROLE civicops_app<br/>app.user_id, app.role| DB[(PostgreSQL<br/>PGlite locally / hosted via DATABASE_URL)]
  N -->|sharp: strip EXIF, resize| FS[(Private photo store<br/>.data/uploads)]
  N -->|before/after photos, closure check| C[Claude Vision API<br/>optional]
  SCH[SLA sweep<br/>in-process every minute<br/>or POST /api/cron/sla] --> DB
  IMP[npm run db:import] -->|read-only| REPO[(Organiser repo<br/>17 files)]
  IMP --> DB
```

## Ticket lifecycle (authoritative rules)

```mermaid
stateDiagram-v2
  [*] --> submitted: resident submits (10%)
  submitted --> assigned: routed automatically, or from triage (25%)
  assigned --> acknowledged: officer acknowledges or records first action (40%)
  assigned --> in_progress: work started
  acknowledged --> in_progress: work started (60%)
  in_progress --> awaiting_verification: completion evidence submitted (85%)
  awaiting_verification --> verified_resolved: super admin approves (100%, clock stops)
  awaiting_verification --> in_progress: return for rework / request more evidence
  verified_resolved --> assigned: reopened within 30 days (new clock, history kept)
  submitted --> needs_info
  assigned --> needs_info
  acknowledged --> needs_info
  in_progress --> needs_info
  needs_info --> assigned: resident replies (returns to the previous state)
  submitted --> duplicate: staff confirm duplicate
  assigned --> duplicate
  assigned --> referred: another agency
  submitted --> cancelled
  assigned --> cancelled
```

Rules enforced in the database (trigger `tickets_guard` and RLS), not only in the app:
- Only a super admin (or the system) can set `verified_resolved`, and only from `awaiting_verification`.
- Residents cannot change routing, priority, deadlines or officers. They can only cancel, reply to an information request, or reopen.
- `original_priority` never changes. Every update bumps `version`, so concurrent edits are detected (409).
- `ticket_events` is append-only for application users.
- The application role cannot read `users.password_hash` or phone numbers (column-level grant).

The app adds: evidence requirements per category (an after photo, or a written reason why none is possible), "access restored" before reviewing a waterlogging ticket, "supply restored" when a water outage was reported, and a 30-day window for residents to reopen.

## Routing

```mermaid
flowchart TD
  A[GPS / map pin / locality search / typed address + landmark] --> B{Point inside a ward polygon?}
  B -->|yes| C{Typed locality agrees?}
  C -->|yes or none| W[Ward found: high or medium confidence]
  C -->|different ward| T[Triage: address and pin conflict]
  B -->|outside all wards| T2[Triage: out of bounds]
  B -->|no point| D{Locality text matches the gazetteer?}
  D -->|one ward| W
  D -->|several wards, e.g. Andheri| Q[Ask the resident to pick, or send to triage]
  D -->|nothing| M[Ask for a location]
  W --> R[Routing rule: ward-specific, else city-wide → primary department + supporting departments from details]
  R --> P[Priority from impact and exposure: road type, bus route, hospital nearby, flood hotspot]
```

Gazetteer: `localities.csv` names and aliases, including Devanagari (`अंधेरी पूर्व` → K/E). Ward polygons come from `wards.geojson`, a synthetic Voronoi approximation. The repo states that point-in-polygon on them matches its `ward_code` columns.

## Operational data model

```mermaid
erDiagram
  users ||--o{ sessions : has
  users ||--o{ memberships : "ward + department access"
  wards ||--o{ memberships : ""
  departments ||--o{ memberships : ""
  categories ||--o{ routing_rules : ""
  wards |o--o{ routing_rules : "ward override (null = city-wide)"
  departments ||--o{ routing_rules : "primary"
  sla_policies ||--o{ tickets : "versioned policy"
  users ||--o{ tickets : reports
  wards |o--o{ tickets : "current owner"
  departments |o--o{ tickets : "primary owner"
  roads |o--o{ tickets : "nearest segment"
  tickets ||--o{ ticket_events : "append-only history"
  tickets ||--o{ evidence : photos
  tickets ||--o{ evidence_assessments : "Claude / stub / unavailable"
  tickets ||--o{ review_decisions : "approve / rework / more evidence"
  evidence_assessments |o--o{ review_decisions : "used in"
  tickets ||--o{ ticket_links : "suggested / confirmed duplicates"
  tickets ||--o{ ticket_followers : "residents following"
  users ||--o{ notifications : inbox
  tickets |o--o{ notifications : ""
  tickets |o--o{ social_posts : "linked signal"
  users ||--o{ audit_log : "config changes"

  tickets {
    uuid id PK
    text ref "CO-yymmdd-nnnn"
    text status
    int progress_pct
    text priority
    text original_priority
    timestamptz clock_started_at
    timestamptz first_action_due_at
    timestamptz resolution_due_at
    timestamptz sla_stopped_at
    text sla_outcome
    int escalation_level
    int version
    text data_origin "operational | demo_seed"
  }
  ticket_events {
    bigint id PK
    timestamptz at "UTC, shown in IST"
    uuid actor_id
    text type
    jsonb from_owner
    jsonb to_owner
    text reason
    text dedupe_key UK "scheduler idempotency"
  }
  notifications {
    uuid id PK
    text dedupe_key UK
  }
```

## Historical (synthetic) data model

```mermaid
erDiagram
  wards ||--o{ localities : ""
  wards ||--o{ roads : ""
  roads ||--|| road_traffic : ""
  roads ||--o{ facilities : "ambulance entry road"
  wards ||--o{ flood_hotspots : ""
  wards ||--o{ hist_work_orders : ""
  roads ||--o{ hist_work_orders : ""
  contractors ||--o{ hist_work_orders : ""
  rate_card ||--o{ hist_work_orders : "repair_method"
  hist_work_orders ||--o{ hist_work_order_complaints : "linked_complaint_ids"
  hist_complaints ||--o{ hist_work_order_complaints : ""
  roads ||--o{ hist_accidents : ""
  import_runs ||--o{ import_issues : "validation"

  wards { text ward_code PK  bigint budget_inr_2025  jsonb boundary_geojson  text boundary_origin "synthetic_voronoi" }
  hist_work_orders { text work_order_id PK  float area_sqm  float cost_inr  int sla_hours  bool sla_met  bool reopened_within_30d }
  hist_complaints { text complaint_id PK  text description "original words kept"  text language  text ward_code "457 blank"  text status  bool in_sample_200 }
  rate_card { text repair_method PK  text unit  float standard_rate_inr }
  roads { text road_id PK  bool under_dlp  date last_resurfaced  jsonb geometry }
  hist_rainfall { date date PK  text station PK  float rainfall_mm }
  hist_tides { int id PK  date date  float height_m  bool big_tide }
  social_posts { text post_id PK  text review_status "unreviewed | linked | dismissed" }
```

Every imported row carries `data_origin = 'synthetic_repo'`. Source IDs, original descriptions, statuses and timestamps are preserved. Timestamps are read as IST from the dataset and stored as UTC.

## Audit logic (historical)

| Signal | Rule | Count |
|---|---|---:|
| Billed above the rate card | bill ÷ reference > 1.35. The reference is area × rate (per m²) or the flat per-job rate. Every normal job is ≤ 1.32×. | 113 |
| Possible double billing | No linked complaint, and the same road + same work type was billed within 10 days | 45 |
| Paid under defect liability | Road `under_dlp = Y`, and the job came after the last resurfacing | 493 |
| Missed time target (context) | `sla_met = N`, shown with the rainfall during the job and the engineer's remark | 1,259 |
| Failed within 30 days (context) | `reopened_within_30d = Y`, with the redo work order | 611 |
| Inconsistent record | Recorded SLA result contradicts the timestamps | 1 |

Contractor scorecards compare durability with the reopen rate expected for each contractor's mix of repair methods. Speed is shown both overall and excluding jobs that had heavy rain (≥ 64.5 mm/day). The next-rupee plan ranks road segments by open complaints, failed fixes, flood hotspots (including tide sensitivity and the number of 2025 days above each hotspot's flooding threshold), congestion, accidents, ambulance routes, schools and bus routes. It funds the method with the lowest cost per lasting fix, uses pumping only as standby, and claims DLP roads from the original contractor.

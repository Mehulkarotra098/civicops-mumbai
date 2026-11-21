-- CivicOps Mumbai: core schema.
-- Runs unchanged on PGlite (local) and on hosted PostgreSQL 15+.
-- Naming: reference tables hold the synthetic repo's master data, hist_* tables hold
-- the synthetic historical records, everything else is operational (new tickets).

-- ============================================================
-- Reference data (synthetic, from the organiser's repo)
-- ============================================================
create table if not exists wards (
  ward_code text primary key,
  ward_name text not null,
  zone text,
  office_name text,
  centroid_lat double precision,
  centroid_lon double precision,
  approx_area_km2 double precision,
  population_est integer,
  low_lying_index double precision,
  engineering_crews integer,
  localities_text text,
  budget_inr_2025 bigint,
  budget_period_start date not null default '2025-06-01',
  budget_period_end date not null default '2025-09-30',
  boundary_geojson jsonb,
  data_origin text not null default 'synthetic_repo',
  boundary_origin text not null default 'synthetic_voronoi'
);

create table if not exists localities (
  id serial primary key,
  name text not null,
  ward_code text not null references wards(ward_code),
  lat double precision,
  lon double precision,
  aliases text[] not null default '{}',
  aliases_raw text,
  data_origin text not null default 'synthetic_repo'
);

create table if not exists roads (
  road_id text primary key,
  road_name text not null,
  segment_no integer,
  ward_code text references wards(ward_code),
  road_type text,
  surface text,
  lanes integer,
  length_m double precision,
  start_lat double precision, start_lon double precision,
  end_lat double precision, end_lon double precision,
  last_resurfaced date,
  under_dlp boolean not null default false,
  bus_route boolean not null default false,
  geometry jsonb,
  data_origin text not null default 'synthetic_repo'
);

create table if not exists road_traffic (
  road_id text primary key references roads(road_id),
  peak_hour_vehicles integer,
  avg_peak_speed_kmph double precision,
  congestion_index double precision,
  bus_routes_count integer,
  two_wheeler_share_pct double precision,
  data_origin text not null default 'synthetic_repo'
);

create table if not exists facilities (
  facility_id text primary key,
  type text not null,
  name text not null,
  ward_code text references wards(ward_code),
  lat double precision, lon double precision,
  beds_or_students integer,
  emergency_services boolean,
  ambulance_entry_road text references roads(road_id),
  data_origin text not null default 'synthetic_repo'
);

create table if not exists flood_hotspots (
  hotspot_id text primary key,
  name text not null,
  ward_code text references wards(ward_code),
  lat double precision, lon double precision,
  flood_threshold_mm double precision,
  tide_sensitive boolean,
  avg_water_depth_cm double precision,
  avg_recession_hours double precision,
  pumping_station_nearby boolean,
  years_flagged_last_5 integer,
  data_origin text not null default 'synthetic_repo'
);

create table if not exists contractors (
  contractor_id text primary key,
  contractor_name text not null,
  empanelled_since integer,
  active_wards text[] not null default '{}',
  data_origin text not null default 'synthetic_repo'
);

create table if not exists rate_card (
  repair_method text primary key,
  unit text not null check (unit in ('per sqm', 'per job')),
  standard_rate_inr double precision not null,
  data_origin text not null default 'synthetic_repo'
);

-- ============================================================
-- Historical records (synthetic, Jun to Oct 2025)
-- ============================================================
create table if not exists hist_complaints (
  complaint_id text primary key,
  received_at timestamptz not null,
  channel text,
  category_reported text,
  mapped_category text,
  description text,
  language text,
  locality_text text,
  ward_code text,
  lat double precision, lon double precision,
  gps_accuracy_m double precision,
  photo_url text,
  photo_description text,
  complainant_hash text,
  upvotes integer not null default 0,
  status text,
  resolved_at timestamptz,
  in_sample_200 boolean not null default false,
  data_origin text not null default 'synthetic_repo'
);
create index if not exists hist_complaints_ward_idx on hist_complaints(ward_code);

create table if not exists hist_work_orders (
  work_order_id text primary key,
  ward_code text references wards(ward_code),
  road_id text references roads(road_id),
  work_type text,
  repair_method text references rate_card(repair_method),
  contractor_id text references contractors(contractor_id),
  contractor_name text,
  assigned_at timestamptz,
  work_started_at timestamptz,
  completed_at timestamptz,
  area_sqm double precision,
  cost_inr double precision,
  sla_hours integer,
  sla_met boolean,
  reopened_within_30d boolean,
  engineer_remark text,
  linked_complaint_ids_raw text,
  data_origin text not null default 'synthetic_repo'
);
create index if not exists hist_wo_ward_idx on hist_work_orders(ward_code);
create index if not exists hist_wo_road_idx on hist_work_orders(road_id);

create table if not exists hist_work_order_complaints (
  work_order_id text not null references hist_work_orders(work_order_id),
  complaint_id text not null,
  link_status text not null default 'valid' check (link_status in ('valid', 'missing_complaint', 'ward_mismatch')),
  primary key (work_order_id, complaint_id)
);
create index if not exists hist_woc_complaint_idx on hist_work_order_complaints(complaint_id);

create table if not exists hist_accidents (
  accident_id text primary key,
  occurred_at timestamptz,
  ward_code text references wards(ward_code),
  road_id text references roads(road_id),
  lat double precision, lon double precision,
  vehicle_type text,
  severity text,
  probable_cause text,
  data_origin text not null default 'synthetic_repo'
);

create table if not exists hist_rainfall (
  date date not null,
  station text not null,
  rainfall_mm double precision,
  imd_category text,
  imd_alert text,
  data_origin text not null default 'synthetic_repo',
  primary key (date, station)
);

create table if not exists hist_tides (
  id serial primary key,
  date date not null,
  high_tide_time text,
  height_m double precision,
  big_tide boolean,
  data_origin text not null default 'synthetic_repo'
);

-- ============================================================
-- Import bookkeeping
-- ============================================================
create table if not exists import_runs (
  id serial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  source_repo text,
  source_commit text,
  row_counts jsonb,
  status text not null default 'running',
  notes text
);

create table if not exists import_issues (
  id serial primary key,
  run_id integer references import_runs(id),
  file text not null,
  record_id text,
  severity text not null check (severity in ('error', 'warning', 'info')),
  issue_type text not null,
  message text not null,
  data jsonb
);

-- ============================================================
-- Operational configuration
-- ============================================================
create table if not exists departments (
  code text primary key,
  name text not null,
  short_name text not null,
  description text
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  phone text,
  role text not null check (role in ('resident', 'officer', 'ward_admin', 'super_admin')),
  password_hash text not null,
  locale text not null default 'en',
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id text primary key,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists memberships (
  id serial primary key,
  user_id uuid not null references users(id) on delete cascade,
  ward_code text not null references wards(ward_code),
  department_code text references departments(code),
  role text not null check (role in ('officer', 'ward_admin')),
  unique (user_id, ward_code, department_code)
);

create table if not exists categories (
  code text primary key,
  label text not null,
  primary_department text not null references departments(code),
  urgency_guidance text not null,
  evidence_required text not null,
  closure_check text not null,
  photo_required_for_closure boolean not null default true,
  sort integer not null default 0
);

create table if not exists routing_rules (
  id serial primary key,
  ward_code text references wards(ward_code),
  category_code text not null references categories(code),
  primary_department text not null references departments(code),
  supporting_departments text[] not null default '{}',
  version integer not null default 1,
  active boolean not null default true,
  note text,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);
create unique index if not exists routing_rules_active_uq
  on routing_rules (coalesce(ward_code, '*'), category_code) where active;

create table if not exists sla_policies (
  id serial primary key,
  version integer not null,
  priority text not null check (priority in ('critical', 'medium', 'standard')),
  label text not null,
  first_action_hours double precision,
  reminder_hours double precision,
  resolution_hours double precision not null,
  due_soon_fraction double precision not null default 0.8,
  alert_on_submit boolean not null default false,
  active boolean not null default true,
  note text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  unique (version, priority)
);

-- ============================================================
-- Operational tickets
-- ============================================================
create sequence if not exists ticket_seq;

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  reporter_id uuid not null references users(id),
  category_code text not null references categories(code),
  title text not null,
  description text not null,
  description_lang text,
  details jsonb not null default '{}',
  photo_unsafe boolean not null default false,
  lat double precision,
  lon double precision,
  gps_accuracy_m double precision,
  location_source text check (location_source in ('gps', 'pin', 'locality', 'address')),
  address_text text,
  landmark text,
  locality_name text,
  suggested_ward_code text references wards(ward_code),
  ward_code text references wards(ward_code),
  road_id text references roads(road_id),
  nearest_road_m double precision,
  location_confidence text check (location_confidence in ('high', 'medium', 'low')),
  triage_reason text,
  in_triage boolean not null default false,
  department_code text references departments(code),
  supporting_departments text[] not null default '{}',
  assigned_officer_id uuid references users(id),
  status text not null check (status in ('submitted', 'assigned', 'acknowledged', 'in_progress',
    'awaiting_verification', 'verified_resolved', 'needs_info', 'referred', 'duplicate', 'cancelled')),
  status_before_hold text,
  progress_pct integer not null default 10,
  priority text not null check (priority in ('critical', 'medium', 'standard')),
  original_priority text not null check (original_priority in ('critical', 'medium', 'standard')),
  suggested_priority text not null check (suggested_priority in ('critical', 'medium', 'standard')),
  priority_reasons jsonb not null default '[]',
  sla_policy_id integer references sla_policies(id),
  sla_policy_version integer,
  submitted_at timestamptz not null,
  clock_started_at timestamptz not null,
  first_action_due_at timestamptz,
  reminder_at timestamptz,
  resolution_due_at timestamptz not null,
  routed_at timestamptz,
  acknowledged_at timestamptz,
  first_action_at timestamptz,
  work_started_at timestamptz,
  completion_submitted_at timestamptz,
  verified_at timestamptz,
  closed_at timestamptz,
  access_restored_at timestamptz,
  supply_restored_at timestamptz,
  sla_stopped_at timestamptz,
  sla_outcome text check (sla_outcome in ('met', 'breached')),
  first_action_outcome text check (first_action_outcome in ('met', 'breached')),
  escalation_level integer not null default 0,
  reopen_count integer not null default 0,
  duplicate_of uuid references tickets(id),
  version integer not null default 1,
  data_origin text not null default 'operational' check (data_origin in ('operational', 'demo_seed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tickets_ward_idx on tickets(ward_code, department_code);
create index if not exists tickets_reporter_idx on tickets(reporter_id);
create index if not exists tickets_status_idx on tickets(status);

create table if not exists ticket_followers (
  ticket_id uuid not null references tickets(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  via text not null default 'follow' check (via in ('follow', 'duplicate')),
  created_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);

create table if not exists ticket_events (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references tickets(id) on delete cascade,
  at timestamptz not null default now(),
  actor_id uuid references users(id),
  actor_role text not null,
  actor_name text,
  type text not null,
  from_status text,
  to_status text,
  from_owner jsonb,
  to_owner jsonb,
  reason text,
  note text,
  data jsonb not null default '{}',
  visibility text not null default 'all' check (visibility in ('all', 'staff')),
  dedupe_key text unique
);
create index if not exists ticket_events_ticket_idx on ticket_events(ticket_id, at);

create table if not exists evidence (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  uploaded_by uuid not null references users(id),
  uploader_role text not null,
  phase text not null check (phase in ('report', 'before', 'during', 'after', 'info')),
  storage_key text not null,
  thumb_key text not null,
  mime text not null,
  bytes integer not null,
  width integer,
  height integer,
  sha256 text not null,
  duplicate_of_evidence uuid references evidence(id),
  note text,
  work_order_ref text,
  origin text not null default 'upload' check (origin in ('upload', 'illustration')),
  metadata_stripped boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists evidence_ticket_idx on evidence(ticket_id);
create index if not exists evidence_sha_idx on evidence(sha256);

create table if not exists evidence_assessments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  requested_by uuid references users(id),
  provider text not null,
  model text,
  status text not null check (status in ('completed', 'unavailable', 'error')),
  result jsonb,
  error text,
  evidence_ids uuid[] not null default '{}',
  latency_ms integer,
  created_at timestamptz not null default now()
);

create table if not exists review_decisions (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  reviewer_id uuid not null references users(id),
  decision text not null check (decision in ('approve', 'request_evidence', 'rework')),
  reason text not null,
  assessment_id uuid references evidence_assessments(id),
  model_version text,
  manual boolean not null,
  checklist jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists ticket_links (
  id serial primary key,
  ticket_id uuid not null references tickets(id) on delete cascade,
  related_ticket_id uuid not null references tickets(id) on delete cascade,
  status text not null default 'suggested' check (status in ('suggested', 'confirmed', 'rejected')),
  distance_m double precision,
  reason text,
  decided_by uuid references users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (ticket_id, related_ticket_id)
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  ticket_id uuid references tickets(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_idx on notifications(user_id, created_at desc);

create table if not exists social_posts (
  post_id text primary key,
  posted_at timestamptz,
  source text,
  author_handle text,
  text text,
  has_media boolean,
  engagement integer,
  review_status text not null default 'unreviewed' check (review_status in ('unreviewed', 'linked', 'dismissed')),
  linked_ticket_id uuid references tickets(id),
  linked_complaint_id text,
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  review_note text,
  data_origin text not null default 'synthetic_repo'
);

create table if not exists audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid references users(id),
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  reason text
);

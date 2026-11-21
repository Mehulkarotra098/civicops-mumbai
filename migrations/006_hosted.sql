-- Hosted PostgreSQL (Neon, Supabase, RDS): the owner role is not a superuser there.
-- Security-definer helper functions run as the owner and must read across rows, so the owner
-- bypasses RLS (NO FORCE). Users never run as the owner: every request switches to civicops_app,
-- which stays fully subject to the policies.
alter table tickets no force row level security;
alter table ticket_events no force row level security;
alter table evidence no force row level security;
alter table evidence_assessments no force row level security;
alter table review_decisions no force row level security;
alter table notifications no force row level security;

-- Photo storage for serverless deployments (STORAGE_DRIVER=db): private bytes in the database.
create table if not exists evidence_blobs (
  key text primary key,
  data bytea not null,
  created_at timestamptz not null default now()
);

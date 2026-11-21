-- WardProof: public accountability cases for flagged expenses and resident questions.
-- Flag raised → assigned to responsible office → written response due → independent review → follow-up or closure.

alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check check (role in ('resident', 'officer', 'ward_admin', 'super_admin', 'auditor'));

create table if not exists case_settings (
  id integer primary key default 1 check (id = 1),
  response_minutes integer not null default 10080,   -- 7 days; demo can set minutes
  corrective_days integer not null default 14,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);
insert into case_settings (id) values (1) on conflict do nothing;

create sequence if not exists case_seq;

create table if not exists accountability_cases (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,                 -- public tracking ID, e.g. AQ-261121-0007
  kind text not null check (kind in ('flag', 'question')),
  flag_type text,                           -- over_rate, double_billing, dlp_paid, over_budget, … (kind = flag)
  question_type text,                       -- cost_increase, missing_proof, reopened, other (kind = question)
  work_order_id text not null references hist_work_orders(work_order_id),
  ward_code text not null references wards(ward_code),
  department_code text references departments(code),
  responsible_office text not null,
  responsible_role text not null,
  official_name text,                       -- only when published in an approved public record
  reviewer_office text not null,
  amount_under_review double precision,
  calculation jsonb not null default '{}',
  public_question text,                     -- redacted text that may be published
  status text not null default 'awaiting_response' check (status in (
    'awaiting_response', 'awaiting_review', 'needs_evidence', 'correction_required', 'justified', 'corrected', 'referred', 'closed')),
  response_due_at timestamptz not null,
  escalated_at timestamptz,
  decision text check (decision in ('justified', 'correction_required', 'referred', 'needs_evidence')),
  decision_reason text,
  decided_by uuid references users(id),
  decided_at timestamptz,
  previous_values jsonb,
  corrected_values jsonb,
  corrective_action text,
  corrective_owner text,
  corrective_due_at timestamptz,
  corrective_completed_at timestamptz,
  is_demo_example boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cases_wo_idx on accountability_cases(work_order_id);
create index if not exists cases_ward_idx on accountability_cases(ward_code, status);

-- Private: who asked and their original words. Never granted to the application role's public reads.
create table if not exists case_private (
  case_id uuid primary key references accountability_cases(id) on delete cascade,
  asker_user_id uuid references users(id),
  asker_name text,
  asker_contact text,
  original_question text
);

create table if not exists case_responses (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references accountability_cases(id) on delete cascade,
  version integer not null,
  body text not null,
  evidence jsonb not null default '[]',     -- [{kind, reference, note}]
  responder_id uuid references users(id),
  responder_office text not null,
  is_demo_example boolean not null default false,
  created_at timestamptz not null default now(),
  unique (case_id, version)
);

create table if not exists case_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references accountability_cases(id) on delete cascade,
  at timestamptz not null default now(),
  actor_id uuid references users(id),
  actor_role text not null,
  actor_office text,
  type text not null,
  note text,
  data jsonb not null default '{}',
  dedupe_key text unique
);
create index if not exists case_events_idx on case_events(case_id, at);

-- Only an independent reviewer (auditor or super admin) or the system may record a decision.
create or replace function cases_guard() returns trigger language plpgsql as $$
declare r text := app_role();
begin
  new.updated_at := now();
  if (new.decision is distinct from old.decision or new.corrected_values is distinct from old.corrected_values)
     and r not in ('auditor', 'super_admin', 'system') then
    raise exception 'Only an independent reviewer can record a decision' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists cases_guard_trg on accountability_cases;
create trigger cases_guard_trg before update on accountability_cases for each row execute function cases_guard();

create or replace function case_events_append_only() returns trigger language plpgsql as $$
begin raise exception 'Case history is append-only' using errcode = '42501'; end $$;
drop trigger if exists case_events_no_update on case_events;
create trigger case_events_no_update before update or delete on case_events
  for each row when (current_setting('app.role', true) is distinct from 'system') execute function case_events_append_only();

grant select, insert, update on accountability_cases, case_responses, case_settings to civicops_app;
grant select, insert on case_events to civicops_app;
grant insert on case_private to civicops_app;
grant usage, select on sequence case_seq to civicops_app;

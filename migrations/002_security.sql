-- CivicOps Mumbai: database-level access control.
-- Every user-facing request runs inside a transaction that does
--   SET LOCAL ROLE civicops_app; set_config('app.user_id', ...); set_config('app.role', ...)
-- so the row-level security policies below apply even if application code has a bug.
-- Import, migrations and the SLA scheduler run as the owner with app.role = 'system'.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'civicops_app') then
    create role civicops_app nologin;
  end if;
end $$;

do $$
begin
  execute format('grant civicops_app to %I', current_user);
exception when others then
  null; -- superusers (PGlite) can already SET ROLE to it
end $$;

create or replace function app_uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create or replace function app_role() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('app.role', true), ''), 'anonymous')
$$;

-- Staff visibility is granted through ward + department memberships.
create or replace function app_staff_can_see(p_ward text, p_dept text, p_supporting text[], p_suggested text)
returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from memberships m
    where m.user_id = app_uid()
      and (
        (p_ward is not null and m.ward_code = p_ward
          and (m.department_code is null or m.department_code = p_dept or m.department_code = any(coalesce(p_supporting, '{}'))))
        or (p_ward is null and m.role = 'ward_admin' and m.ward_code = p_suggested)
      )
  )
$$;

create or replace function app_is_follower(p_ticket uuid) returns boolean
language sql stable security definer as $$
  select exists (select 1 from ticket_followers f where f.ticket_id = p_ticket and f.user_id = app_uid())
$$;

-- ---------- tickets ----------
alter table tickets enable row level security;
alter table tickets force row level security;

drop policy if exists tickets_system on tickets;
create policy tickets_system on tickets for all
  using (app_role() = 'system') with check (app_role() = 'system');

drop policy if exists tickets_select on tickets;
create policy tickets_select on tickets for select to civicops_app using (
  app_role() = 'super_admin'
  or (app_role() = 'resident' and (reporter_id = app_uid() or app_is_follower(id)))
  or (app_role() in ('officer', 'ward_admin') and app_staff_can_see(ward_code, department_code, supporting_departments, suggested_ward_code))
);

drop policy if exists tickets_insert on tickets;
create policy tickets_insert on tickets for insert to civicops_app with check (
  (app_role() = 'resident' and reporter_id = app_uid())
  or app_role() = 'super_admin'
);

drop policy if exists tickets_update on tickets;
create policy tickets_update on tickets for update to civicops_app using (
  app_role() = 'super_admin'
  or (app_role() = 'resident' and reporter_id = app_uid())
  or (app_role() in ('officer', 'ward_admin') and app_staff_can_see(ward_code, department_code, supporting_departments, suggested_ward_code))
) with check (true);

-- Authoritative state rules that hold whatever the application does.
create or replace function tickets_guard() returns trigger
language plpgsql as $$
declare
  r text := app_role();
begin
  new.version := old.version + 1;
  new.updated_at := now();

  if new.status = 'verified_resolved' and old.status <> 'verified_resolved' then
    if r not in ('super_admin', 'system') then
      raise exception 'Only a super admin can verify closure' using errcode = '42501';
    end if;
    if old.status <> 'awaiting_verification' then
      raise exception 'A ticket must be awaiting verification before it can be verified' using errcode = '23514';
    end if;
  end if;

  if new.original_priority is distinct from old.original_priority then
    raise exception 'The original priority is kept for history and cannot change' using errcode = '23514';
  end if;

  if r = 'resident' then
    if new.priority is distinct from old.priority
       or new.ward_code is distinct from old.ward_code
       or new.department_code is distinct from old.department_code
       or new.assigned_officer_id is distinct from old.assigned_officer_id
       or new.resolution_due_at is distinct from old.resolution_due_at and old.status <> 'verified_resolved' then
      raise exception 'Residents cannot change routing, priority or deadlines' using errcode = '42501';
    end if;
    if new.status <> old.status and not (
         new.status = 'cancelled'
      or (old.status = 'needs_info' and new.status = old.status_before_hold)
      or (old.status = 'verified_resolved' and new.status = 'assigned')
    ) then
      raise exception 'Residents cannot move a ticket to %', new.status using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists tickets_guard_trg on tickets;
create trigger tickets_guard_trg before update on tickets
  for each row execute function tickets_guard();

-- ---------- ticket events (append-only history) ----------
alter table ticket_events enable row level security;
alter table ticket_events force row level security;
drop policy if exists events_system on ticket_events;
create policy events_system on ticket_events for all
  using (app_role() = 'system') with check (app_role() = 'system');
drop policy if exists events_select on ticket_events;
create policy events_select on ticket_events for select to civicops_app using (
  exists (select 1 from tickets t where t.id = ticket_events.ticket_id)
  and (visibility = 'all' or app_role() in ('officer', 'ward_admin', 'super_admin'))
);
drop policy if exists events_insert on ticket_events;
create policy events_insert on ticket_events for insert to civicops_app with check (
  exists (select 1 from tickets t where t.id = ticket_events.ticket_id)
  and (actor_id = app_uid() or (actor_id is null and actor_role = 'system'))
);

create or replace function ticket_events_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'Ticket history is append-only' using errcode = '42501';
end $$;
drop trigger if exists ticket_events_no_update on ticket_events;
create trigger ticket_events_no_update before update or delete on ticket_events
  for each row when (current_setting('app.role', true) is distinct from 'system')
  execute function ticket_events_append_only();

-- ---------- evidence ----------
alter table evidence enable row level security;
alter table evidence force row level security;
drop policy if exists evidence_system on evidence;
create policy evidence_system on evidence for all
  using (app_role() = 'system') with check (app_role() = 'system');
drop policy if exists evidence_select on evidence;
create policy evidence_select on evidence for select to civicops_app using (
  app_role() in ('super_admin', 'officer', 'ward_admin')
    and exists (select 1 from tickets t where t.id = evidence.ticket_id)
  or app_role() = 'resident' and exists (
    select 1 from tickets t where t.id = evidence.ticket_id and t.reporter_id = app_uid())
  -- Followers see the repair evidence, never another resident's report photos.
  or app_role() = 'resident' and uploader_role <> 'resident' and app_is_follower(evidence.ticket_id)
);
drop policy if exists evidence_insert on evidence;
create policy evidence_insert on evidence for insert to civicops_app with check (
  uploaded_by = app_uid() and exists (select 1 from tickets t where t.id = evidence.ticket_id)
);

-- ---------- assessments and decisions ----------
alter table evidence_assessments enable row level security;
alter table evidence_assessments force row level security;
drop policy if exists assess_system on evidence_assessments;
create policy assess_system on evidence_assessments for all
  using (app_role() = 'system') with check (app_role() = 'system');
drop policy if exists assess_staff on evidence_assessments;
create policy assess_staff on evidence_assessments for all to civicops_app
  using (app_role() = 'super_admin') with check (app_role() = 'super_admin');
drop policy if exists assess_ward on evidence_assessments;
create policy assess_ward on evidence_assessments for select to civicops_app
  using (app_role() in ('officer', 'ward_admin') and exists (select 1 from tickets t where t.id = evidence_assessments.ticket_id));

alter table review_decisions enable row level security;
alter table review_decisions force row level security;
drop policy if exists decisions_system on review_decisions;
create policy decisions_system on review_decisions for all
  using (app_role() = 'system') with check (app_role() = 'system');
drop policy if exists decisions_insert on review_decisions;
create policy decisions_insert on review_decisions for insert to civicops_app
  with check (app_role() = 'super_admin' and reviewer_id = app_uid());
drop policy if exists decisions_select on review_decisions;
create policy decisions_select on review_decisions for select to civicops_app
  using (exists (select 1 from tickets t where t.id = review_decisions.ticket_id));

-- ---------- notifications ----------
alter table notifications enable row level security;
alter table notifications force row level security;
drop policy if exists notif_system on notifications;
create policy notif_system on notifications for all
  using (app_role() = 'system') with check (app_role() = 'system');
drop policy if exists notif_own on notifications;
create policy notif_own on notifications for select to civicops_app using (user_id = app_uid());
drop policy if exists notif_own_update on notifications;
create policy notif_own_update on notifications for update to civicops_app using (user_id = app_uid()) with check (user_id = app_uid());
drop policy if exists notif_insert on notifications;
create policy notif_insert on notifications for insert to civicops_app with check (app_uid() is not null);

-- ---------- grants ----------
grant usage on schema public to civicops_app;
grant select on wards, localities, roads, road_traffic, facilities, flood_hotspots, contractors, rate_card,
  hist_complaints, hist_work_orders, hist_work_order_complaints, hist_accidents, hist_rainfall, hist_tides,
  departments, categories, routing_rules, sla_policies, memberships, import_runs, import_issues to civicops_app;
-- Column-level grant: the application role can never read password hashes or phone numbers.
grant select (id, name, role, locale, is_demo) on users to civicops_app;
grant select, insert, update on tickets, evidence, evidence_assessments, notifications, ticket_links,
  ticket_followers, social_posts to civicops_app;
grant select, insert on ticket_events, review_decisions, audit_log to civicops_app;
grant insert, update on routing_rules, sla_policies to civicops_app;
grant usage, select on all sequences in schema public to civicops_app;

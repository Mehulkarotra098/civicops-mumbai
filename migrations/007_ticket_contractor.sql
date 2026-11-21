-- Who is doing the work: the contractor (crew) a ward assigns to a live ticket, next to the named officer.
alter table tickets add column if not exists contractor_id text references contractors(contractor_id);

-- Residents can never change who is assigned (officer or contractor).
create or replace function tickets_resident_contractor_guard() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('app.role', true), '') = 'resident' and new.contractor_id is distinct from old.contractor_id then
    raise exception 'Residents cannot change routing, priority or deadlines' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists tickets_contractor_guard_trg on tickets;
create trigger tickets_contractor_guard_trg before update on tickets
  for each row execute function tickets_resident_contractor_guard();

-- Demo/backfill: tickets that already have an officer get a contractor that works in their ward.
update tickets t set contractor_id = (
  select c.contractor_id from contractors c where t.ward_code = any(c.active_wards) order by c.contractor_id limit 1)
where t.assigned_officer_id is not null and t.contractor_id is null and t.ward_code is not null;

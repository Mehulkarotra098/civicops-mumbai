-- Duplicate detection must look across all residents' tickets, but residents may only read
-- their own rows. This function returns non-identifying fields only (no reporter, no text,
-- no photos), so it is safe to expose to the application role.
create or replace function nearby_active_tickets(p_category text, p_lat double precision, p_lon double precision, p_since timestamptz)
returns table (id uuid, ref text, status text, lat double precision, lon double precision, submitted_at timestamptz, title text)
language sql stable security definer as $$
  select t.id, t.ref, t.status, t.lat, t.lon, t.submitted_at, t.title
  from tickets t
  where t.category_code = p_category
    and t.status in ('submitted', 'assigned', 'acknowledged', 'in_progress', 'awaiting_verification', 'needs_info')
    and t.lat between p_lat - 0.004 and p_lat + 0.004
    and t.lon between p_lon - 0.004 and p_lon + 0.004
    and t.submitted_at > p_since
$$;
grant execute on function nearby_active_tickets(text, double precision, double precision, timestamptz) to civicops_app;

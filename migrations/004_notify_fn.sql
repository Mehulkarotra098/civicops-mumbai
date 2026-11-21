-- Notifications are addressed to other people (a resident's report alerts the ward team), but the
-- application role may only read its own notifications. Inserts therefore go through this
-- definer function, which de-duplicates by key so scheduler retries never send twice.
create or replace function enqueue_notification(p_user uuid, p_ticket uuid, p_kind text, p_title text, p_body text, p_key text, p_at timestamptz)
returns boolean
language plpgsql security definer as $$
declare
  n integer;
begin
  if app_uid() is null and app_role() <> 'system' then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  insert into notifications (user_id, ticket_id, kind, title, body, dedupe_key, created_at)
  values (p_user, p_ticket, p_kind, p_title, p_body, p_key, p_at)
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end $$;
grant execute on function enqueue_notification(uuid, uuid, text, text, text, text, timestamptz) to civicops_app;

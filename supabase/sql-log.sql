-- =====================================================================
-- sql-log.sql: everything run in the Supabase SQL Editor, in order.
-- Run top to bottom on an empty project to rebuild the backend.
-- The old open anon policies (read, insert, update, delete) are left out
-- on purpose, because Block B at the bottom removes them.
-- =====================================================================

-- 1. Quotes table
create table quotes (
  ref text primary key,
  customer_name text,
  date date,
  valid_until date,
  line_items jsonb default '[]',
  notes text,
  gallery jsonb default '[]',
  status text default 'draft',
  response jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table quotes enable row level security;

-- 2. Hide and short links
alter table quotes add column if not exists hidden boolean not null default false;
alter table quotes add column if not exists short_slug text;
create unique index if not exists quotes_short_slug_idx on quotes (short_slug) where short_slug is not null;

-- 3. View tracking
alter table quotes add column if not exists first_viewed_at timestamptz;
alter table quotes add column if not exists last_viewed_at timestamptz;
alter table quotes add column if not exists view_count integer not null default 0;

-- 4. Settings table (single row)
create table if not exists settings (
  id integer primary key default 1 check (id = 1),
  business_name text,
  phone text,
  email text,
  address text,
  default_terms text,
  quote_valid_days integer not null default 14,
  reminder_days integer not null default 5,
  updated_at timestamptz default now()
);
alter table settings enable row level security;
insert into settings (id) values (1) on conflict (id) do nothing;

-- 5. BLOCK A: customer functions and authenticated policy
do $$
begin
  create unique index if not exists quotes_short_slug_key
    on public.quotes (short_slug) where short_slug is not null;
exception when others then
  raise notice 'Could not create the unique index on short_slug (%). Carrying on.', sqlerrm;
end $$;

create or replace function public.get_quote(p_slug text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
           'ref', q.ref, 'customer_name', q.customer_name, 'date', q.date,
           'valid_until', q.valid_until, 'line_items', q.line_items, 'notes', q.notes,
           'gallery', q.gallery, 'status', q.status, 'response', q.response,
           'short_slug', q.short_slug)
    from public.quotes q
   where q.short_slug = p_slug and length(p_slug) >= 6
   limit 1;
$$;

create or replace function public.record_view(p_slug text)
returns void language sql security definer set search_path = ''
as $$
  update public.quotes
     set view_count = view_count + 1,
         last_viewed_at = now(),
         first_viewed_at = coalesce(first_viewed_at, now())
   where short_slug = p_slug and length(p_slug) >= 6;
$$;

create or replace function public.submit_decision(
  p_slug text, p_decision text, p_reason text default null, p_reason_category text default null)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if p_decision is null or p_decision not in ('accepted', 'declined')
     or p_slug is null or length(p_slug) < 6 then
    return false;
  end if;
  update public.quotes
     set status = p_decision,
         response = jsonb_build_object(
           'decision', p_decision,
           'reason', left(btrim(coalesce(p_reason, '')), 2000),
           'reason_category', nullif(left(btrim(coalesce(p_reason_category, '')), 100), ''),
           'respondedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
         updated_at = now()
   where short_slug = p_slug and status = 'sent';
  return found;
end;
$$;

revoke all on function public.get_quote(text) from public;
revoke all on function public.record_view(text) from public;
revoke all on function public.submit_decision(text, text, text, text) from public;
grant execute on function public.get_quote(text) to anon, authenticated;
grant execute on function public.record_view(text) to anon, authenticated;
grant execute on function public.submit_decision(text, text, text, text) to anon, authenticated;

do $$
declare
  t text;
  v_check text := $c$coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false$c$;
begin
  foreach t in array array['quotes', 'settings'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'Table public.% does not exist, skipping it.', t;
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', 'authenticated users only', t);
    execute format('create policy %I on public.%I for all to authenticated using (%s) with check (%s)',
                   'authenticated users only', t, v_check, v_check);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- 6. BLOCK B: back up and remove the open anon policies, lock to logged-in users
do $$
declare
  t text;
  r record;
  v_check text := $c$coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false$c$;
begin
  create table if not exists public._policy_backup (
    id bigserial primary key, backed_up_at timestamptz not null default now(),
    tablename text, policyname text, permissive text,
    roles text[], cmd text, qual text, with_check text);
  alter table public._policy_backup enable row level security;

  foreach t in array array['quotes', 'settings'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'Table public.% does not exist, skipping it.', t;
      continue;
    end if;

    insert into public._policy_backup (tablename, policyname, permissive, roles, cmd, qual, with_check)
      select tablename, policyname, permissive, roles::text[], cmd, qual, with_check
        from pg_policies
       where schemaname = 'public' and tablename = t and roles && array['anon', 'public']::name[];

    for r in select policyname from pg_policies
              where schemaname = 'public' and tablename = t and roles && array['anon', 'public']::name[]
    loop
      execute format('drop policy %I on public.%I', r.policyname, t);
      raise notice 'Dropped policy "%" on public.%', r.policyname, t;
    end loop;

    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'authenticated users only', t);
    execute format('create policy %I on public.%I for all to authenticated using (%s) with check (%s)',
                   'authenticated users only', t, v_check, v_check);
    raise notice 'Locked down public.%', t;
  end loop;
end $$;

select tablename, policyname, roles, cmd from pg_policies
 where schemaname = 'public' and tablename in ('quotes', 'settings') order by 1, 2;

-- 7. 2026-10-16: tighter submit_decision (replaces the version in section 5)
-- Same signature and grants. It now:
--   * accepts only 'accepted' or 'declined',
--   * accepts a reason_category only if it exactly matches an entry in v_allowed (or is null),
--   * trims the reason and caps it at 1000 characters,
--   * refuses (returns false) once valid_until has passed, comparing against today's date in Europe/London
--     (a quote is valid up to and including its valid_until date),
--   * still only works while the quote's status is 'sent'.
-- get_quote is unchanged, so expired quotes are still returned and the page can say they have expired.
--
-- v_allowed is EMPTY because the decline form has no category chips yet, so right now only a null category is
-- accepted (which is all the page sends). When chips are added, put their labels in v_allowed exactly as the
-- page sends them (for example array['Price', 'Timing', ...]) and run this section again.
-- To undo this section, run the submit_decision definition from section 5 again.
create or replace function public.submit_decision(
  p_slug text, p_decision text, p_reason text default null, p_reason_category text default null)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_allowed constant text[] := array[]::text[];   -- <- the decline chip labels go here
  v_reason  text;
begin
  if p_slug is null or length(p_slug) < 6 then
    return false;
  end if;
  if p_decision is null or p_decision not in ('accepted', 'declined') then
    return false;
  end if;
  if p_reason_category is not null and not (p_reason_category = any (v_allowed)) then
    return false;
  end if;

  v_reason := left(btrim(coalesce(p_reason, ''), E' \t\r\n'), 1000);

  update public.quotes q
     set status = p_decision,
         response = jsonb_build_object(
           'decision', p_decision,
           'reason', v_reason,
           'reason_category', p_reason_category,
           'respondedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
         updated_at = now()
   where q.short_slug = p_slug
     and q.status = 'sent'
     and (q.valid_until is null or q.valid_until >= (now() at time zone 'Europe/London')::date);

  return found;
end;
$$;

revoke all on function public.submit_decision(text, text, text, text) from public;
grant execute on function public.submit_decision(text, text, text, text) to anon, authenticated;

-- 8. 2026-10-16: chase / snooze tracking on quotes (already run by hand in the SQL editor)
-- last_chased_at : when someone last followed this quote up ("Chased" / "Mark as chased").
-- snoozed_until  : the quote is kept out of Needs attention and Reminders until this moment passes.
-- Both are nullable and admin-only. get_quote builds its output from an explicit key list (ref, customer_name,
-- date, valid_until, line_items, notes, gallery, status, response, short_slug), so these two columns are NOT
-- returned to customers and nothing needs to change there. The existing "authenticated users only" policy
-- already covers the new columns for signed-in users; anonymous visitors still have no direct table access.
alter table public.quotes add column if not exists last_chased_at timestamptz;
alter table public.quotes add column if not exists snoozed_until  timestamptz;
-- To undo: alter table public.quotes drop column last_chased_at, drop column snoozed_until;

-- 9. 2026-10-16: get_quote returns only an allowlist of the response keys
-- Staff can now record a decision on a customer's behalf, and that response object carries internal keys
-- (method, staff_note, recorded_by). The customer page is reached with just the short link, so get_quote must never
-- hand those over. The response is now built from an allowlist: decision, respondedAt, reason, reason_category,
-- source. These are every response key the customer pages read or that a customer's own submit_decision writes
-- (the pages themselves read only decision and reason). Anything else stored in response stays admin-only.
-- Same signature, same grants, same other keys as section 4 (ref, customer_name, date, valid_until, line_items, notes,
-- gallery, status, short_slug); last_chased_at / snoozed_until are still not returned.
-- To undo: run the get_quote definition from section 4 again.
create or replace function public.get_quote(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'ref',           q.ref,
           'customer_name', q.customer_name,
           'date',          q.date,
           'valid_until',   q.valid_until,
           'line_items',    q.line_items,
           'notes',         q.notes,
           'gallery',       q.gallery,
           'status',        q.status,
           'response',      case when jsonb_typeof(q.response) = 'object' then
                              (select coalesce(jsonb_object_agg(r.key, r.value), '{}'::jsonb)
                                 from jsonb_each(q.response) r
                                where r.key in ('decision', 'respondedAt', 'reason', 'reason_category', 'source'))
                            else null end,
           'short_slug',    q.short_slug)
    from public.quotes q
   where q.short_slug = p_slug
     and length(p_slug) >= 6
   limit 1;
$$;

revoke all on function public.get_quote(text) from public;
grant execute on function public.get_quote(text) to anon, authenticated;

-- 12. 2026-10-19: get_business(): the public business details for the customer pages and the notification email
-- The customer pages (and the notify-decision function) show the business name from the Settings page. Customers can't read
-- the settings table, so this function hands over just the four fields that already appear on printed quotes:
-- business_name, phone, email, address. It never returns default_terms or any other setting. If it is missing or fails the
-- pages fall back to "Floors for Living". To undo: drop function public.get_business();
create or replace function public.get_business()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'business_name', s.business_name,
           'phone',         s.phone,
           'email',         s.email,
           'address',       s.address)
    from public.settings s
   where s.id = 1;
$$;

revoke all on function public.get_business() from public;
grant execute on function public.get_business() to anon, authenticated;

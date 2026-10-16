-- ============================================================================
-- BLOCK A — customer functions + login access     RUN: NOW, before the new
--                                                  code is merged.
-- ----------------------------------------------------------------------------
-- Only adds things. Nothing the current (old) site uses is changed, so this is
-- safe to run while the old code is live. It adds:
--   * the three customer functions the new customer pages call instead of
--     reading the quotes table directly, and
--   * a policy that lets signed-in (authenticated) users read and write, so the
--     new admin login works the moment the new code is live, even before
--     Block B. The old site only uses the anon role, so it doesn't notice.
--
-- The functions are SECURITY DEFINER (they run as the table owner, so they work
-- even once anon has no table access), pin search_path, and take the random
-- short slug only. Never the guessable quote ref.
-- ============================================================================

-- One quote per slug (also makes the lookup fast). Skipped with a notice if
-- duplicate slugs already exist.
do $$
begin
  create unique index if not exists quotes_short_slug_key
    on public.quotes (short_slug) where short_slug is not null;
exception when others then
  raise notice 'Could not create the unique index on short_slug (%). Carrying on.', sqlerrm;
end $$;

-- get_quote(slug): that one quote, customer-facing fields only.
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
           'response',      q.response,
           'short_slug',    q.short_slug)
    from public.quotes q
   where q.short_slug = p_slug
     and length(p_slug) >= 6
   limit 1;
$$;

-- record_view(slug): atomic view counter (no read-modify-write race).
create or replace function public.record_view(p_slug text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.quotes
     set view_count      = view_count + 1,
         last_viewed_at  = now(),
         first_viewed_at = coalesce(first_viewed_at, now())
   where short_slug = p_slug
     and length(p_slug) >= 6;
$$;

-- submit_decision(slug, decision, reason, reason_category):
-- only works while the quote is still 'sent', so an accepted/declined quote can
-- never be changed. Returns true if the decision was recorded.
-- It writes status + response in the same shape the notify-decision webhook
-- already reads (record.status, record.response.reason), and it is a normal
-- UPDATE on quotes, so the database webhook fires exactly as before.
create or replace function public.submit_decision(
  p_slug            text,
  p_decision        text,
  p_reason          text default null,
  p_reason_category text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_decision is null or p_decision not in ('accepted', 'declined')
     or p_slug is null or length(p_slug) < 6 then
    return false;
  end if;

  update public.quotes
     set status     = p_decision,
         response   = jsonb_build_object(
                        'decision',        p_decision,
                        'reason',          left(btrim(coalesce(p_reason, '')), 2000),
                        'reason_category', nullif(left(btrim(coalesce(p_reason_category, '')), 100), ''),
                        'respondedAt',     to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
         updated_at = now()
   where short_slug = p_slug
     and status = 'sent';

  return found;
end;
$$;

-- Only the intended callers may execute them.
revoke all on function public.get_quote(text)                       from public;
revoke all on function public.record_view(text)                     from public;
revoke all on function public.submit_decision(text, text, text, text) from public;
grant execute on function public.get_quote(text)                       to anon, authenticated;
grant execute on function public.record_view(text)                     to anon, authenticated;
grant execute on function public.submit_decision(text, text, text, text) to anon, authenticated;

-- Signed-in users get full access to quotes (and settings, if that table exists).
-- This does not remove or change any existing policy; Block B does that later.
-- It also refuses Supabase "anonymous sign-in" users, which share the
-- authenticated role.
do $$
declare
  t       text;
  v_check text := $c$coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false$c$;
begin
  foreach t in array array['quotes', 'settings'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'Table public.% does not exist, skipping it.', t;
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', 'authenticated users only', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (%s) with check (%s)',
      'authenticated users only', t, v_check, v_check);
  end loop;
end $$;

-- Make the API pick up the new functions straight away.
notify pgrst, 'reload schema';

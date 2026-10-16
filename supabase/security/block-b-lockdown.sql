-- ============================================================================
-- BLOCK B — lock the tables down           RUN: ONLY AFTER the new code is
--                                          merged, live, and you have checked
--                                          that you can log in and a customer
--                                          link loads.
-- ----------------------------------------------------------------------------
-- The OLD site stops working the moment this runs (it reads/writes the tables
-- with the anon key). The NEW site keeps working: admins use their login, and
-- customers use the Block A functions.
-- (Block A already added the signed-in policy; this block re-creates it so it
-- is safe to run on its own.)
--
-- What it does, for public.quotes and public.settings (a table that doesn't
-- exist is skipped with a notice):
--   1. saves a copy of every policy that applies to anon/public (for Block C),
--   2. drops those policies (select / insert / update / delete, whatever they
--      are called),
--   3. makes sure row level security is on,
--   4. adds one policy that lets only signed-in (authenticated) users do
--      everything. It also refuses Supabase "anonymous sign-in" users, which
--      share the authenticated role.
-- Safe to run twice.
-- ============================================================================
do $$
declare
  t       text;
  r       record;
  v_check text := $c$coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false$c$;
begin
  create table if not exists public._policy_backup (
    id          bigserial primary key,
    backed_up_at timestamptz not null default now(),
    tablename   text, policyname text, permissive text,
    roles       text[], cmd text, qual text, with_check text
  );
  alter table public._policy_backup enable row level security;   -- no policies: not readable through the API

  foreach t in array array['quotes', 'settings'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'Table public.% does not exist, skipping it.', t;
      continue;
    end if;

    insert into public._policy_backup (tablename, policyname, permissive, roles, cmd, qual, with_check)
      select tablename, policyname, permissive, roles::text[], cmd, qual, with_check
        from pg_policies
       where schemaname = 'public' and tablename = t
         and roles && array['anon', 'public']::name[];

    for r in
      select policyname from pg_policies
       where schemaname = 'public' and tablename = t
         and roles && array['anon', 'public']::name[]
    loop
      execute format('drop policy %I on public.%I', r.policyname, t);
      raise notice 'Dropped policy "%" on public.%', r.policyname, t;
    end loop;

    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'authenticated users only', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (%s) with check (%s)',
      'authenticated users only', t, v_check, v_check);
    raise notice 'Locked down public.%', t;
  end loop;
end $$;

-- Check: every remaining policy should say {authenticated}, never anon/public.
select tablename, policyname, roles, cmd
  from pg_policies
 where schemaname = 'public' and tablename in ('quotes', 'settings')
 order by tablename, policyname;

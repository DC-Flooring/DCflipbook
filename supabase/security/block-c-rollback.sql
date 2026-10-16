-- ============================================================================
-- BLOCK C — rollback                       RUN: ONLY IF something breaks after
--                                          Block B and you need the old open
--                                          access back.
-- ----------------------------------------------------------------------------
-- Re-creates the anon/public policies exactly as Block B saved them (in
-- public._policy_backup). If no backup exists for a table it falls back to
-- fully open anon access for that table, which is how it was before.
--
-- It does NOT remove the "authenticated users only" policy, so the new site
-- (login) AND the old site (anon key) both work again while you investigate.
-- The Block A functions are left in place, they are harmless.
--
-- To re-lock afterwards, run Block B again.
-- ============================================================================
do $$
declare
  t text;
  r record;
  n int;
begin
  foreach t in array array['quotes', 'settings'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'Table public.% does not exist, skipping it.', t;
      continue;
    end if;

    n := 0;
    if to_regclass('public._policy_backup') is not null then
      for r in
        select distinct on (policyname) *
          from public._policy_backup
         where tablename = t
         order by policyname, id desc
      loop
        execute format('drop policy if exists %I on public.%I', r.policyname, t);
        execute format(
          'create policy %I on public.%I as %s for %s to %s%s%s',
          r.policyname, t, r.permissive, r.cmd,
          (select string_agg(quote_ident(x), ', ') from unnest(r.roles) x),
          case when r.qual       is not null then ' using (' || r.qual || ')'            else '' end,
          case when r.with_check is not null then ' with check (' || r.with_check || ')' else '' end);
        n := n + 1;
      end loop;
    end if;

    if n = 0 then
      raise notice 'No saved policies for public.%, restoring fully open anon access.', t;
      execute format('drop policy if exists %I on public.%I', 'rollback: open anon access', t);
      execute format('create policy %I on public.%I for all to anon using (true) with check (true)',
                     'rollback: open anon access', t);
    else
      raise notice 'Restored % policy(ies) on public.%', n, t;
    end if;
  end loop;
end $$;

select tablename, policyname, roles, cmd
  from pg_policies
 where schemaname = 'public' and tablename in ('quotes', 'settings')
 order by tablename, policyname;

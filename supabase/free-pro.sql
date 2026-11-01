-- Free app with Pro sections (November 2026). Run after subscription.sql.
-- The app itself is free for every signed-in account: the daily program text, saving progress, reminders and the
-- social features no longer need a subscription. Only the "Pro" sections need one; the admin picks them in the
-- admin panel (setting "pro", default: period calendar, pregnancy/postpartum, exercise, sugar-free recipes).
-- uzhu_access_for / uzhu_has_access keep their meaning, now read as "has Pro": admin, a trial or paid period that
-- has not ended (so everyone's current subscription, including the gifted week, keeps full access until it ends),
-- or a receipt waiting for review.

-- The daily program and the admin's day edits: any signed-in account.
drop policy if exists "program with access" on public.uzhu_program;
create policy "program signed in" on public.uzhu_program for select to authenticated using (true);
drop policy if exists "content readable" on public.uzhu_content;
create policy "content readable" on public.uzhu_content for select to anon, authenticated using (kind <> 'day' or (select auth.uid()) is not null);

-- Saving progress, push reminders and the social features: own rows only, no subscription needed.
drop policy if exists "own profile insert" on public.uzhu_profiles;
drop policy if exists "own profile update" on public.uzhu_profiles;
create policy "own profile insert" on public.uzhu_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own profile update" on public.uzhu_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "own push insert" on public.uzhu_push;
drop policy if exists "own push update" on public.uzhu_push;
create policy "own push insert" on public.uzhu_push for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own push update" on public.uzhu_push for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "own public insert" on public.uzhu_public;
drop policy if exists "own public update" on public.uzhu_public;
create policy "own public insert" on public.uzhu_public for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own public update" on public.uzhu_public for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "cheers insert" on public.uzhu_cheers;
create policy "cheers insert" on public.uzhu_cheers for insert to authenticated with check (char_length(text) <= 120 and (select auth.uid()) is not null);

-- Reminders go to every account again (not only to accounts with a subscription).
create or replace function public.uzhu_take_due(cutoff timestamptz default now()) returns table(endpoint text, keys jsonb, due jsonb)
language sql security definer set search_path = public as $$
  with d as (
    select p.endpoint, coalesce(jsonb_agg(i) filter (where (i->>'at')::timestamptz <= cutoff), '[]'::jsonb) as due
    from public.uzhu_push p
    cross join lateral jsonb_array_elements(case when jsonb_typeof(p.schedule) = 'array' then p.schedule else '[]'::jsonb end) i
    group by p.endpoint
    having bool_or((i->>'at')::timestamptz <= cutoff)
  ), u as (
    -- "keep" is recomputed from the row as it is at update time, so items added meanwhile survive.
    update public.uzhu_push p set schedule = (
      select coalesce(jsonb_agg(i), '[]'::jsonb) from jsonb_array_elements(case when jsonb_typeof(p.schedule) = 'array' then p.schedule else '[]'::jsonb end) i
      where (i->>'at')::timestamptz > cutoff)
    from d where p.endpoint = d.endpoint
    returning p.endpoint, p.keys, d.due
  ) select u.endpoint, u.keys, u.due from u;
$$;
revoke all on function public.uzhu_take_due(timestamptz) from public, anon, authenticated;
grant execute on function public.uzhu_take_due(timestamptz) to service_role;

-- New accounts start on the free app, without a Pro trial (trial_ends = sign-up time).
create or replace function public.uzhu_new_user_sub() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.uzhu_subs(user_id, trial_ends) values (new.id, coalesce(new.created_at, now())) on conflict do nothing;
  return new;
end $$;
revoke all on function public.uzhu_new_user_sub() from public, anon, authenticated;

-- The Pro sections (route names), editable in the admin panel (پنل مدیریت ← بخش‌های پرو).
insert into public.uzhu_settings(key, value) values ('pro', '{"sections": ["period", "pregnancy", "move", "recipes"]}') on conflict (key) do nothing;

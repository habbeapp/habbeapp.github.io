-- One-time gift (November 2026): every account gets 7 more days.
-- Whatever is left grows by a week (1 day left -> 8 days, a month left -> a month and 7 days);
-- accounts whose trial or subscription has already ended get 7 days from now.
-- The week is added to paid_until the same way the admin panel's "grant days" does (uzhu_admin_grant).
-- Safe to run again: uzhu_gifts records who already got the gift, so nobody gets it twice.
-- It also queues one push notification for each gifted account that has notifications on (sent by uzhu-send).

create table if not exists public.uzhu_gifts (
  user_id uuid not null references auth.users(id) on delete cascade,
  gift text not null, days int not null,
  granted_at timestamptz not null default now(), seen_at timestamptz,
  primary key (user_id, gift));
alter table public.uzhu_gifts enable row level security;
drop policy if exists "own gifts select" on public.uzhu_gifts;
create policy "own gifts select" on public.uzhu_gifts for select to authenticated using ((select auth.uid()) = user_id);

-- The signed-in user's newest gift that they have not acknowledged yet (null when none).
create or replace function public.uzhu_my_gift() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('gift', g.gift, 'days', g.days, 'until', greatest(s.trial_ends, coalesce(s.paid_until, '-infinity')))
  from public.uzhu_gifts g left join public.uzhu_subs s on s.user_id = g.user_id
  where g.user_id = auth.uid() and g.seen_at is null order by g.granted_at desc limit 1;
$$;
-- "متوجه شدم": the gift notice is not shown again, on any device.
create or replace function public.uzhu_gift_seen(p_gift text) returns void language sql security definer set search_path = public as $$
  update public.uzhu_gifts set seen_at = now() where user_id = auth.uid() and gift = p_gift and seen_at is null;
$$;
revoke all on function public.uzhu_my_gift() from public, anon;
revoke all on function public.uzhu_gift_seen(text) from public, anon;
grant execute on function public.uzhu_my_gift() to authenticated;
grant execute on function public.uzhu_gift_seen(text) to authenticated;

-- The gift itself, one statement: only accounts newly recorded in uzhu_gifts get the days and the notification.
insert into public.uzhu_subs(user_id, trial_ends) select id, now() from auth.users on conflict do nothing;
with g as (
  insert into public.uzhu_gifts(user_id, gift, days) select id, 'week-2026-11', 7 from auth.users
  on conflict do nothing returning user_id
), s as (
  update public.uzhu_subs s set paid_until = greatest(coalesce(s.paid_until, now()), s.trial_ends, now()) + interval '7 days', updated_at = now()
  from g where s.user_id = g.user_id returning s.user_id
), p as (
  update public.uzhu_push p set schedule = (case when jsonb_typeof(p.schedule) = 'array' then p.schedule else '[]'::jsonb end)
    || jsonb_build_array(jsonb_build_object('at', now(), 'text', '🎁 یک هفته اشتراک هدیه گرفتی! هر چقدر از اشتراکت مونده بود، حالا ۷ روز بیشتر شده.', 'url', './#today'))
  from g where p.user_id = g.user_id returning 1
) select (select count(*) from g) as gifted, (select count(*) from s) as extended, (select count(*) from p) as notified;

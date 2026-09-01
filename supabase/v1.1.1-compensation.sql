-- v1.1.1 카드팩 중복 보상 누락 보정
-- 패치 배포 시 한 번 실행합니다. 재실행해도 같은 계정에 중복 지급되지 않습니다.

begin;

create table if not exists public.game_patch_campaigns (
  patch_id text primary key,
  seeded_at timestamptz not null default now()
);

create table if not exists public.game_profile_patch_rewards (
  user_id uuid not null references public.profiles(id) on delete cascade,
  patch_id text not null references public.game_patch_campaigns(patch_id) on delete cascade,
  amount integer not null check (amount > 0),
  claimed_at timestamptz,
  primary key (user_id, patch_id)
);

alter table public.game_patch_campaigns enable row level security;
alter table public.game_profile_patch_rewards enable row level security;

drop policy if exists "patch campaigns are server only" on public.game_patch_campaigns;
create policy "patch campaigns are server only" on public.game_patch_campaigns
for all using (false) with check (false);

drop policy if exists "patch rewards are server only" on public.game_profile_patch_rewards;
create policy "patch rewards are server only" on public.game_profile_patch_rewards
for all using (false) with check (false);

-- 캠페인이 처음 만들어지는 바로 이 시점의 가입자만 지급 대상에 고정합니다.
with new_campaign as (
  insert into public.game_patch_campaigns (patch_id)
  values ('v1.1.1-duplicate-compensation')
  on conflict (patch_id) do nothing
  returning patch_id
)
insert into public.game_profile_patch_rewards (user_id, patch_id, amount)
select profiles.id, new_campaign.patch_id, 200
from public.profiles
cross join new_campaign
on conflict (user_id, patch_id) do nothing;

-- 이미 게임 프로필이 있는 계정에는 즉시 200P를 더하고 서버 버전도 올립니다.
with claimed as (
  update public.game_profile_patch_rewards rewards
  set claimed_at = now()
  where rewards.patch_id = 'v1.1.1-duplicate-compensation'
    and rewards.claimed_at is null
    and exists (
      select 1 from public.game_profiles profiles
      where profiles.user_id = rewards.user_id
    )
  returning rewards.user_id, rewards.amount
)
update public.game_profiles profiles
set currency = profiles.currency + claimed.amount,
    revision = profiles.revision + 1,
    updated_at = now()
from claimed
where profiles.user_id = claimed.user_id;

-- 가입은 했지만 아직 게임 프로필을 만들지 않은 계정은 첫 저장 때 자동 지급합니다.
create or replace function public.apply_pending_game_profile_patch_rewards()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reward_total integer;
begin
  select coalesce(sum(amount), 0)::integer into reward_total
  from public.game_profile_patch_rewards
  where user_id = new.user_id and claimed_at is null;

  if reward_total > 0 then
    new.currency := new.currency + reward_total;
    update public.game_profile_patch_rewards
    set claimed_at = now()
    where user_id = new.user_id and claimed_at is null;
  end if;

  return new;
end;
$$;

drop trigger if exists apply_pending_game_profile_patch_rewards on public.game_profiles;
create trigger apply_pending_game_profile_patch_rewards
before insert on public.game_profiles
for each row execute function public.apply_pending_game_profile_patch_rewards();

revoke all on table public.game_patch_campaigns from public, anon, authenticated;
revoke all on table public.game_profile_patch_rewards from public, anon, authenticated;
revoke all on function public.apply_pending_game_profile_patch_rewards() from public, anon, authenticated;

commit;

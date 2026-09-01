-- Politimon 일일 첫 로그인 출석 보상
-- game-profile-sync.sql 적용 후 Supabase SQL Editor에서 한 번 실행하세요.
-- v1.1.1-compensation.sql의 실행 여부와 관계없이 독립적으로 동작합니다.

alter table public.game_profiles
add column if not exists last_daily_login_date date;

create or replace function public.claim_daily_login_reward()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  reward_date date := timezone('Asia/Seoul', now())::date;
  reward_amount constant integer := 50;
  was_claimed boolean := false;
  result jsonb;
begin
  if actor is null then raise exception '로그인이 필요합니다'; end if;

  -- 이 조건부 UPDATE가 해당 사용자 행을 잠그므로 동시 요청도 한 번만 성공합니다.
  update public.game_profiles
  set currency = currency + reward_amount,
      last_daily_login_date = reward_date,
      revision = revision + 1,
      updated_at = now()
  where user_id = actor
    and last_daily_login_date is distinct from reward_date;
  was_claimed := found;

  select jsonb_build_object(
    'claimed', was_claimed,
    'amount', case when was_claimed then reward_amount else 0 end,
    'date', reward_date,
    'profile', jsonb_build_object(
      'collection', collection,
      'deck', deck,
      'currency', currency,
      'achievements', achievements,
      'claimedPvpMatches', claimed_pvp_matches,
      'records', records
    ),
    'seasonId', season_id,
    'revision', revision,
    'updatedAt', updated_at
  ) into result
  from public.game_profiles
  where user_id = actor;

  if result is null then raise exception '게임 프로필을 먼저 만들어야 합니다'; end if;
  return result;
end;
$$;

revoke all on function public.claim_daily_login_reward() from public, anon;
grant execute on function public.claim_daily_login_reward() to authenticated;

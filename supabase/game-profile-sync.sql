-- Politimon 계정별 게임 진행 상황 동기화
-- Supabase SQL Editor에서 기존 schema.sql 적용 후 실행해도 안전합니다.

create table if not exists public.game_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  collection jsonb not null default '{}'::jsonb check (jsonb_typeof(collection) = 'object'),
  deck jsonb not null default '[]'::jsonb check (jsonb_typeof(deck) = 'array'),
  currency integer not null default 250 check (currency >= 0),
  achievements jsonb not null default '{}'::jsonb check (jsonb_typeof(achievements) = 'object'),
  claimed_pvp_matches jsonb not null default '{}'::jsonb check (jsonb_typeof(claimed_pvp_matches) = 'object'),
  records jsonb not null default '{}'::jsonb check (jsonb_typeof(records) = 'object'),
  season_id text not null default 'season-1' check (char_length(season_id) between 1 and 40),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

alter table public.game_profiles enable row level security;
drop policy if exists "game profiles use authenticated rpc only" on public.game_profiles;
create policy "game profiles use authenticated rpc only"
on public.game_profiles for all
using (false) with check (false);

create or replace function public.get_game_profile()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'profile', jsonb_build_object(
      'collection', game_profiles.collection,
      'deck', game_profiles.deck,
      'currency', game_profiles.currency,
      'achievements', game_profiles.achievements,
      'claimedPvpMatches', game_profiles.claimed_pvp_matches,
      'records', game_profiles.records
    ),
    'seasonId', game_profiles.season_id,
    'revision', game_profiles.revision,
    'updatedAt', game_profiles.updated_at
  )
  from game_profiles
  where user_id = auth.uid();
$$;

create or replace function public.save_game_profile(
  p_profile jsonb,
  p_expected_revision bigint default null,
  p_season_id text default 'season-1'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  current_revision bigint;
  has_profile boolean;
  next_revision bigint;
  currency_value integer;
  result jsonb;
begin
  if actor is null then raise exception '로그인이 필요합니다'; end if;
  if p_profile is null or jsonb_typeof(p_profile) <> 'object' then raise exception '올바르지 않은 게임 프로필입니다'; end if;
  if octet_length(p_profile::text) > 500000 then raise exception '게임 프로필이 너무 큽니다'; end if;
  if coalesce(jsonb_typeof(p_profile->'collection'), '') <> 'object'
    or coalesce(jsonb_typeof(p_profile->'deck'), '') <> 'array'
    or coalesce(jsonb_typeof(p_profile->'achievements'), '') <> 'object'
    or coalesce(jsonb_typeof(p_profile->'claimedPvpMatches'), '') <> 'object'
    or coalesce(jsonb_typeof(p_profile->'records'), '') <> 'object'
  then raise exception '게임 프로필 구성 요소가 올바르지 않습니다'; end if;
  if jsonb_array_length(p_profile->'deck') > 100 then raise exception '덱 데이터가 너무 큽니다'; end if;
  if coalesce(p_profile->>'currency', '') !~ '^[0-9]{1,9}$' then raise exception '재화 값이 올바르지 않습니다'; end if;
  if p_season_id is null or char_length(p_season_id) not between 1 and 40 then raise exception '시즌 값이 올바르지 않습니다'; end if;

  currency_value := (p_profile->>'currency')::integer;
  select revision into current_revision
  from game_profiles
  where user_id = actor
  for update;
  has_profile := found;

  if has_profile then
    if p_expected_revision is null or p_expected_revision <> current_revision then
      raise exception 'game_profile_revision_conflict';
    end if;
    next_revision := current_revision + 1;
    update game_profiles set
      collection = p_profile->'collection',
      deck = p_profile->'deck',
      currency = currency_value,
      achievements = p_profile->'achievements',
      claimed_pvp_matches = p_profile->'claimedPvpMatches',
      records = p_profile->'records',
      season_id = p_season_id,
      revision = next_revision,
      updated_at = now()
    where user_id = actor;
  else
    if p_expected_revision is not null then raise exception 'game_profile_revision_conflict'; end if;
    next_revision := 1;
    insert into game_profiles (
      user_id, collection, deck, currency, achievements,
      claimed_pvp_matches, records, season_id, revision
    ) values (
      actor, p_profile->'collection', p_profile->'deck', currency_value,
      p_profile->'achievements', p_profile->'claimedPvpMatches',
      p_profile->'records', p_season_id, next_revision
    );
  end if;

  select jsonb_build_object(
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
  from game_profiles
  where user_id = actor;

  return result;
end;
$$;

revoke all on table public.game_profiles from public, anon, authenticated;
revoke all on function public.get_game_profile() from public, anon;
revoke all on function public.save_game_profile(jsonb, bigint, text) from public, anon;
grant execute on function public.get_game_profile() to authenticated;
grant execute on function public.save_game_profile(jsonb, bigint, text) to authenticated;

-- Politimon v1.1.2: 이름을 지정할 수 있는 최대 3개 덱 동기화
-- 기존 덱은 자동으로 "덱 1"에 보존됩니다. 반복 실행해도 안전합니다.

alter table public.game_profiles add column if not exists decks jsonb not null default '[]'::jsonb check (jsonb_typeof(decks) = 'array');
alter table public.game_profiles add column if not exists active_deck_id text not null default 'deck-1';
alter table public.game_profiles add column if not exists last_daily_login_date date;

update public.game_profiles
set decks=jsonb_build_array(jsonb_build_object('id','deck-1','name','덱 1','cards',deck)),
    active_deck_id='deck-1'
where jsonb_array_length(decks)=0;

create or replace function public.get_game_profile()
returns jsonb language sql security definer set search_path=public as $$
  select jsonb_build_object(
    'profile',jsonb_build_object(
      'collection',collection,'deck',deck,'decks',decks,'activeDeckId',active_deck_id,
      'currency',currency,'achievements',achievements,
      'claimedPvpMatches',claimed_pvp_matches,'records',records
    ),
    'seasonId',season_id,'revision',revision,'updatedAt',updated_at
  ) from public.game_profiles where user_id=auth.uid();
$$;

create or replace function public.save_game_profile(
  p_profile jsonb,
  p_expected_revision bigint default null,
  p_season_id text default 'season-1'
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  actor uuid:=auth.uid();
  current_revision bigint;
  next_revision bigint;
  currency_value integer;
  decks_value jsonb;
  active_deck_value text;
  result jsonb;
begin
  if actor is null then raise exception '로그인이 필요합니다'; end if;
  if p_profile is null or jsonb_typeof(p_profile)<>'object' then raise exception '올바르지 않은 게임 프로필입니다'; end if;
  if octet_length(p_profile::text)>500000 then raise exception '게임 프로필이 너무 큽니다'; end if;
  if coalesce(jsonb_typeof(p_profile->'collection'),'')<>'object'
    or coalesce(jsonb_typeof(p_profile->'deck'),'')<>'array'
    or coalesce(jsonb_typeof(p_profile->'achievements'),'')<>'object'
    or coalesce(jsonb_typeof(p_profile->'claimedPvpMatches'),'')<>'object'
    or coalesce(jsonb_typeof(p_profile->'records'),'')<>'object'
  then raise exception '게임 프로필 구성 요소가 올바르지 않습니다'; end if;

  decks_value:=case when jsonb_typeof(p_profile->'decks')='array' and jsonb_array_length(p_profile->'decks')>0
    then p_profile->'decks'
    else jsonb_build_array(jsonb_build_object('id','deck-1','name','덱 1','cards',p_profile->'deck')) end;
  active_deck_value:=coalesce(nullif(p_profile->>'activeDeckId',''),decks_value->0->>'id','deck-1');

  if jsonb_array_length(decks_value)>3 then raise exception '덱은 최대 3개까지 저장할 수 있습니다'; end if;
  if exists(select 1 from jsonb_array_elements(decks_value) slot
    where jsonb_typeof(slot)<>'object'
      or coalesce(jsonb_typeof(slot->'cards'),'')<>'array'
      or jsonb_array_length(slot->'cards')>100
      or char_length(coalesce(slot->>'id','')) not between 1 and 40
      or char_length(coalesce(slot->>'name','')) not between 1 and 20)
  then raise exception '덱 슬롯 데이터가 올바르지 않습니다'; end if;
  if not exists(select 1 from jsonb_array_elements(decks_value) slot where slot->>'id'=active_deck_value)
  then raise exception '사용 중인 덱을 찾을 수 없습니다'; end if;
  if jsonb_array_length(p_profile->'deck')>100 then raise exception '덱 데이터가 너무 큽니다'; end if;
  if coalesce(p_profile->>'currency','')!~'^[0-9]{1,9}$' then raise exception '재화 값이 올바르지 않습니다'; end if;
  if p_season_id is null or char_length(p_season_id) not between 1 and 40 then raise exception '시즌 값이 올바르지 않습니다'; end if;

  currency_value:=(p_profile->>'currency')::integer;
  select revision into current_revision from public.game_profiles where user_id=actor for update;
  if found then
    if p_expected_revision is null or p_expected_revision<>current_revision then raise exception 'game_profile_revision_conflict'; end if;
    next_revision:=current_revision+1;
    update public.game_profiles set
      collection=p_profile->'collection',deck=p_profile->'deck',decks=decks_value,active_deck_id=active_deck_value,
      currency=currency_value,achievements=p_profile->'achievements',claimed_pvp_matches=p_profile->'claimedPvpMatches',
      records=p_profile->'records',season_id=p_season_id,revision=next_revision,updated_at=now()
    where user_id=actor;
  else
    if p_expected_revision is not null then raise exception 'game_profile_revision_conflict'; end if;
    next_revision:=1;
    insert into public.game_profiles(user_id,collection,deck,decks,active_deck_id,currency,achievements,claimed_pvp_matches,records,season_id,revision)
    values(actor,p_profile->'collection',p_profile->'deck',decks_value,active_deck_value,currency_value,p_profile->'achievements',p_profile->'claimedPvpMatches',p_profile->'records',p_season_id,next_revision);
  end if;

  select jsonb_build_object(
    'profile',jsonb_build_object('collection',collection,'deck',deck,'decks',decks,'activeDeckId',active_deck_id,
      'currency',currency,'achievements',achievements,'claimedPvpMatches',claimed_pvp_matches,'records',records),
    'seasonId',season_id,'revision',revision,'updatedAt',updated_at
  ) into result from public.game_profiles where user_id=actor;
  return result;
end;
$$;

create or replace function public.claim_daily_login_reward()
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  actor uuid:=auth.uid();
  reward_date date:=timezone('Asia/Seoul',now())::date;
  reward_amount constant integer:=50;
  was_claimed boolean:=false;
  result jsonb;
begin
  if actor is null then raise exception '로그인이 필요합니다'; end if;
  update public.game_profiles set currency=currency+reward_amount,last_daily_login_date=reward_date,revision=revision+1,updated_at=now()
  where user_id=actor and last_daily_login_date is distinct from reward_date;
  was_claimed:=found;
  select jsonb_build_object(
    'claimed',was_claimed,'amount',case when was_claimed then reward_amount else 0 end,'date',reward_date,
    'profile',jsonb_build_object('collection',collection,'deck',deck,'decks',decks,'activeDeckId',active_deck_id,
      'currency',currency,'achievements',achievements,'claimedPvpMatches',claimed_pvp_matches,'records',records),
    'seasonId',season_id,'revision',revision,'updatedAt',updated_at
  ) into result from public.game_profiles where user_id=actor;
  if result is null then raise exception '게임 프로필을 먼저 만들어야 합니다'; end if;
  return result;
end;
$$;

revoke all on function public.get_game_profile() from public,anon;
revoke all on function public.save_game_profile(jsonb,bigint,text) from public,anon;
revoke all on function public.claim_daily_login_reward() from public,anon;
grant execute on function public.get_game_profile() to authenticated;
grant execute on function public.save_game_profile(jsonb,bigint,text) to authenticated;
grant execute on function public.claim_daily_login_reward() to authenticated;

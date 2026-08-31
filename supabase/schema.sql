-- Politimon: Supabase SQL Editor에서 한 번에 실행합니다.
-- public anon key만 프런트엔드에 넣고, service_role key는 절대 브라우저에 넣지 마세요.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 20),
  is_developer boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists is_developer boolean not null default false;

create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(left(new.raw_user_meta_data->>'display_name', 20), ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.create_profile_for_new_user();

create table if not exists public.gallery_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index if not exists gallery_posts_created_at_idx on public.gallery_posts (created_at desc);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 40),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  is_private boolean not null default false,
  password_hash text,
  max_players smallint not null default 2 check (max_players = 2),
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  created_at timestamptz not null default now(),
  check ((is_private and password_hash is not null) or (not is_private and password_hash is null))
);
create table if not exists public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_host boolean not null default false,
  ready boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
alter table public.room_members add column if not exists deck jsonb;

-- 전투 서버 함수가 확정한 행동만 남깁니다. 클라이언트가 피해량·승패를 쓰면 안 됩니다.
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid unique references public.rooms(id) on delete set null,
  state jsonb not null default '{}'::jsonb,
  turn_user_id uuid references public.profiles(id),
  status text not null default 'playing' check (status in ('playing', 'finished')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.matches add column if not exists version integer not null default 0;
create table if not exists public.match_actions (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  sequence_no integer not null,
  action jsonb not null,
  created_at timestamptz not null default now(),
  unique (match_id, sequence_no)
);

alter table public.profiles enable row level security;
alter table public.gallery_posts enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.matches enable row level security;
alter table public.match_actions enable row level security;

drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles for select using (true);
drop policy if exists "gallery is readable" on public.gallery_posts;
create policy "gallery is readable" on public.gallery_posts for select using (true);
drop policy if exists "signed in users create own posts" on public.gallery_posts;
create policy "signed in users create own posts" on public.gallery_posts for insert with check (auth.uid() = author_id);
drop policy if exists "authors update own posts" on public.gallery_posts;
create policy "authors update own posts" on public.gallery_posts for update using (auth.uid() = author_id);
drop policy if exists "authors delete own posts" on public.gallery_posts;
create policy "authors delete own posts" on public.gallery_posts for delete using (auth.uid() = author_id);

create or replace function public.delete_gallery_post(p_post_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if not exists (
    select 1 from gallery_posts post
    where post.id = p_post_id
      and (post.author_id = auth.uid() or exists (select 1 from profiles where id = auth.uid() and is_developer))
  ) then
    raise exception '글쓴이 본인 또는 개발자 계정만 글을 삭제할 수 있습니다';
  end if;
  delete from gallery_posts where id = p_post_id;
  if not found then raise exception '삭제할 글을 찾을 수 없습니다'; end if;
end;
$$;
grant execute on function public.delete_gallery_post(uuid) to authenticated;

-- 방 관련 테이블은 RPC로만 쓰며, 아래 직접 정책은 조회용으로도 열지 않습니다.
drop policy if exists "no direct room access" on public.rooms;
create policy "no direct room access" on public.rooms for select using (false);
drop policy if exists "no direct room member access" on public.room_members;
create policy "no direct room member access" on public.room_members for select using (false);

create or replace function public.room_snapshot(p_room_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'id', r.id, 'title', r.title, 'owner_id', r.owner_id, 'is_private', r.is_private,
    'max_players', r.max_players, 'status', r.status,
    'members', coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'display_name', p.display_name, 'ready', m.ready, 'is_host', m.is_host, 'deck', m.deck, 'deck_ready', jsonb_array_length(coalesce(m.deck, '[]'::jsonb)) = 10) order by m.joined_at) filter (where m.user_id is not null), '[]'::jsonb)
  ) from rooms r left join room_members m on m.room_id = r.id left join profiles p on p.id = m.user_id
  where r.id = p_room_id group by r.id;
$$;

create or replace function public.list_public_rooms()
returns table(id uuid, title text, is_private boolean, owner_name text, player_count bigint, max_players smallint)
language sql security definer set search_path = public as $$
  select r.id, r.title, r.is_private, p.display_name, count(m.user_id), r.max_players
  from rooms r join profiles p on p.id = r.owner_id left join room_members m on m.room_id = r.id
  where r.status = 'waiting'
  group by r.id, p.display_name order by r.created_at desc;
$$;

create or replace function public.create_room(p_title text, p_is_private boolean default false, p_password text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare new_room uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if p_is_private and (p_password !~ '^[0-9]{4}$') then raise exception '비밀번호는 숫자 4자리여야 합니다'; end if;
  insert into rooms (title, owner_id, is_private, password_hash)
  values (trim(p_title), auth.uid(), p_is_private, case when p_is_private then extensions.crypt(p_password, extensions.gen_salt('bf')) else null end)
  returning id into new_room;
  insert into room_members (room_id, user_id, is_host, ready) values (new_room, auth.uid(), true, true);
  return room_snapshot(new_room);
end;
$$;

create or replace function public.join_room(p_room_id uuid, p_password text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare target rooms%rowtype;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  select * into target from rooms where id = p_room_id for update;
  if not found or target.status <> 'waiting' then raise exception '입장 가능한 방이 아닙니다'; end if;
  if target.is_private and target.password_hash <> extensions.crypt(coalesce(p_password, ''), target.password_hash) then raise exception '비밀번호가 맞지 않습니다'; end if;
  if (select count(*) from room_members where room_id = p_room_id) >= target.max_players and not exists (select 1 from room_members where room_id=p_room_id and user_id=auth.uid()) then raise exception '방이 가득 찼습니다'; end if;
  insert into room_members (room_id, user_id) values (p_room_id, auth.uid()) on conflict (room_id, user_id) do nothing;
  return room_snapshot(p_room_id);
end;
$$;

create or replace function public.set_room_ready(p_room_id uuid, p_ready boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update room_members set ready = p_ready where room_id = p_room_id and user_id = auth.uid() and not is_host;
  if not found then raise exception '참가자만 준비 상태를 바꿀 수 있습니다'; end if;
  return room_snapshot(p_room_id);
end;
$$;

create or replace function public.set_room_deck(p_room_id uuid, p_deck jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if jsonb_typeof(p_deck) <> 'array' or jsonb_array_length(p_deck) <> 10 then
    raise exception 'PvP 덱은 카드 10장이어야 합니다';
  end if;
  update room_members set deck = p_deck where room_id = p_room_id and user_id = auth.uid();
  if not found then raise exception '이 방의 참가자가 아닙니다'; end if;
  return room_snapshot(p_room_id);
end;
$$;

create or replace function public.get_room(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if not exists (select 1 from room_members where room_id = p_room_id and user_id = auth.uid()) then
    raise exception '이 방의 참가자만 방 정보를 확인할 수 있습니다';
  end if;
  return room_snapshot(p_room_id);
end;
$$;

create or replace function public.leave_room(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare target rooms%rowtype; next_host uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  select * into target from rooms where id = p_room_id for update;
  if not found then return jsonb_build_object('deleted', true); end if;
  if target.status <> 'waiting' and not exists (select 1 from matches where room_id = p_room_id and status = 'finished') then
    raise exception '진행 중인 대전은 전투 화면의 방 나가기를 이용해 주세요';
  end if;
  if not exists (select 1 from room_members where room_id = p_room_id and user_id = auth.uid()) then raise exception '이 방의 참가자가 아닙니다'; end if;
  delete from room_members where room_id = p_room_id and user_id = auth.uid();
  if not exists (select 1 from room_members where room_id = p_room_id) then
    delete from rooms where id = p_room_id;
    return jsonb_build_object('deleted', true);
  end if;
  if target.owner_id = auth.uid() then
    select user_id into next_host from room_members where room_id = p_room_id order by joined_at limit 1;
    update rooms set owner_id = next_host where id = p_room_id;
    update room_members set is_host = (user_id = next_host), ready = case when user_id = next_host then true else ready end where room_id = p_room_id;
  end if;
  return jsonb_build_object('deleted', false);
end;
$$;

create or replace function public.start_room(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from rooms where id=p_room_id and owner_id=auth.uid() and status='waiting') then raise exception '방장만 시작할 수 있습니다'; end if;
  if (select count(*) from room_members where room_id=p_room_id) <> 2 or exists (select 1 from room_members where room_id=p_room_id and (not ready or jsonb_array_length(coalesce(deck, '[]'::jsonb)) <> 10)) then raise exception '두 명 모두 준비하고 10장 덱을 등록해야 합니다'; end if;
  update rooms set status='playing' where id=p_room_id;
  insert into matches (room_id) values (p_room_id) on conflict (room_id) do nothing;
  return room_snapshot(p_room_id);
end;
$$;

-- PvP 상태는 참여자만 읽을 수 있으며, 모든 변경은 아래 RPC로만 수행합니다.
drop policy if exists "match members can read matches" on public.matches;
create policy "match members can read matches" on public.matches for select using (
  exists (select 1 from room_members rm where rm.room_id = matches.room_id and rm.user_id = auth.uid())
);
drop policy if exists "match members can read actions" on public.match_actions;
create policy "match members can read actions" on public.match_actions for select using (
  exists (select 1 from matches ma join room_members rm on rm.room_id = ma.room_id where ma.id = match_actions.match_id and rm.user_id = auth.uid())
);

create or replace function public.match_snapshot(p_room_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'id', ma.id, 'room_id', ma.room_id, 'state', ma.state, 'turn_user_id', ma.turn_user_id,
    'status', ma.status, 'version', ma.version,
    'members', coalesce(jsonb_agg(jsonb_build_object('user_id', rm.user_id, 'display_name', pr.display_name, 'is_host', rm.is_host) order by rm.joined_at), '[]'::jsonb)
  )
  from matches ma join room_members rm on rm.room_id = ma.room_id join profiles pr on pr.id = rm.user_id
  where ma.room_id = p_room_id group by ma.id;
$$;

create or replace function public.get_match(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from room_members where room_id = p_room_id and user_id = auth.uid()) then
    raise exception '이 대전의 참가자만 전황을 확인할 수 있습니다';
  end if;
  return match_snapshot(p_room_id);
end;
$$;

create or replace function public.start_match(p_room_id uuid, p_state jsonb, p_turn_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare target matches%rowtype;
begin
  if not exists (select 1 from rooms where id=p_room_id and owner_id=auth.uid() and status='playing') then raise exception '방장만 PvP를 초기화할 수 있습니다'; end if;
  if jsonb_typeof(p_state) <> 'object' or coalesce(jsonb_array_length(p_state->'players'), 0) <> 2 then raise exception '올바르지 않은 초기 전투 상태입니다'; end if;
  if not exists (select 1 from room_members where room_id=p_room_id and user_id=p_turn_user_id) then raise exception '올바르지 않은 선공 플레이어입니다'; end if;
  select * into target from matches where room_id=p_room_id for update;
  if not found then insert into matches(room_id,state,turn_user_id) values(p_room_id,p_state,p_turn_user_id); else
    if target.state <> '{}'::jsonb then raise exception '이미 시작된 대전입니다'; end if;
    update matches set state=p_state, turn_user_id=p_turn_user_id, status='playing', version=1, updated_at=now() where id=target.id;
  end if;
  return match_snapshot(p_room_id);
end;
$$;

create or replace function public.submit_match_state(p_match_id uuid, p_expected_version integer, p_state jsonb, p_next_turn_user_id uuid, p_action jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare target matches%rowtype; actor uuid := auth.uid(); next_version integer;
begin
  if actor is null then raise exception '로그인이 필요합니다'; end if;
  select * into target from matches where id=p_match_id for update;
  if not found then raise exception '대전을 찾을 수 없습니다'; end if;
  if not exists (select 1 from room_members where room_id=target.room_id and user_id=actor) then raise exception '대전 참가자만 행동할 수 있습니다'; end if;
  if target.status <> 'playing' or target.turn_user_id <> actor then raise exception '상대 턴이거나 종료된 대전입니다'; end if;
  if target.version <> p_expected_version then raise exception '전황이 갱신되었습니다. 다시 시도해 주세요'; end if;
  if jsonb_typeof(p_state) <> 'object' or coalesce(jsonb_array_length(p_state->'players'), 0) <> 2 then raise exception '올바르지 않은 전투 상태입니다'; end if;
  if p_next_turn_user_id is not null and not exists (select 1 from room_members where room_id=target.room_id and user_id=p_next_turn_user_id) then raise exception '올바르지 않은 다음 턴 플레이어입니다'; end if;
  next_version := target.version + 1;
  update matches set state=p_state, turn_user_id=p_next_turn_user_id, status=case when (p_state->>'phase')='finished' then 'finished' else 'playing' end, version=next_version, updated_at=now() where id=target.id;
  insert into match_actions(match_id,actor_id,sequence_no,action) values(p_match_id,actor,next_version,coalesce(p_action, '{}'::jsonb));
  return match_snapshot(target.room_id);
end;
$$;

-- 어느 플레이어의 턴이든 탈주를 서버에서 승패로 확정하고, 탈주자는 방 멤버에서 제거합니다.
create or replace function public.forfeit_match(p_match_id uuid, p_expected_version integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target matches%rowtype;
  actor uuid := auth.uid();
  winner_id uuid;
  next_host uuid;
  loser_index integer;
  winner_index integer;
  next_version integer;
  member_list jsonb;
  next_state jsonb;
begin
  if actor is null then raise exception '로그인이 필요합니다'; end if;
  select * into target from matches where id = p_match_id for update;
  if not found then raise exception '대전을 찾을 수 없습니다'; end if;
  if target.status <> 'playing' then raise exception '이미 종료된 대전입니다'; end if;
  if target.version <> p_expected_version then raise exception '전황이 갱신되었습니다. 다시 시도해 주세요'; end if;

  select ordered.seat into loser_index from (
    select user_id, (row_number() over (order by is_host desc, joined_at, user_id) - 1)::integer as seat
    from room_members where room_id = target.room_id
  ) ordered where ordered.user_id = actor;
  select jsonb_agg(jsonb_build_object('user_id', room_members.user_id, 'display_name', profiles.display_name) order by room_members.is_host desc, room_members.joined_at, room_members.user_id)
  into member_list from room_members join profiles on profiles.id = room_members.user_id where room_members.room_id = target.room_id;
  if loser_index is null or jsonb_array_length(member_list) <> 2 then raise exception '두 명이 참가한 대전만 탈주 처리할 수 있습니다'; end if;

  winner_index := 1 - loser_index;
  select (member->>'user_id')::uuid into winner_id from jsonb_array_elements(member_list) with ordinality item(member, position) where position = winner_index + 1;
  next_version := target.version + 1;
  next_state := target.state;
  next_state := jsonb_set(next_state, '{pvpMembers}', member_list, true);
  next_state := jsonb_set(next_state, '{phase}', '"finished"'::jsonb, true);
  next_state := jsonb_set(next_state, '{winner}', to_jsonb(winner_index), true);
  next_state := jsonb_set(next_state, '{turn}', 'null'::jsonb, true);
  next_state := jsonb_set(next_state, '{actionAvailable}', 'false'::jsonb, true);
  next_state := jsonb_set(next_state, '{pvpForfeit}', jsonb_build_object('loserUserId', actor, 'winnerUserId', winner_id, 'penalty', 30), true);
  next_state := jsonb_set(next_state, '{pvpLastAction}', jsonb_build_object('actor', loser_index, 'type', 'forfeit', 'label', '상대가 대전에서 탈주했습니다.'), true);
  next_state := jsonb_set(next_state, '{log}', jsonb_build_array('상대가 대전에서 탈주했습니다. 승리로 처리됩니다.') || coalesce(next_state->'log', '[]'::jsonb), true);

  update matches set state = next_state, turn_user_id = null, status = 'finished', version = next_version, updated_at = now() where id = target.id;
  insert into match_actions(match_id, actor_id, sequence_no, action) values (target.id, actor, next_version, jsonb_build_object('type', 'forfeit', 'at', now()));

  delete from room_members where room_id = target.room_id and user_id = actor;
  if exists (select 1 from rooms where id = target.room_id and owner_id = actor) then
    select user_id into next_host from room_members where room_id = target.room_id order by joined_at, user_id limit 1;
    if next_host is not null then
      update rooms set owner_id = next_host where id = target.room_id;
      update room_members set is_host = (user_id = next_host) where room_id = target.room_id;
    end if;
  end if;
  return match_snapshot(target.room_id);
end;
$$;

grant execute on function public.list_public_rooms(), public.create_room(text, boolean, text), public.join_room(uuid, text), public.set_room_ready(uuid, boolean), public.set_room_deck(uuid, jsonb), public.get_room(uuid), public.leave_room(uuid), public.start_room(uuid), public.get_match(uuid), public.start_match(uuid, jsonb, uuid), public.submit_match_state(uuid, integer, jsonb, uuid, jsonb), public.forfeit_match(uuid, integer) to authenticated;
revoke all on function public.room_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.match_snapshot(uuid) from public, anon, authenticated;

-- Realtime > Replication에서도 rooms, room_members, matches, match_actions를 켜 주세요.
-- UI에서 새로고침 없이 반영하려면 backend.js에 해당 채널 구독을 추가합니다.

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

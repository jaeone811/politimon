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
    'members', coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'display_name', p.display_name, 'ready', m.ready, 'is_host', m.is_host) order by m.joined_at) filter (where m.user_id is not null), '[]'::jsonb)
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
  values (trim(p_title), auth.uid(), p_is_private, case when p_is_private then crypt(p_password, gen_salt('bf')) else null end)
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
  if target.is_private and target.password_hash <> crypt(coalesce(p_password, ''), target.password_hash) then raise exception '비밀번호가 맞지 않습니다'; end if;
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

create or replace function public.start_room(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from rooms where id=p_room_id and owner_id=auth.uid() and status='waiting') then raise exception '방장만 시작할 수 있습니다'; end if;
  if (select count(*) from room_members where room_id=p_room_id) <> 2 or exists (select 1 from room_members where room_id=p_room_id and not ready) then raise exception '두 명 모두 준비해야 합니다'; end if;
  update rooms set status='playing' where id=p_room_id;
  insert into matches (room_id) values (p_room_id) on conflict (room_id) do nothing;
  return room_snapshot(p_room_id);
end;
$$;

grant execute on function public.list_public_rooms(), public.create_room(text, boolean, text), public.join_room(uuid, text), public.set_room_ready(uuid, boolean), public.start_room(uuid) to authenticated, anon;
revoke all on function public.room_snapshot(uuid) from public, anon, authenticated;

-- Realtime > Replication에서도 rooms, room_members, matches, match_actions를 켜 주세요.
-- UI에서 새로고침 없이 반영하려면 backend.js에 해당 채널 구독을 추가합니다.

-- 방 만들기 오류 "function gen_salt(unknown) does not exist" 수정용입니다.
-- Supabase Dashboard > SQL Editor에서 이 파일 전체를 한 번 실행하세요.

create or replace function public.create_room(p_title text, p_is_private boolean default false, p_password text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare new_room uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if p_is_private and (p_password !~ '^[0-9]{4}$') then raise exception '비밀번호는 숫자 4자리여야 합니다'; end if;
  insert into rooms (title, owner_id, is_private, password_hash)
  values (trim(p_title), auth.uid(), p_is_private,
    case when p_is_private then extensions.crypt(p_password, extensions.gen_salt('bf')) else null end)
  returning id into new_room;
  insert into room_members (room_id, user_id, is_host, ready)
  values (new_room, auth.uid(), true, true);
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
  if (select count(*) from room_members where room_id = p_room_id) >= target.max_players
     and not exists (select 1 from room_members where room_id = p_room_id and user_id = auth.uid()) then
    raise exception '방이 가득 찼습니다';
  end if;
  insert into room_members (room_id, user_id) values (p_room_id, auth.uid())
  on conflict (room_id, user_id) do nothing;
  return room_snapshot(p_room_id);
end;
$$;

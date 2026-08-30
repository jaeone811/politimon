-- 빈 대기방 자동 삭제 및 방장 위임 기능입니다.
-- Supabase Dashboard > SQL Editor에서 이 파일 전체를 한 번 실행하세요.

create or replace function public.leave_room(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare target rooms%rowtype; next_host uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  select * into target from rooms where id = p_room_id for update;
  if not found then return jsonb_build_object('deleted', true); end if;
  if target.status <> 'waiting' then raise exception '게임이 시작된 방에서는 나갈 수 없습니다'; end if;
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

grant execute on function public.leave_room(uuid) to authenticated, anon;

-- 이미 남아 있는 빈 대기방을 한 번 정리합니다.
delete from public.rooms r
where r.status = 'waiting'
  and not exists (select 1 from public.room_members m where m.room_id = r.id);

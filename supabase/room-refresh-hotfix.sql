-- 멀티플레이 로비의 최신 참가자/준비 상태 새로고침 기능입니다.
-- Supabase Dashboard > SQL Editor에서 이 파일 전체를 한 번 실행하세요.

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

grant execute on function public.get_room(uuid) to authenticated, anon;

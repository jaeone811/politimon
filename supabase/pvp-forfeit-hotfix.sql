-- Politimon v1.0.1: PvP 탈주 처리와 종료된 방 나가기 보완
-- Supabase SQL Editor에서 이 파일 전체를 한 번 실행하세요.

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
    select user_id into next_host from room_members where room_id = p_room_id order by joined_at, user_id limit 1;
    update rooms set owner_id = next_host where id = p_room_id;
    update room_members set is_host = (user_id = next_host), ready = case when user_id = next_host then true else ready end where room_id = p_room_id;
  end if;
  return jsonb_build_object('deleted', false);
end;
$$;

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

grant execute on function public.leave_room(uuid), public.forfeit_match(uuid, integer) to authenticated;

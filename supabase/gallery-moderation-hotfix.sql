-- 글쓴이 본인과 개발자 계정의 갤러리 글 삭제 권한을 추가합니다.
-- Supabase Dashboard > SQL Editor에서 이 파일 전체를 한 번 실행하세요.

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

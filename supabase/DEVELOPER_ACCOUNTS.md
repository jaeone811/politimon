# 개발 테스트 계정 2개 만들기

이 파일의 목적은 서로 다른 브라우저에서 로그인해 멀티플레이 방 생성·입장·준비를 테스트할 계정 두 개를 만드는 것입니다.

## 가장 쉬운 방법: Supabase Dashboard

1. [Supabase Dashboard](https://supabase.com/dashboard)에서 프로젝트를 엽니다.
2. 왼쪽 `Authentication` → `Users`를 누릅니다.
3. `Add user`를 눌러 이메일과 비밀번호를 지정해 첫 번째 테스트 계정을 만듭니다.
4. 같은 방식으로 두 번째 계정을 만듭니다. 두 계정은 반드시 서로 다른 이메일이어야 합니다.
5. `SQL Editor` → `New query`에서 아래 SQL의 이메일 두 개를 방금 만든 값으로 바꾼 뒤 실행합니다.

```sql
insert into public.profiles (id, display_name, is_developer)
select
  id,
  coalesce(nullif(raw_user_meta_data->>'display_name', ''), split_part(email, '@', 1)),
  true
from auth.users
where email in ('dev-one@example.com', 'dev-two@example.com')
on conflict (id) do update
set is_developer = true;

-- 실행 결과가 모두 true인지 확인합니다.
select u.email, p.display_name, p.is_developer
from auth.users u
join public.profiles p on p.id = u.id
where u.email in ('dev-one@example.com', 'dev-two@example.com');
```

6. 게임을 브라우저 일반 창과 시크릿 창에 각각 열고, 계정 하나씩으로 로그인해 로비를 테스트합니다.

## 자동 생성 방법: Git Bash

`create-developer-accounts.mjs`는 두 계정을 자동으로 만들고 이메일 인증도 완료 상태로 설정합니다. 이 작업은 관리자 권한이 필요하므로 **Supabase Secret key 또는 legacy service_role 키를 사용합니다. 이 키는 절대 GitHub나 웹사이트 파일에 저장하지 마세요.**

Git Bash에서 프로젝트 폴더로 이동한 뒤 아래처럼 값을 입력합니다. `read -s`는 비밀번호를 화면에 표시하지 않습니다.

```bash
export SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
read -rsp "Supabase secret/service_role key: " SUPABASE_SECRET_KEY; echo
read -rp "첫 번째 계정 이메일: " POLITIMON_DEV_1_EMAIL
read -rsp "첫 번째 계정 비밀번호: " POLITIMON_DEV_1_PASSWORD; echo
read -rp "두 번째 계정 이메일: " POLITIMON_DEV_2_EMAIL
read -rsp "두 번째 계정 비밀번호: " POLITIMON_DEV_2_PASSWORD; echo
node supabase/create-developer-accounts.mjs
```

성공 후에는 현재 Git Bash 창에서 키와 비밀번호 변수를 지웁니다.

```bash
unset SUPABASE_URL SUPABASE_SECRET_KEY POLITIMON_DEV_1_EMAIL POLITIMON_DEV_1_PASSWORD POLITIMON_DEV_2_EMAIL POLITIMON_DEV_2_PASSWORD
```

## 꼭 알아둘 보안 기준

- `is_developer`는 테스트 계정을 식별하는 표식일 뿐입니다. 게임 권한이나 승패를 이 프런트엔드 값으로 판단하면 안 됩니다.
- `supabase-config.js`에는 `sb_publishable_...` 또는 legacy `anon` 키만 넣습니다.
- `sb_secret_...` 또는 legacy `service_role` 키는 RLS를 우회하므로, 이 일회성 계정 생성 작업 외에는 브라우저·Cloudflare Pages·GitHub에 넣지 않습니다.

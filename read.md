# 로그인·멀티플레이·갤러리 배포 안내

이 프로젝트는 **Cloudflare Pages(게임 웹사이트)** + **Supabase(로그인·글·방 정보)** 구조입니다. 카드 이미지와 HTML/CSS/JS는 Cloudflare가 빠르게 보여 주고, 계정·게시글·멀티플레이 방은 Supabase가 보관합니다.

## 먼저 알아둘 점

- 현재 파일만으로는 `index.html`을 열어 UI를 검토할 수 있습니다. 이때 로그인·글·방은 **현재 브라우저 안에서만** 보이는 미리보기입니다.
- 아래 설정을 완료하면 아이디·비밀번호 로그인, 갤러리 글 공유, 방 생성/비밀번호/준비/시작 상태가 실제 Supabase 프로젝트에 저장됩니다.
- `service_role` 키는 관리자 비밀번호와 같습니다. 어떤 파일·GitHub·Cloudflare에도 넣지 않습니다. `anon` 또는 `publishable` 키만 `supabase-config.js`에 넣습니다.
- 아래 설정까지 마치면 로비뿐 아니라 실제 PvP 전투도 즉시 동기화됩니다. 같은 `GameEngine` 규칙으로 계산한 카드·HP·상태·토큰·손패·덱 순서와 전황 기록을 두 화면에 표시합니다.

## 1. GitHub에 프로젝트 올리기

사이트: <https://github.com>

1. GitHub 회원가입 또는 로그인을 합니다.
2. 오른쪽 위 `+` → `New repository`를 누릅니다.
3. 이름은 예를 들어 `politimon`으로 적고 `Create repository`를 누릅니다.
4. 이 폴더의 파일을 저장소에 올립니다. Git을 쓰지 않는 경우 웹 화면의 `Add file` → `Upload files`로 프로젝트 안의 파일과 `assets` 폴더를 끌어다 놓고 `Commit changes`를 누르면 됩니다.
5. `supabase-config.js`는 아직 빈 값 그대로 올립니다. 나중에 Supabase 값을 넣은 뒤 다시 올립니다.

`politimon-web-game.zip`은 배포에 필요하지 않은 백업 파일입니다. 용량을 아끼려면 GitHub에는 올리지 않아도 됩니다.

## 2. Supabase 프로젝트 만들기

사이트: <https://supabase.com/dashboard>

1. `New project`를 누릅니다.
2. 조직을 고르고, 프로젝트 이름을 `politimon`으로 입력합니다.
3. 데이터베이스 비밀번호를 만듭니다. 이 비밀번호는 안전한 곳에 보관하고 코드에는 적지 않습니다.
4. 지역은 한국 이용자가 많다면 가까운 지역을 고르고 `Create new project`를 누릅니다. 준비가 끝날 때까지 잠시 기다립니다.
5. 왼쪽 메뉴 `SQL Editor` → `New query`를 누릅니다.
6. 이 프로젝트의 [supabase/schema.sql](supabase/schema.sql)를 전부 복사해 붙여넣고 `Run`을 누릅니다. 성공 메시지가 나오면 게시판, 방, PvP 매치·행동 기록 테이블과 보안 규칙이 만들어집니다.

### PvP Realtime 켜기

1. 왼쪽 메뉴 `Database` → `Replication`을 엽니다.
2. `supabase_realtime` publication에서 `matches` 테이블을 켭니다. `match_actions`도 켜 두면 운영 중 행동 기록을 실시간으로 확인할 수 있습니다.
3. 이 앱은 `matches` 변경을 구독합니다. 방장이 시작하면 상대 브라우저가 자동으로 전투 화면으로 이동합니다.

### 방 만들기 오류를 이미 본 경우

`function gen_salt(unknown) does not exist` 오류가 보였다면, Supabase 확장 함수의 위치를 SQL 함수가 찾지 못한 경우입니다. [supabase/room-password-hotfix.sql](supabase/room-password-hotfix.sql)을 전부 복사해 `SQL Editor`에서 한 번 실행하세요. 그 뒤 웹사이트를 새로고침하고 방 만들기를 다시 시도하면 됩니다.

기존 대기방이 비어도 남는 문제가 있다면 [supabase/room-cleanup-hotfix.sql](supabase/room-cleanup-hotfix.sql)을 같은 방법으로 한 번 실행하세요.

방장이 로비의 최신 참가자·준비 상태를 새로고침하려면 [supabase/room-refresh-hotfix.sql](supabase/room-refresh-hotfix.sql)을 같은 방법으로 한 번 실행하세요.

글쓴이 본인 또는 개발자 계정으로 갤러리 글을 삭제하려면 [supabase/gallery-moderation-hotfix.sql](supabase/gallery-moderation-hotfix.sql)을 같은 방법으로 한 번 실행하세요. 이 파일을 실행하지 않으면 `delete_gallery_post` 함수를 찾을 수 없다는 오류가 납니다.

### v1.1.1 중복 보상 SQL · 실행 대기

[supabase/v1.1.1-compensation.sql](supabase/v1.1.1-compensation.sql)은 아직 운영 Supabase에 실행하지 않은 상태로 보관합니다. 웹 파일 배포가 끝난 뒤 SQL Editor에서 한 번 실행해야 패치 시점의 기존 가입자에게 200P가 지급됩니다. 캠페인 ID와 계정별 지급 기록을 기준으로 중복 실행을 막도록 작성되어 있지만, 실행 전에는 운영 데이터베이스 백업과 대상 사용자 수를 먼저 확인하세요.

### 매일 첫 로그인 출석 보상 50P

[supabase/daily-login-reward.sql](supabase/daily-login-reward.sql)은 [supabase/game-profile-sync.sql](supabase/game-profile-sync.sql)을 적용한 뒤 SQL Editor에서 한 번 실행하세요. 한국 시간 기준으로 매일 첫 로그인에만 50P를 지급하며, 같은 날 재로그인하거나 요청이 동시에 들어와도 계정별로 한 번만 지급됩니다.

이 파일은 아직 실행하지 않은 `v1.1.1-compensation.sql`과 독립적입니다. 출석 보상 SQL을 먼저 적용해도 기존 가입자 200P 보상 대상이나 지급 기록은 바뀌지 않습니다.

### 로그인 켜기

1. 왼쪽 메뉴 `Authentication` → `Providers`(또는 `Sign In / Providers`)를 엽니다.
2. `Email`이 켜져 있는지 확인합니다. 보통 기본으로 켜져 있습니다.
3. `URL Configuration`에서 `Site URL`에 나중에 Cloudflare가 알려 줄 주소(예: `https://politimon.pages.dev`)를 넣습니다. 배포 전에는 임시로 `http://localhost:4173`을 넣어도 됩니다.
4. 같은 화면의 `Redirect URLs`에 `https://정확한-내-주소.pages.dev/**`를 추가합니다. 자체 도메인을 연결하면 그 주소도 추가합니다.
5. `Email` 제공자 설정에서 `Confirm Email`을 **끔**으로 바꿉니다. 그래야 회원가입 직후 바로 플레이할 수 있습니다.
6. 이용자가 입력한 아이디는 내부적으로만 로그인 주소로 변환됩니다. 이메일을 직접 수집하거나 표시하지 않습니다. 이메일 확인을 끄면 제3자가 다른 사람의 아이디를 먼저 만들 수 있으므로, 공개 서비스에서는 CAPTCHA나 별도 본인 확인 기능을 추가하는 것을 권장합니다.

### 개발 테스트 계정 두 개 만들기

개발자 모드 버튼은 제거되었습니다. 멀티플레이를 안전하게 시험하려면 Supabase에 서로 다른 테스트 계정 두 개를 만들어 일반 창과 시크릿 창에서 각각 로그인하세요.

가장 쉬운 Dashboard 방법과 Git Bash 자동 생성 방법은 [supabase/DEVELOPER_ACCOUNTS.md](supabase/DEVELOPER_ACCOUNTS.md)에 단계별로 정리했습니다. 자동 생성은 Secret/service_role 키를 잠깐만 사용하므로, 이 키를 `supabase-config.js`나 GitHub에 넣으면 안 됩니다.

### 웹사이트와 Supabase 연결하기

1. Supabase 왼쪽 아래 `Project Settings` → `API`를 엽니다.
2. `Project URL`과 `anon public`(또는 `publishable`) 키를 각각 복사합니다.
3. 프로젝트의 [supabase-config.js](supabase-config.js)를 열어 빈 따옴표 안에 붙여넣습니다.

```js
window.POLITIMON_SUPABASE = {
  url: "https://내프로젝트ID.supabase.co",
  anonKey: "sb_publishable_... 또는 eyJ..."
};
```

4. 저장 후 GitHub 웹페이지에서 해당 파일을 다시 업로드하거나 수정 내용을 커밋합니다.

## 3. Cloudflare Pages로 공개하기

사이트: <https://dash.cloudflare.com>

1. Cloudflare 회원가입/로그인을 합니다.
2. 왼쪽 `Workers & Pages` → `Create application` → `Pages` → `Connect to Git`을 누릅니다.
3. GitHub를 연결하고 방금 만든 `politimon` 저장소를 선택합니다.
4. 설정 화면에서 다음처럼 입력합니다.

| 항목 | 입력값 |
| --- | --- |
| Framework preset | `None` 또는 `No framework` |
| Build command | **빈칸** |
| Build output directory | `.` |
| Root directory | 비워 둠 (저장소 안에 프로젝트가 또 있다면 그 폴더명) |

5. `Save and Deploy`를 누릅니다.
6. 완료되면 `https://프로젝트이름.pages.dev` 주소가 나옵니다. 주소를 열어 로그인, 갤러리 글쓰기, 방 만들기를 직접 확인합니다.
7. 위 Supabase의 `Site URL`과 `Redirect URLs`에 이 정확한 주소를 넣고 `Save`합니다.

이후 GitHub에 커밋을 올릴 때마다 Cloudflare Pages가 자동으로 새 버전을 배포합니다.

### PvP 탈주 기능 서버 반영

웹 파일을 GitHub에 올린 뒤 [supabase/pvp-forfeit-hotfix.sql](supabase/pvp-forfeit-hotfix.sql) 전체를 Supabase `SQL Editor`에서 한 번 실행해야 합니다. 이 작업이 적용되어야 대전 도중 방 나가기, 탈주 패배 확정, 상대 승리 처리와 종료된 방 정리가 서버에서 동작합니다.

### 회원 탈퇴 기능 배포

회원 탈퇴는 브라우저가 아닌 Supabase 서버에서만 처리합니다. 그래야 관리자 키가 웹사이트에 노출되지 않습니다.

1. Supabase Dashboard → `Edge Functions` → `Deploy a new function`을 누릅니다.
2. 함수 이름을 정확히 `delete-account`로 입력합니다.
3. [supabase/functions/delete-account/index.ts](supabase/functions/delete-account/index.ts) 전체를 붙여넣고 배포합니다.
4. 함수의 JWT 검증은 기본값인 **켜짐**으로 유지합니다.
5. 배포 후 게임에서 테스트 계정으로 로그인 → 우측 상단 프로필 → `회원 탈퇴`를 눌러 확인합니다.

이 작업은 `auth.users` 계정을 실제로 삭제합니다. 프로필을 기준으로 연결된 갤러리 글·대기방 정보도 함께 정리됩니다. 삭제는 되돌릴 수 없습니다. Supabase의 서비스 역할 키는 Edge Function 안에서만 사용되며, `supabase-config.js`나 GitHub에 넣으면 안 됩니다.

## 4. 공개 전 확인 순서

1. 시크릿 창에서 사이트를 열고 새 계정을 만듭니다.
2. 아이디와 비밀번호만 입력한 뒤, 회원가입 직후 바로 로그인되는지 확인합니다.
3. `갤러리` → `글쓰기`에서 글을 작성합니다. 다른 브라우저에서도 같은 글이 보이는지 확인합니다.
4. 브라우저 창 두 개에서 서로 다른 계정으로 로그인합니다.
5. 첫 창에서 `멀티 플레이` → `방 만들기`를 누릅니다.
6. 비공개를 고르면 숫자 4자리를 입력하고, 두 번째 창에서 방에 입장해 같은 비밀번호를 넣습니다.
7. 참가자가 `준비`를 누르면 방장의 `PvP 시작` 버튼이 켜지는지 확인합니다.
8. 방장이 시작하면 두 창 모두 전투 화면으로 이동하는지, 선공이 인물을 낸 뒤 상대가 인물을 내는지 확인합니다.
9. 기술·특성·진화·후퇴·전략·턴 종료를 각각 한 번씩 진행해 HP, 토큰, 손패 수, 덱 수와 전황 기록이 양쪽에서 같은지 확인합니다.
10. 한쪽 창에서 `방 나가기`를 누르고 경고를 승인해, 해당 계정은 최대 30P가 차감되되 0P 아래로 내려가지 않고 상대 창은 승리 및 150P 보상으로 처리되는지 확인합니다.

## 5. PvP 동작과 운영 메모

각 플레이어는 현재 덱을 로비에 등록한 후 준비합니다. 방장은 두 덱으로 기존 `GameEngine`을 한 번 초기화하고, 이후 자신의 턴에만 행동할 수 있습니다. 행동은 버전 번호와 함께 `submit_match_state` RPC로 저장됩니다. 이 RPC는 참가자 여부, 현재 턴, 이전 상태 버전을 잠그므로 같은 행동이 겹쳐 덮어써지지 않습니다. `matches`의 변경은 Supabase Realtime으로 상대에게 즉시 전달됩니다.

현재 카드 정보와 덱 순서까지 양쪽에 보여 주는 공개 정보 PvP입니다. 정적인 브라우저 JavaScript 규칙을 그대로 쓰는 구조이므로, 경쟁 랭크전처럼 조작 방지가 필요한 서비스라면 다음 단계로 `GameEngine`을 Edge Function/서버 런타임으로 옮기고 클라이언트에서는 행동 의도만 보내도록 강화하세요. 이용자가 늘면 Postgres Changes 대신 방별 private Broadcast 채널을 쓰는 편이 좋습니다.

## 파일별 역할

| 파일 | 하는 일 |
| --- | --- |
| [supabase-config.js](supabase-config.js) | Supabase URL·공개 키 입력 장소 |
| [backend.js](backend.js) | 로그인, 갤러리 글, 방 API 및 PvP 상태 저장·Realtime 구독 API |
| [supabase/schema.sql](supabase/schema.sql) | Supabase SQL Editor에서 실행할 테이블·보안·방 함수 |
| [app.js](app.js) | 로그인/멀티플레이/갤러리 화면, 기존 엔진을 쓰는 PvP 입력·상태 동기화 |
| [ui.css](ui.css) | 제공한 예시를 반영한 게시판·방 목록·대기실 화면 |

## 비용과 운영 팁

- 시작 전에는 각 서비스의 현재 무료 한도와 정지 정책을 해당 요금제 화면에서 확인하세요.
- 방 비밀번호는 DB에 평문이 아닌 해시로 저장됩니다. 운영자가 비밀번호를 볼 수 없도록 한 설계입니다.
- 게시글 신고/삭제, 욕설 필터, 관리자 권한은 아직 추가하지 않았습니다. 공개 갤러리라면 운영 도구를 별도 작업으로 넣는 것이 안전합니다.

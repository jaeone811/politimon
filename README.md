# 정치몬 웹 카드게임

정적 호스팅 가능한 HTML/CSS/JavaScript 카드게임 프로토타입입니다.

## 실행

`index.html`을 브라우저로 열거나, 정적 서버의 루트로 `politimon` 폴더를 지정합니다.

## 카드 추가

1. `data.js`의 `cards` 배열에 새 카드 데이터를 넣습니다.
2. `assets/cards/{카드 ID}.png` 경로에 카드 이미지를 넣습니다.
3. 카드에 `packId` 또는 `packIds`를 적거나, `packs`의 해당 카드팩 `cardIds`에 카드 ID를 등록합니다.

카드 이미지의 권장 종횡비는 1020 × 1416입니다. 파일이 없더라도 화면은 오류 없이 폴백 아트를 표시합니다.

## 카드팩 추가 방식

8개 출시 카드팩은 `data.js`의 `packs`에 나뉘어 있습니다.

- `pack_people_power`: 국힘 카드팩
- `pack_democratic`: 민주당 카드팩
- `pack_assembly`: 22대 국회팩
- `pack_president`: 대통령 카드팩
- `pack_legacy`: 죽은 정치인 카드팩
- `pack_legend`: 레전드 정치인 카드팩
- `pack_independent`: 비주류 정치인 카드팩
- `pack_youth`: 청년 정치인 카드팩

카드가 한 팩에만 들어가면 카드 데이터에 `packId`를 적습니다.

```js
{
  id: "president_01",
  name: "대통령 카드 이름",
  type: "character",
  packId: "pack_president",
  rarity: "SR",
  attribute: "blue",
  hp: 140,
  weakness: null,
  resistance: null,
  skills: [
    { name: "기술명", cost: { blue: 1, any: 1 }, description: "동전을 1번 뒤집습니다. 50 피해", effects: [{ type: "damage", amount: 50 }] }
  ]
}
```

여러 팩에 같이 들어가면 `packIds`를 씁니다.

```js
packIds: ["pack_president", "pack_legend"]
```

카드 데이터와 팩을 분리해서 관리하고 싶으면, 팩의 `cardIds`에 카드 ID를 넣어도 됩니다.

```js
{ id: "pack_president", name: "대통령 카드팩", cardIds: ["president_01"] }
```

희귀도별 확률은 `settings.rarityOdds`에서 조정합니다. 현재는 `SSR 5%`, `SR 10%`, `RR 15%`, `R 20%`, `U 22%`, `C 28%`이며, 한 번에 5장을 뽑습니다.

팩 안에 특정 희귀도 카드가 없는데 그 희귀도가 당첨되면, 해당 결과는 무효 처리하고 다시 추첨합니다. 따라서 카드가 적은 초기 팩도 실제 존재하는 희귀도 카드만 나옵니다.

## 타입 추가

토큰 타입과 카드 속성은 `data.js`의 `settings.types` 하나로 관리합니다.

예:

```js
types: [
  { id: "blue", label: "파랑", color: "#64dfff" },
  { id: "orange", label: "주황", color: "#ff9f43" },
]
```

이후 인물 카드의 `attribute`, `weakness`, `resistance`에 같은 `id`를 적으면 됩니다. 예: `attribute:"orange"`.

색상 판정 규칙:

- 현재 카드 이미지에서 갈색처럼 보이는 붉은/벽돌색 계열은 `orange`(주황)로 입력합니다.
- `brown`(갈색)은 이후 추가될 금색에 가까운 갈색 계열에만 사용합니다.

## 기술 비용 작성

기술 비용은 여러 색을 동시에 요구할 수 있습니다.

```js
cost: { blue: 1, orange: 1 } // 파랑 1개 + 주황 1개
```

아무 색 토큰으로 낼 수 있는 비용은 `any`를 사용합니다.

```js
cost: { blue: 1, any: 1 } // 파랑 1개 + 아무 토큰 1개
```

## 동전 뒤집기

AI 매치 시작 시 선공/후공은 동전 뒤집기 애니메이션으로 결정됩니다.

나중에 카드 설명에 `동전` 또는 `코인`이라는 단어가 들어간 기술·전략을 사용하면 같은 애니메이션이 먼저 재생됩니다. 실제 앞면/뒷면에 따라 다른 효과를 적용해야 하는 카드는 이후 `effects` 규칙을 추가하면 됩니다.

## 이펙트 시간 규칙

전투 중 표시되는 기술, 특성, 타격, AI 선택, 동전, 턴 변경 이펙트는 모두 2초 노출을 기준으로 고정합니다. 새 이펙트를 추가할 때도 `app.js`의 `EFFECT_DURATION_MS` 값을 기준으로 맞춥니다.

## 현재 미정으로 남긴 값

덱 제한, 카드팩 가격 및 희귀도 확률, 카드팩 카드 풀, 핸드 리필 수량, 보상, 도전과제, 속성 상성표는 `data.js` 설정에서 `null` 또는 빈 데이터로 남겨 두었습니다. 해당 값이 확정되면 해당 데이터만 채워 기능을 활성화할 수 있습니다.

## 추후 멀티플레이 준비

현재 버전은 브라우저의 `localStorage`를 사용하는 싱글플레이 전용입니다. 전투 규칙은 `engine.js`의 `GameEngine`에, 화면 렌더링과 사용자 입력은 `app.js`에 분리되어 있어 멀티플레이 전환 시에도 카드 데이터와 전투 규칙은 그대로 재사용할 수 있습니다.

권장 구조는 **Cloudflare Pages + Supabase**입니다.

1. GitHub에 이 폴더를 저장소로 올립니다.
2. Cloudflare Pages에서 저장소를 연결하고, 정적 사이트이므로 빌드 명령은 비워 두고 출력 폴더는 프로젝트 루트로 지정합니다.
3. Supabase에서 프로젝트를 만든 뒤 `profiles`, `decks`, `matches`, `match_actions` 테이블을 생성합니다. `profiles`와 `decks`는 로그인 사용자 본인만 읽고 쓰도록 RLS를 설정합니다.
4. 게임을 시작할 때 `matches`에 방을 만들고, 각 행동(기술·전략·토큰 선택)을 `match_actions`에 순서 번호와 함께 기록합니다. **클라이언트가 승패나 피해를 확정하지 않고**, 서버 함수가 `GameEngine`과 같은 규칙으로 검증·확정해야 합니다.
5. Supabase Realtime Broadcast는 방 참가자에게 확정된 행동과 접속 상태만 전달합니다. 상대 화면은 그 행동을 받은 뒤 동일한 엔진 상태를 다시 렌더링합니다.

무료 시작 범위에서는 Supabase가 PostgreSQL 데이터베이스와 Realtime을 제공하며, Free 프로젝트는 장기 미사용 시 일시 정지될 수 있습니다. Cloudflare Pages는 정적 파일을 CDN으로 배포하기에 이 프로젝트의 HTML/CSS/JS 호스팅에 적합합니다. 카드 데이터, 덱 목록, 대전 로그는 작게 유지하고 카드 이미지는 정적 `assets`로 배포해 DB 용량을 아끼는 구성이 좋습니다.

공식 문서: [Supabase 요금제](https://supabase.com/pricing), [Supabase Realtime](https://supabase.com/docs/guides/realtime), [Cloudflare Pages](https://developers.cloudflare.com/pages/).

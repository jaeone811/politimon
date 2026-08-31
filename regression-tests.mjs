import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const dataSource=fs.readFileSync(new URL("./data.js",import.meta.url),"utf8");
const engineSource=fs.readFileSync(new URL("./engine.js",import.meta.url),"utf8");
const appSource=fs.readFileSync(new URL("./app.js",import.meta.url),"utf8");
const backendSource=fs.readFileSync(new URL("./backend.js",import.meta.url),"utf8");
const storageSource=fs.readFileSync(new URL("./storage.js",import.meta.url),"utf8");
const forfeitSql=fs.readFileSync(new URL("./supabase/pvp-forfeit-hotfix.sql",import.meta.url),"utf8");
const gameProfileSql=fs.readFileSync(new URL("./supabase/game-profile-sync.sql",import.meta.url),"utf8");
const context=vm.createContext({console,Math,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},window:{dispatchEvent(){}}});
vm.runInContext(`${dataSource}\n${engineSource}\nglobalThis.testExports={cards,cardById,settings,achievements,GameEngine};`,context);
const {cards,settings,achievements,GameEngine}=context.testExports;
assert.deepEqual({...settings.rarityOdds},{HR:0.5,SSR:3.5,SR:6,RR:10,R:20,U:25,C:35},"시즌 1 공식 카드팩 확률");
const parkGeunHye=cards.find(card=>card.id==="character_04"),thaad=parkGeunHye?.skills?.[0];
assert.equal(thaad?.effects?.find(effect=>effect.type==="damage")?.amount,40,"박근혜 사드 배치 기본 피해");
assert.equal(thaad?.effects?.find(effect=>effect.type==="bonusDamageIfSelfHpAtLeast")?.amount,10,"박근혜 사드 배치 조건 추가 피해");
assert.match(thaad?.description||"",/추가 피해 10.*기본 40 피해/,"박근혜 카드 설명 수치");
assert.equal(parkGeunHye?.trait?.effects?.find(effect=>effect.type==="bonusDamageUnlessEnemyAttribute")?.amount,10,"박근혜 특성 조건 추가 피해");
assert.match(parkGeunHye?.trait?.description||"",/추가 피해 10/,"박근혜 특성 설명 수치");
assert.equal(cards.find(card=>card.id==="character_16")?.hp,140,"조 바이든 기본 체력 140");
assert.match(appSource,/ai\.active=tutorialActive\("character_16"\);/,"튜토리얼 조 바이든은 기본 체력으로 시작");
assert.doesNotMatch(appSource,/tutorialActive\("character_16",300\)/,"튜토리얼 조 바이든 임시 체력 제거");
assert.deepEqual({...settings.reward},{aiWinEasy:90,aiWinNormal:110,aiWinHard:130,aiLoss:30,pvpWin:150,pvpLoss:50,pvpForfeitPenalty:30},"상향된 난이도별 플레이 보상");
assert.ok(achievements.every(achievement=>achievement.reward%5===0),"모든 도전과제 보상은 5P 단위");
assert.equal(achievements.reduce((sum,achievement)=>sum+achievement.reward,0),5715,"상향된 도전과제 총 보상");
assert.match(appSource,/rewardEligible:\(profile\.records\?\.tutorial\|\|0\)<1/,"튜토리얼 최초 완료 보상 자격 기록");

{
  const aiSource=appSource.match(/const RARITY_POWER[\s\S]*?function rarityTransferTarget/)?.[0].replace(/function rarityTransferTarget[\s\S]*/,"");
  assert.ok(aiSource,"AI 덱 생성 함수 추출");
  const fixedMath=Object.create(Math);fixedMath.random=()=>0.5;
  const aiContext=vm.createContext({console,Math:fixedMath});
  const helpers=`
    const deckCounts=deck=>{const usable=deck.filter(id=>cardById[id]);return {characters:usable.filter(id=>cardById[id].type==="character").length,strategies:usable.filter(id=>cardById[id].type==="strategy").length,vmax:usable.filter(id=>isVmaxCard(cardById[id])).length,ssr:usable.filter(id=>cardById[id].rarity==="SSR").length}};
    const canDeckAcceptCard=(deck,card)=>{if(!card||deck.includes(card.id)||deck.length>=settings.deckCardCount)return false;const counts=deckCounts(deck);if(card.type==="character"&&counts.characters>=settings.characterLimit)return false;if(card.type==="strategy"&&counts.strategies>=settings.strategyLimit)return false;if(isVmaxCard(card)&&counts.vmax>=settings.vmaxLimit)return false;if(card.rarity==="SSR"&&counts.ssr>=settings.ssrLimit)return false;return true};
    const validDeck=deck=>{const counts=deckCounts(deck);return counts.characters===settings.characterLimit&&counts.strategies===settings.strategyLimit&&counts.vmax<=settings.vmaxLimit&&counts.ssr<=settings.ssrLimit&&deck.length===settings.deckCardCount};
    let selectedAiOpponentId="ai_people_power_easy";
  `;
  vm.runInContext(`${dataSource}\n${helpers}\n${aiSource};globalThis.aiExports={AI_OPPONENTS,buildAiDeck,aiDeckCardScore,cardById};`,aiContext);
  for(const opponent of aiContext.aiExports.AI_OPPONENTS){
    const deck=aiContext.aiExports.buildAiDeck(opponent),rarities=deck.map(id=>aiContext.aiExports.cardById[id].rarity);
    assert.equal(deck.length,10,`${opponent.name} AI 덱 10장 구성`);
    if(opponent.level==="easy")assert.ok(rarities.every(rarity=>rarity!=="SSR"&&rarity!=="HR"),`${opponent.name} 입문 덱 SSR/HR 제외`);
    if(opponent.level==="normal")assert.ok(rarities.every(rarity=>rarity!=="HR"),`${opponent.name} 중급 덱 HR 제외`);
  }
  const easy={level:"easy",attributes:[],packs:[],strategyIds:[],allowVmax:false},normal={...easy,level:"normal"};
  assert.ok(aiContext.aiExports.aiDeckCardScore({rarity:"RR",type:"character"},easy)<aiContext.aiExports.aiDeckCardScore({rarity:"R",type:"character"},easy),"입문 AI의 RR 선호도 하향");
  assert.ok(aiContext.aiExports.aiDeckCardScore({rarity:"SR",type:"character"},normal)<aiContext.aiExports.aiDeckCardScore({rarity:"RR",type:"character"},normal),"중급 AI의 SR 선호도 하향");
}

{
  const values=new Map(),localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,value)};
  const storageContext=vm.createContext({localStorage});
  vm.runInContext(`${storageSource};globalThis.exports={defaultProfile,loadProfile,saveProfile,profileStorageKey};`,storageContext);
  const first=storageContext.exports.defaultProfile(),second=storageContext.exports.defaultProfile();
  first.currency=777;second.currency=333;
  storageContext.exports.saveProfile(first,"user-a");storageContext.exports.saveProfile(second,"user-b");
  assert.equal(storageContext.exports.loadProfile("user-a").currency,777,"계정 A 로컬 캐시 분리");
  assert.equal(storageContext.exports.loadProfile("user-b").currency,333,"계정 B 로컬 캐시 분리");
  assert.notEqual(storageContext.exports.profileStorageKey("user-a"),storageContext.exports.profileStorageKey("user-b"),"계정별 저장 키 분리");
}

{
  assert.match(backendSource,/async getGameProfile\(userId\)[\s\S]*rpc\("get_game_profile"\)/,"서버 게임 프로필 불러오기 API");
  assert.match(backendSource,/async saveGameProfile\(userId, profile, expectedRevision, seasonId\)[\s\S]*rpc\("save_game_profile"/,"서버 게임 프로필 저장 API");
  assert.match(appSource,/function syncAccountGameProfile[\s\S]{0,1800}getGameProfile[\s\S]{0,1800}saveGameProfile/,"로그인 시 서버 프로필 로드 또는 최초 이전");
  assert.match(appSource,/const save = \(\) => \{ saveProfile\(profile,authSession\?\.user\?\.id\|\|null\);queueServerProfileSave\(\)/,"모든 진행 저장 시 계정별 서버 동기화 예약");
  assert.match(appSource,/game_profile_revision_conflict/,"다른 기기 동시 저장 충돌 감지");
  assert.match(appSource,/if\(session\?\.user\)await syncAccountGameProfile\(\)/,"자동 로그인 시 서버 진행 불러오기");
  assert.match(gameProfileSql,/create table if not exists public\.game_profiles/,"게임 진행 서버 테이블");
  ["collection","deck","currency","achievements","claimed_pvp_matches","records","season_id","revision"].forEach(column=>assert.match(gameProfileSql,new RegExp(`\\b${column}\\b`),`서버 진행 필드 ${column}`));
  assert.match(gameProfileSql,/where user_id = auth\.uid\(\)/,"본인 계정 진행만 조회");
  assert.match(gameProfileSql,/p_expected_revision <> current_revision[\s\S]{0,100}game_profile_revision_conflict/,"서버 낙관적 잠금");
  assert.match(gameProfileSql,/on delete cascade/,"회원 탈퇴 시 서버 진행 데이터 자동 삭제");
}

{
  const syncSource=appSource.match(/function gameProfileSnapshot[\s\S]*?function updateHeaderUser/)?.[0].replace(/function updateHeaderUser[\s\S]*/,"");
  assert.ok(syncSource,"계정 진행 동기화 함수 추출");
  const values=new Map(),savedPayloads=[],remoteProfile={profile:{collection:{character_04:1},deck:["character_04"],currency:900,achievements:{tutorial:true},claimedPvpMatches:{match:true},records:{wins:4,plays:5}},seasonId:"season-1",revision:7};
  const localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,value)};
  const backend={getGameProfile:async()=>remoteProfile,saveGameProfile:async(userId,payload,revision,seasonId)=>{savedPayloads.push({userId,payload,revision,seasonId});return {profile:payload,seasonId,revision:Number(revision||0)+1};}};
  const syncContext=vm.createContext({console,Math,localStorage,window:{politimonBackend:backend},document:{querySelector:()=>null,createTextNode:value=>value},setTimeout,clearTimeout,notify(){},render(){}});
  vm.runInContext(`${dataSource}\n${storageSource}\nconst clone=value=>JSON.parse(JSON.stringify(value));let profile=defaultProfile(),authSession={user:{id:"account-a"}},serverProfileSync={userId:null,revision:null,seasonId:null,ready:false,saving:false,pending:null,activePromise:Promise.resolve(),retryTimer:null,errorNotified:false};const CURRENT_SEASON_ID="season-1",currentUser=()=>authSession.user;${syncSource};globalThis.syncExports={syncAccountGameProfile,queueServerProfileSave,flushServerProfileSave,getProfile:()=>profile,setCurrency:value=>profile.currency=value,getRevision:()=>serverProfileSync.revision};`,syncContext);
  await syncContext.syncExports.syncAccountGameProfile();
  assert.equal(syncContext.syncExports.getProfile().currency,900,"로그인 시 서버 재화 불러오기");
  assert.equal(syncContext.syncExports.getProfile().records.wins,4,"로그인 시 서버 전적 불러오기");
  syncContext.syncExports.setCurrency(875);syncContext.syncExports.queueServerProfileSave();
  assert.equal(await syncContext.syncExports.flushServerProfileSave(),true,"진행 상황 서버 저장 완료");
  assert.equal(savedPayloads.at(-1).payload.currency,875,"변경된 재화 서버 저장");
  assert.equal(savedPayloads.at(-1).revision,7,"서버 버전에 대한 충돌 방지 저장");
}

const effectsOf=card=>[
  ...(card.effects||[]),
  ...(card.trait?.effects||[]),
  ...(card.skills||[]).flatMap(skill=>skill.effects||[]),
  ...(card.choices||[]).flatMap(choice=>choice.effects||[]),
];
const declaredTypes=[...new Set(cards.flatMap(effectsOf).map(effect=>effect.type))];
const finalEffectsSource=engineSource.slice(engineSource.lastIndexOf("  effects(source,effects,context={})"));
const intentionallyHandledElsewhere=new Set(["passiveDamageReduction"]);
for(const type of declaredTypes){
  assert.ok(type.startsWith("bonusDamage")||intentionallyHandledElsewhere.has(type)||finalEffectsSource.includes(`e.type===\"${type}\"`),`엔진에 구현되지 않은 효과: ${type}`);
}

function battle({selfHp=500,enemyHp=500,enemyAttribute="green",enemyTokens={}}={}){
  const engine=new GameEngine([],()=>{},[]);
  const tokens=()=>Object.fromEntries(settings.tokenTypes.map(type=>[type,0]));
  engine.state.phase="playing";engine.state.turn=0;engine.state.actionAvailable=true;
  engine.state.players[0].active={id:"self",name:"나",type:"character",attribute:"gray",hp:500,currentHp:selfHp,skills:[]};
  engine.state.players[1].active={id:"enemy",name:"상대",type:"character",attribute:enemyAttribute,hp:500,currentHp:enemyHp,skills:[]};
  engine.state.players[0].tokens=tokens();engine.state.players[1].tokens={...tokens(),...enemyTokens};
  return engine;
}
const damageTaken=engine=>500-engine.state.players[1].active.currentHp;

{
  const engine=battle();
  engine.effects(0,[{type:"coinFlipDamageModifier",headsMultiplier:2,headsBonus:10},{type:"damage",amount:50}],{actionType:"skill",coinResult:"heads"});
  assert.equal(damageTaken(engine),120,"단일 앞면 배율/추가 피해");
}
{
  const engine=battle();
  engine.effects(0,[{type:"coinFlipSelfDamageOnTails",amount:20},{type:"damage",amount:50}],{actionType:"skill",coinResult:"tails"});
  assert.equal(engine.state.players[0].active.currentHp,480,"뒷면 반동 피해");
}
{
  const engine=battle({selfHp:450});
  engine.effects(0,[{type:"coinFlipHealSelfOrBonusDamage",headsHeal:20,tailsBonus:30},{type:"damage",amount:10}],{actionType:"trait",coinResult:"heads"});
  assert.equal(engine.state.players[0].active.currentHp,470,"앞면 회복");
  assert.equal(damageTaken(engine),10,"앞면 회복 뒤 기본 피해");
}
{
  const engine=battle();
  engine.effects(0,[{type:"fixedCoinFlipsDamageBonus",flips:3,headsBonus:10},{type:"damage",amount:50}],{actionType:"skill",coinResults:["heads","tails","heads"]});
  assert.equal(damageTaken(engine),70,"고정 횟수 동전의 앞면 수 집계");
}
{
  const skill=cards.find(card=>card.name==="주진우")?.skills?.[1];
  assert.ok(skill,"주진우 기술 2 존재");
  const results=["heads","heads","tails","heads","tails"];
  const playerEngine=battle();
  playerEngine.effects(0,skill.effects,{actionType:"skill",coinResults:results});
  assert.equal(damageTaken(playerEngine),110,"주진우 기술 2 플레이어 앞면 3회는 110 피해");
  const aiEngine=battle();
  aiEngine.effects(1,skill.effects,{actionType:"skill",coinResults:results});
  assert.equal(500-aiEngine.state.players[0].active.currentHp,110,"주진우 기술 2 AI 앞면 3회도 110 피해");
  const forcedEngine=battle();
  forcedEngine.state.players[0].forceNextCoinHeads=true;
  forcedEngine.effects(0,skill.effects,{actionType:"skill",coinResults:["tails","tails","tails","tails","tails"]});
  assert.equal(damageTaken(forcedEngine),90,"토론회 효과는 주진우의 첫 동전을 앞면으로 강제");
}
{
  const heads=battle();heads.state.players[0].active.faceDown=true;
  assert.equal(heads.flipFaceDownActive(0,{coinResult:"heads",tokenColor:"red"}),"heads","이진숙 뒷면 효과에서 앞면 결과 전달");
  assert.equal(heads.state.players[0].active.faceDown,false,"앞면이면 뒷면 카드 활성화");
  const tails=battle();tails.state.players[0].active.faceDown=true;
  assert.equal(tails.flipFaceDownActive(0,{coinResult:"tails",tokenColor:"red"}),"tails","이진숙 뒷면 효과에서 뒷면 결과 전달");
  assert.equal(tails.state.players[0].active.faceDown,true,"뒷면이면 비활성 상태 유지");
}
{
  const engine=battle();
  engine.effects(0,[{type:"repeatCoinBonusUntilTails",headsBonus:20},{type:"damage",amount:50}],{actionType:"skill",coinResults:["heads","heads","tails"]});
  assert.equal(damageTaken(engine),90,"뒷면까지 연속 동전 집계");
}
{
  const engine=battle();
  engine.effects(0,[{type:"streakCoinDamageModifier",headsBonuses:[0,0,40,80],tailsBonus:20},{type:"damage",amount:90}],{actionType:"skill",coinResults:["heads","heads","tails"]});
  assert.equal(damageTaken(engine),150,"연속 2회 앞면 뒤 뒷면 보너스");
}
{
  const engine=battle();
  engine.effects(0,[{type:"coinFlipsDamageBonusAndSelfDamage",flips:3,headsBonus:10,tailsSelfDamage:20},{type:"damage",amount:50}],{actionType:"skill",coinResults:["heads","tails","tails"]});
  assert.equal(damageTaken(engine),60,"복수 동전의 앞면 추가 피해");
  assert.equal(engine.state.players[0].active.currentHp,460,"복수 동전의 뒷면 반동 피해");
}
{
  const engine=battle({enemyTokens:{red:2}});
  engine.effects(0,[{type:"coinFlipBonusDamageStealTokenOrSelfDamage",headsBonus:20,headsStealToken:1,tailsSelfDamage:20},{type:"damage",amount:50}],{actionType:"skill",coinResult:"heads",stealColor:"red"});
  assert.equal(damageTaken(engine),70,"앞면 추가 피해");
  assert.equal(engine.state.players[0].tokens.red,1,"앞면 추가 토큰 탈취");
}
{
  const engine=battle({enemyAttribute:"green"});
  engine.effects(0,[{type:"coinFlipBonusDamageUnlessEnemyAttribute",attribute:"pink",headsBonus:20},{type:"damage",amount:50}],{actionType:"skill",coinResult:"heads"});
  assert.equal(damageTaken(engine),70,"지정 속성이 아닐 때 앞면 추가 피해");
}
{
  const engine=battle({enemyAttribute:"red"});
  engine.effects(0,[{type:"coinFlipBonusOrSelfDamageIfEnemyAttribute",attribute:"red",headsBonus:70,tailsSelfDamage:60},{type:"damage",amount:40}],{actionType:"skill",coinResult:"tails"});
  assert.equal(damageTaken(engine),40,"조건부 동전의 기본 피해");
  assert.equal(engine.state.players[0].active.currentHp,440,"조건부 동전 뒷면 반동");
}
{
  const engine=battle();
  engine.effects(0,[{type:"fixedCoinFlipsAllHeadsAddToken",flips:2,color:"pink",amount:1},{type:"damage",amount:30}],{actionType:"skill",coinResults:["heads","heads"]});
  assert.equal(engine.state.players[0].tokens.pink,1,"모두 앞면 토큰 획득");
}
{
  const engine=battle();
  engine.effects(0,[{type:"coinFlipAddTokensByResult",flips:2,headsColor:"pink",tailsColor:"blue"},{type:"damage",amount:80}],{actionType:"skill",coinResults:["heads","tails"]});
  assert.equal(engine.state.players[0].tokens.pink,1,"앞면 색 토큰 획득");
  assert.equal(engine.state.players[0].tokens.blue,1,"뒷면 색 토큰 획득");
}
{
  const engine=battle({enemyTokens:{red:1}});
  engine.effects(0,[{type:"coinFlipStealToken",amount:1}],{actionType:"trait",coinResult:"heads",stealColor:"red"});
  assert.equal(engine.state.players[0].tokens.red,1,"앞면 토큰 탈취");
}
{
  const engine=battle({enemyHp:400});
  engine.effects(0,[{type:"coinFlipBonusDamageOrHealEnemy",headsBonus:20,tailsHealEnemy:20},{type:"damage",amount:50}],{actionType:"skill",coinResult:"tails"});
  assert.equal(engine.state.players[1].active.currentHp,370,"뒷면 상대 회복 후 기본 피해");
}
{
  const engine=battle();
  engine.effects(0,[{type:"pushYourLuckDamageModifier",headsBonus:40,tailsSelfDamage:40},{type:"damage",amount:40}],{actionType:"skill",coinResults:["heads","heads"]});
  assert.equal(damageTaken(engine),120,"도전형 동전에서 멈춘 앞면 누적 피해");
}
{
  const engine=battle({selfHp:400});
  engine.effects(0,[{type:"selfDamage",amount:10,optionalCoinCost:true},{type:"coinFlipDamageModifier",optional:true,headsBonus:20},{type:"damage",amount:20}],{actionType:"trait",skipOptionalCoinFlip:true,optionalText:true});
  assert.equal(engine.state.players[0].active.currentHp,400,"선택형 동전을 거절하면 동전 비용 자해도 생략");
  assert.equal(damageTaken(engine),20,"선택형 동전을 거절해도 기본 피해 적용");
}
{
  const engine=battle();
  engine.state.players[0].discard.push("strategy_09");
  engine.effects(0,[{type:"recoverThisStrategyOnCoinHeads"}],{actionType:"strategy",cardId:"strategy_09",coinResult:"heads"});
  assert.ok(engine.state.players[0].hand.includes("strategy_09"),"전략 카드 앞면 회수");
}
{
  const engine=battle({enemyTokens:{red:5}});
  engine.effects(0,[{type:"stealAllTokensExceptCount",keep:2}],{actionType:"skill"});
  assert.equal(engine.state.players[1].tokens.red,2,"같은 색 토큰도 두 개까지 남길 수 있음");
  assert.equal(engine.state.players[0].tokens.red,3,"남긴 두 개를 제외한 토큰만 탈취");
}
{
  const engine=battle();
  engine.state.players[1].active.packIds=["pack_people_power"];
  engine.state.players[1].protectedPackThisTurn={packId:"pack_people_power"};
  engine.effects(0,[{type:"turnEnemyActiveFaceDownIfEnemyAttributeIn",attributes:["green"]}],{actionType:"skill"});
  assert.equal(engine.state.players[1].active.faceDown,undefined,"팩 보호 중에는 뒷면 효과 차단");
}
{
  const functionSource=appSource.match(/function pvpCoinResults[\s\S]*?function replayPvpOpponentAction/)?.[0].replace(/function replayPvpOpponentAction[\s\S]*/,"");
  assert.ok(functionSource,"PvP 동전 직렬화 함수 존재");
  const pvpContext=vm.createContext({});
  vm.runInContext(`${functionSource};globalThis.result=pvpCoinResults({coinResults:[\"heads\",\"heads\",\"tails\",\"heads\",\"tails\"]});`,pvpContext);
  assert.deepEqual([...pvpContext.result],["heads","heads","tails","heads","tails"],"PvP 주진우형 5회 동전 결과 보존");
  assert.match(appSource,/pvpCommit\("skill",\{label:skill\.name,coinCaption:skill\.name,coinResults:pvpCoinResults\(context\)\}\)/,"PvP 기술 동전 결과 전송");
  assert.match(appSource,/pvpCommit\("trait",\{label:trait\.name,coinCaption:trait\.name,coinResults:pvpCoinResults\(context\)\}\)/,"PvP 특성 동전 결과 전송");
  assert.match(appSource,/pvpCommit\("strategy",\{label:[\s\S]{0,180}coinResults:pvpCoinResults\(context\)\}\)/,"PvP 전략 동전 결과 전송");
  assert.match(appSource,/coinResults\.forEach\(\(result,index\)=>showCoinFlip/,"상대의 모든 동전 결과 순차 재생");
  assert.match(appSource,/syncRouteMusic\(\{restart:enteringGame\}\)/,"PvP 상태 갱신은 전투 진입 때만 음악 재시작");
  assert.doesNotMatch(appSource,/adoptPvpMatch[\s\S]{0,1800}syncRouteMusic\(\{restart:true\}\)/,"PvP 턴 갱신 시 강제 음악 재시작 금지");
  assert.match(appSource,/previousState\?\.turn===1&&game\.state\.turn===0[\s\S]{0,100}showTurnTransition\(0\)/,"상대 턴 종료 수신 시 나의 턴 표시");
  assert.match(appSource,/shouldLeaveFinishedRoom[\s\S]{0,180}leaveActiveRoom\(\)/,"종료된 PvP에서 화면 이탈 시 방 탈퇴");
  assert.match(appSource,/if\(next===\"gallery\"\)galleryLoaded=false/,"갤러리 메뉴 진입 시 최신 글 다시 불러오기");
  assert.match(appSource,/PATCH NOTES · v1\.1/,"1.1 패치노트 표시");
  assert.doesNotMatch(appSource,/PATCH NOTES · v1\.0\.1/,"1.0.1 단독 표기 제거");
  assert.match(appSource,/시즌 1 시작 · 8\.31 — 10\.31/,"시즌 1 기간 패치노트");
  assert.match(appSource,/SEASON_ONE_RESET_KEY[\s\S]{0,500}profile=resetProfile\(\)/,"시즌 1 최초 접속 데이터 초기화");
  assert.match(appSource,/특성 ‘박정희의 딸’의 비빨강 대상 추가 피해도 20에서 10으로 낮췄습니다\./,"박근혜 특성 너프 패치노트");
  assert.match(appSource,/id="forfeit-pvp"/,"진행 중 PvP 방 나가기 버튼");
  assert.match(appSource,/최대 \$\{penalty\}P가 차감됩니다[\s\S]*상대방은 승리로 처리/,"탈주 경고 문구");
  assert.match(appSource,/Math\.max\(0,\(Number\(profile\.currency\)\|\|0\)-deducted\)/,"탈주 페널티 재화 하한 0");
  assert.match(appSource,/claimedPvpMatches\?\.\[claimKey\]/,"PvP 결과 보상 중복 방지");
  assert.match(appSource,/initial\.state\.pvpMembers=ordered\.map/,"퇴장 후에도 PvP 좌석 순서 보존");
  const coinTypeMatch=appSource.match(/const COIN_EFFECT_TYPES=\[(.*?)\]/s);
  assert.ok(coinTypeMatch,"UI 공통 동전 효과 목록 존재");
  const uiCoinTypes=new Set([...coinTypeMatch[1].matchAll(/\"([^\"]+)\"/g)].map(match=>match[1]));
  const declaredCoinTypes=declaredTypes.filter(type=>/^coinFlip|^fixedCoin|^repeatCoin|^streakCoin|^pushYourLuck|^recoverThisStrategyOnCoinHeads/.test(type));
  declaredCoinTypes.forEach(type=>assert.ok(uiCoinTypes.has(type),`UI에서 누락된 동전 효과: ${type}`));
  assert.match(appSource,/function enqueueVisualEffect\(run,fallbackValue=undefined\)[\s\S]{0,500}run\(value=>resolve\(value===undefined\?fallbackValue:value\)\)/,"시각 효과 완료값을 호출자에게 보존");
  assert.match(appSource,/function showCoinFlip[\s\S]{0,1800}\},result\);/,"동전 연출 생략 시에도 실제 결과 보존");
}

{
  const raritySource=appSource.match(/function rarityTransferTarget[\s\S]*?function metricValue/)?.[0].replace(/function metricValue[\s\S]*/,"");
  assert.ok(raritySource,"시즌 1 희귀도 이월 함수 존재");
  const rarityContext=vm.createContext({
    RARITIES:["HR","SSR","SR","RR","R","U","C"],
    settings:{rarityOdds:{HR:0.5,SSR:3.5,SR:6,RR:10,R:20,U:25,C:35}},
    packCards:pack=>pack.cards,
    Math,
  });
  vm.runInContext(`${raritySource};globalThis.exports={rarityTransferTarget,packRarityOdds,drawFromPack};`,rarityContext);
  const pack={cards:[{id:"ssr",rarity:"SSR"},{id:"common",rarity:"C"}]};
  const odds=rarityContext.exports.packRarityOdds(pack);
  assert.equal(odds.SSR,65,"팩에 없는 HR~U 확률은 상위 SSR로 이월");
  assert.equal(odds.C,35,"존재하는 C 확률 유지");
  assert.equal(Object.values(odds).reduce((sum,value)=>sum+value,0),100,"이월 후 총 확률 100%");
  assert.equal(rarityContext.exports.rarityTransferTarget("HR",new Set(["SSR"])),"SSR","HR은 SSR로 이월");
  const draws=rarityContext.exports.drawFromPack(pack);
  assert.ok(draws.every(card=>card.id==="ssr"||card.id==="common"),"팩 외 희귀도 재추첨 없이 실제 카드 풀에서만 지급");
}

{
  const enqueueSource=appSource.match(/function enqueueVisualEffect\([^\n]+/)?.[0];
  const decideSource=appSource.match(/const decideCoinFace=[^\n]+/)?.[0];
  const showSource=appSource.match(/function showCoinFlip\([^\n]+/)?.[0];
  assert.ok(enqueueSource&&decideSource&&showSource,"동전 표시 함수 추출");
  const element=()=>({append(){},remove(){},classList:{add(){}},className:"",textContent:"",src:"",alt:""});
  const visualContext=vm.createContext({audioPrefs:{effects:true},visualEffectGeneration:0,visualEffectQueue:Promise.resolve(),document:{querySelectorAll:()=>[],createElement:element,body:{append(){}}},playCoinSound(){},setTimeout(callback){callback();},EFFECT_DURATION_MS:0,Math});
  vm.runInContext(`${enqueueSource}\n${decideSource}\n${showSource}`,visualContext);
  assert.equal(await vm.runInContext(`showCoinFlip({result:"heads"})`,visualContext),"heads","화면의 앞면 결과가 계산으로 전달됨");
  assert.equal(await vm.runInContext(`showCoinFlip({result:"tails"})`,visualContext),"tails","화면의 뒷면 결과가 계산으로 전달됨");
  visualContext.audioPrefs.effects=false;
  assert.equal(await vm.runInContext(`showCoinFlip({result:"heads"})`,visualContext),"heads","연출을 꺼도 동전 결과 유지");
}

{
  const rewardFunction=appSource.match(/function aiWinRewardKey[\s\S]*?function matchRewardText/)?.[0].replace(/function matchRewardText[\s\S]*/,"");
  assert.ok(rewardFunction,"대전 보상 함수 존재");
  const rewardContext=vm.createContext({
    settings:{reward:{aiWinEasy:90,aiWinNormal:110,aiWinHard:130,aiLoss:30,pvpWin:150,pvpLoss:50,pvpForfeitPenalty:30}},
    game:{rewardClaimed:false,aiOpponent:{level:"hard"},snapshot:()=>({pvpForfeit:{loserUserId:"me",winnerUserId:"other",penalty:30}})},
    currentUser:()=>({id:"me"}),pvpSession:{matchId:"match-1"},
    profile:{currency:12,claimedPvpMatches:{},records:{}},
    save(){},checkAchievements(){},notify(){}
  });
  vm.runInContext(rewardFunction,rewardContext);
  assert.equal(vm.runInContext(`matchRewardAmount(true,false)`,rewardContext),130,"상급 AI 승리 130P");
  rewardContext.game.aiOpponent.level="normal";
  assert.equal(vm.runInContext(`matchRewardAmount(true,false)`,rewardContext),110,"중급 AI 승리 110P");
  rewardContext.game.aiOpponent.level="easy";
  assert.equal(vm.runInContext(`matchRewardAmount(true,false)`,rewardContext),90,"입문 AI 승리 90P");
  assert.equal(vm.runInContext(`matchRewardAmount(false,false)`,rewardContext),30,"AI 패배 30P");
  assert.equal(vm.runInContext(`matchRewardAmount(true,true)`,rewardContext),150,"PvP 승리 150P");
  assert.equal(vm.runInContext(`matchRewardAmount(false,true)`,rewardContext),50,"PvP 패배 50P");
  vm.runInContext(`grantMatchReward(1,{pvp:true});`,rewardContext);
  assert.equal(rewardContext.profile.currency,0,"탈주 페널티 적용 후 재화는 음수가 되지 않음");
  assert.equal(rewardContext.profile.records.losses,1,"탈주자는 패배 기록");
  assert.equal(rewardContext.profile.records.pvpPlays,1,"탈주 대전도 PvP 완료 기록");
  assert.equal(rewardContext.profile.claimedPvpMatches["me:match-1"],true,"탈주 결과 중복 정산 방지 표식");

  const repeatTutorialContext=vm.createContext({
    settings:{reward:{aiWinEasy:90,aiWinNormal:110,aiWinHard:130,aiLoss:30,pvpWin:150,pvpLoss:50,pvpForfeitPenalty:30}},
    game:{rewardClaimed:false,tutorial:{rewardEligible:false},aiOpponent:{level:"easy"},snapshot:()=>({})},
    currentUser:()=>null,pvpSession:null,
    profile:{currency:250,claimedPvpMatches:{},records:{tutorial:1,plays:4,aiPlays:3,wins:2,aiWins:2}},
    save(){throw new Error("재도전 튜토리얼은 저장을 호출하면 안 됨");},
    checkAchievements(){throw new Error("재도전 튜토리얼은 도전과제를 갱신하면 안 됨");},
    notify(){throw new Error("재도전 튜토리얼은 보상 알림을 띄우면 안 됨");}
  });
  vm.runInContext(`${rewardFunction};grantMatchReward(0,{pvp:false});`,repeatTutorialContext);
  assert.equal(repeatTutorialContext.profile.currency,250,"튜토리얼 재도전 보상 차단");
  assert.deepEqual({...repeatTutorialContext.profile.records},{tutorial:1,plays:4,aiPlays:3,wins:2,aiWins:2},"튜토리얼 재도전 전적 및 도전과제 진행 차단");
  assert.equal(repeatTutorialContext.game.rewardClaimed,true,"튜토리얼 재도전 중복 정산 차단");
}

assert.match(forfeitSql,/create or replace function public\.forfeit_match/,"서버 탈주 RPC 존재");
assert.match(forfeitSql,/target\.status <> 'playing'/,"종료된 경기의 중복 탈주 차단");
assert.match(forfeitSql,/\{winner\}', to_jsonb\(winner_index\)/,"상대 승리 상태 확정");
assert.match(forfeitSql,/'penalty', 30/,"서버 고정 탈주 페널티 30P");
assert.match(forfeitSql,/delete from room_members where room_id = target\.room_id and user_id = actor/,"탈주자 방 멤버 제거");

console.log(`OK: 카드 효과 ${declaredTypes.length}종 구현 확인, AI 덱/튜토리얼/동전/PvP 회귀 테스트 통과`);

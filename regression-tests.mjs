import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const dataSource=fs.readFileSync(new URL("./data.js",import.meta.url),"utf8");
const engineSource=fs.readFileSync(new URL("./engine.js",import.meta.url),"utf8");
const appSource=fs.readFileSync(new URL("./app.js",import.meta.url),"utf8");
const forfeitSql=fs.readFileSync(new URL("./supabase/pvp-forfeit-hotfix.sql",import.meta.url),"utf8");
const context=vm.createContext({console,Math,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},window:{dispatchEvent(){}}});
vm.runInContext(`${dataSource}\n${engineSource}\nglobalThis.testExports={cards,cardById,settings,GameEngine};`,context);
const {cards,settings,GameEngine}=context.testExports;
const parkGeunHye=cards.find(card=>card.id==="character_04"),thaad=parkGeunHye?.skills?.[0];
assert.equal(thaad?.effects?.find(effect=>effect.type==="damage")?.amount,40,"박근혜 사드 배치 기본 피해");
assert.equal(thaad?.effects?.find(effect=>effect.type==="bonusDamageIfSelfHpAtLeast")?.amount,10,"박근혜 사드 배치 조건 추가 피해");
assert.match(thaad?.description||"",/추가 피해 10.*기본 40 피해/,"박근혜 카드 설명 수치");
assert.equal(parkGeunHye?.trait?.effects?.find(effect=>effect.type==="bonusDamageUnlessEnemyAttribute")?.amount,10,"박근혜 특성 조건 추가 피해");
assert.match(parkGeunHye?.trait?.description||"",/추가 피해 10/,"박근혜 특성 설명 수치");

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
  assert.match(appSource,/PATCH NOTES · v1\.0\.1/,"1.0.1 패치노트 표시");
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
  const rewardFunction=appSource.match(/function grantMatchReward[\s\S]*?function matchRewardText/)?.[0].replace(/function matchRewardText[\s\S]*/,"");
  assert.ok(rewardFunction,"대전 보상 함수 존재");
  const rewardContext=vm.createContext({
    settings:{reward:{pvpWin:90,pvpLoss:25,pvpForfeitPenalty:30}},
    game:{rewardClaimed:false,snapshot:()=>({pvpForfeit:{loserUserId:"me",winnerUserId:"other",penalty:30}})},
    currentUser:()=>({id:"me"}),pvpSession:{matchId:"match-1"},
    profile:{currency:12,claimedPvpMatches:{},records:{}},
    save(){},checkAchievements(){},notify(){}
  });
  vm.runInContext(`${rewardFunction};grantMatchReward(1,{pvp:true});`,rewardContext);
  assert.equal(rewardContext.profile.currency,0,"탈주 페널티 적용 후 재화는 음수가 되지 않음");
  assert.equal(rewardContext.profile.records.losses,1,"탈주자는 패배 기록");
  assert.equal(rewardContext.profile.records.pvpPlays,1,"탈주 대전도 PvP 완료 기록");
  assert.equal(rewardContext.profile.claimedPvpMatches["me:match-1"],true,"탈주 결과 중복 정산 방지 표식");
}

assert.match(forfeitSql,/create or replace function public\.forfeit_match/,"서버 탈주 RPC 존재");
assert.match(forfeitSql,/target\.status <> 'playing'/,"종료된 경기의 중복 탈주 차단");
assert.match(forfeitSql,/\{winner\}', to_jsonb\(winner_index\)/,"상대 승리 상태 확정");
assert.match(forfeitSql,/'penalty', 30/,"서버 고정 탈주 페널티 30P");
assert.match(forfeitSql,/delete from room_members where room_id = target\.room_id and user_id = actor/,"탈주자 방 멤버 제거");

console.log(`OK: 카드 효과 ${declaredTypes.length}종 구현 확인, 동전/PvP 회귀 테스트 통과`);

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
const compensationSql=fs.readFileSync(new URL("./supabase/v1.1.1-compensation.sql",import.meta.url),"utf8");
const dailyRewardSql=fs.readFileSync(new URL("./supabase/daily-login-reward.sql",import.meta.url),"utf8");
const multiDeckSql=fs.readFileSync(new URL("./supabase/v1.1.2-multi-decks.sql",import.meta.url),"utf8");
const context=vm.createContext({console,Math,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},window:{dispatchEvent(){}}});
vm.runInContext(`${dataSource}\n${engineSource}\nglobalThis.testExports={cards,cardById,settings,achievements,GameEngine};`,context);
const {cards,cardById,settings,achievements,GameEngine}=context.testExports;
assert.deepEqual({...settings.rarityOdds},{HR:0.5,SSR:3.5,SR:6,RR:10,R:20,U:25,C:35},"시즌 1 공식 카드팩 확률");
const parkGeunHye=cards.find(card=>card.id==="character_04"),thaad=parkGeunHye?.skills?.[0];
assert.equal(parkGeunHye?.hp,200,"박근혜 체력 상향");
assert.equal(thaad?.effects?.find(effect=>effect.type==="damage")?.amount,40,"박근혜 사드 배치 기본 피해");
assert.equal(thaad?.effects?.find(effect=>effect.type==="bonusDamageIfSelfHpAtLeast")?.amount,20,"박근혜 사드 배치 조건 추가 피해");
assert.equal(thaad?.effects?.find(effect=>effect.type==="bonusDamageIfSelfHpAtLeast")?.threshold,50,"박근혜 사드 배치 체력 기준");
assert.match(thaad?.description||"",/체력이 50 이상.*추가 피해 20.*기본 40 피해/,"박근혜 카드 설명 수치");
assert.equal(parkGeunHye?.trait?.effects?.find(effect=>effect.type==="bonusDamageUnlessEnemyAttribute")?.amount,10,"박근혜 특성 조건 추가 피해");
assert.match(parkGeunHye?.trait?.description||"",/추가 피해 10/,"박근혜 특성 설명 수치");
const yoonSeokYeol=cards.find(card=>card.id==="character_02");
assert.equal(yoonSeokYeol?.hp,250,"윤석열 체력 상향");
assert.equal(yoonSeokYeol?.skills?.[0]?.effects?.find(effect=>effect.type==="coinFlipDamageModifier")?.tailsBonus,-30,"윤석열 뒷면 동전 피해 감소 조정");
const hanDongHoon=cards.find(card=>card.id==="character_60");
assert.equal(hanDongHoon?.name,"한동훈 (가발)","한동훈 기본 폼은 가발");
assert.equal(hanDongHoon?.hp,170,"한동훈 체력 170");
assert.equal(hanDongHoon?.attribute,"gray","한동훈 기본 속성 회색");
assert.equal(hanDongHoon?.forms?.length,2,"한동훈 폼 두 종류");
assert.deepEqual({...hanDongHoon.forms[0].skills[0].cost},{gray:1,any:2},"한동훈 가발 기술 비용");
assert.equal(hanDongHoon.forms[0].weakness,"pink","한동훈 가발 약점");
assert.equal(hanDongHoon.forms[0].resistance,"blue","한동훈 가발 저항");
assert.deepEqual({...hanDongHoon.forms[1].skills[0].cost},{gray:2},"한동훈 대머리 기술 비용");
assert.equal(hanDongHoon.forms[1].weakness,"red","한동훈 대머리 약점");
assert.equal(hanDongHoon.forms[1].resistance,"pink","한동훈 대머리 저항");
assert.equal(cards.find(card=>card.id==="character_26")?.skills?.[1]?.cost?.any,1,"김민석 기술 2 아무 토큰 1 추가");
assert.equal(cards.find(card=>card.id==="character_54")?.skills?.[0]?.effects?.find(effect=>effect.type==="damage")?.amount,80,"김문수 기본 피해 하향");
assert.equal(cards.find(card=>card.id==="character_72")?.skills?.[1]?.effects?.find(effect=>effect.type==="damage")?.amount,80,"문크예거 기술 2 피해 하향");
assert.equal(cards.find(card=>card.id==="character_33")?.trait?.effects?.[0]?.color,"green","박원순 특성 초록 토큰 고정");
assert.equal(cards.find(card=>card.id==="character_12")?.skills?.[0]?.effects?.find(effect=>effect.type==="coinFlipDamageModifier")?.headsBonus,20,"박정희 앞면 추가 피해 상향");
assert.equal(cards.find(card=>card.id==="character_55")?.skills?.[0]?.cost?.brown,1,"허경영 기술 비용 갈색");
assert.equal(cards.find(card=>card.id==="character_63")?.skills?.[0]?.cost?.orange,3,"윤상현 기술 비용 주황");
assert.deepEqual([cards.find(card=>card.id==="character_73")?.weakness,cards.find(card=>card.id==="character_73")?.resistance],["purple","blue"],"찢칠라 약점/저항");
assert.deepEqual([cards.find(card=>card.id==="character_46")?.weakness,cards.find(card=>card.id==="character_46")?.resistance],["red","brown"],"박찬대 약점/저항");
assert.equal(cards.find(card=>card.id==="strategy_18")?.effects?.find(effect=>effect.type==="selfDamage")?.amount,40,"48시간 무박 유세 자해 피해");
assert.equal(cards.find(card=>card.id==="strategy_05")?.effects?.[0]?.type,"allowExtraAction","비선실세 기술 또는 특성 추가 행동");
assert.equal(cards.find(card=>card.id==="strategy_22")?.effects?.[0]?.amount,20,"강달프 영구 피해 경감 20");
assert.match(cards.find(card=>card.id==="strategy_22")?.description||"",/피해를 20 줄입니다/,"강달프 설명 수치 20");
const impeachmentEffect=cards.find(card=>card.id==="strategy_12")?.effects?.[0];
assert.equal(impeachmentEffect?.type,"discardEnemyActiveIfPackNoUseCount","탄핵 대통령 트래쉬 효과");
assert.equal(impeachmentEffect?.packId,"pack_president","탄핵 대통령 팩 대상");
assert.deepEqual([...(impeachmentEffect?.excludedIds||[])],["character_06"],"탄핵은 노무현을 대상에서 제외");
assert.match(cards.find(card=>card.id==="strategy_12")?.description||"",/대통령 카드\(노무현 제외\) 1장을 트래쉬.*사용 카운트를 소비하지 않습니다/,"탄핵 설명과 무료 교체 규칙");
assert.equal(cards.find(card=>card.id==="character_16")?.hp,140,"조 바이든 기본 체력 140");
for(const card of cards){
  const candidates=card.image?[card.image]:["png","jpg","jpeg","webp"].map(ext=>`assets/cards/${card.id}.${ext}`);
  assert.ok(candidates.some(path=>fs.existsSync(new URL(`./${path}`,import.meta.url))),`${card.id} 카드 이미지 파일 존재`);
  for(const form of card.forms||[])if(form.image)assert.ok(fs.existsSync(new URL(`./${form.image}`,import.meta.url)),`${card.id} ${form.id} 폼 이미지 파일 존재`);
}
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
  vm.runInContext(`${storageSource};globalThis.exports={defaultProfile,normalizeProfile,loadProfile,saveProfile,profileStorageKey,MAX_DECKS};`,storageContext);
  const first=storageContext.exports.defaultProfile(),second=storageContext.exports.defaultProfile();
  first.currency=777;second.currency=333;
  storageContext.exports.saveProfile(first,"user-a");storageContext.exports.saveProfile(second,"user-b");
  assert.equal(storageContext.exports.loadProfile("user-a").currency,777,"계정 A 로컬 캐시 분리");
  assert.equal(storageContext.exports.loadProfile("user-b").currency,333,"계정 B 로컬 캐시 분리");
  assert.notEqual(storageContext.exports.profileStorageKey("user-a"),storageContext.exports.profileStorageKey("user-b"),"계정별 저장 키 분리");
  const migrated=storageContext.exports.normalizeProfile({deck:["legacy-card"],currency:250});
  assert.equal(migrated.decks.length,1,"기존 단일 덱 프로필을 첫 번째 덱으로 이전");
  assert.equal(migrated.decks[0].cards[0],"legacy-card","기존 덱 카드 보존");
  assert.equal(migrated.activeDeckId,"deck-1","기존 덱을 활성 덱으로 지정");
  const three=storageContext.exports.normalizeProfile({decks:[{id:"a",name:"공격",cards:["a"]},{id:"b",name:"방어",cards:["b"]},{id:"c",name:"견제",cards:["c"]},{id:"d",name:"초과",cards:["d"]}],activeDeckId:"b"});
  assert.equal(three.decks.length,storageContext.exports.MAX_DECKS,"덱 슬롯 최대 3개 제한");
  assert.equal(three.deck[0],"b","선택한 덱의 카드가 실제 대전 덱으로 연결");
}

{
  assert.match(backendSource,/async getGameProfile\(userId\)[\s\S]*rpc\("get_game_profile"\)/,"서버 게임 프로필 불러오기 API");
  assert.match(backendSource,/async saveGameProfile\(userId, profile, expectedRevision, seasonId\)[\s\S]*rpc\("save_game_profile"/,"서버 게임 프로필 저장 API");
  assert.match(appSource,/function syncAccountGameProfile[\s\S]{0,1800}getGameProfile[\s\S]{0,1800}saveGameProfile/,"로그인 시 서버 프로필 로드 또는 최초 이전");
  assert.match(appSource,/const save = \(\) => \{ syncActiveDeckSlot\(\);saveProfile\(profile,authSession\?\.user\?\.id\|\|null\);queueServerProfileSave\(\)/,"모든 진행 저장 시 활성 덱과 계정별 서버 동기화 예약");
  assert.match(appSource,/game_profile_revision_conflict/,"다른 기기 동시 저장 충돌 감지");
  assert.match(appSource,/if\(session\?\.user\)\{await syncAccountGameProfile\(\);reward=await claimDailyLoginReward\(\);\}/,"자동 로그인 시 서버 진행 및 출석 보상 불러오기");
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
const copy=value=>JSON.parse(JSON.stringify(value));

{
  const engine=battle({enemyAttribute:"red"});
  engine.state.players[0].active={...copy(hanDongHoon),currentHp:90};
  engine.effects(0,hanDongHoon.trait.effects,{actionType:"trait"});
  assert.equal(engine.state.players[0].active.formId,"bald","한동훈 폼 체인지로 대머리 전환");
  assert.equal(engine.state.players[0].active.currentHp,90,"한동훈 폼 체인지 현재 체력 유지");
  assert.equal(engine.state.players[0].active.attribute,"gray","한동훈 대머리 폼도 회색 속성");
  assert.equal(engine.state.players[0].active.skills[0].name,"탈모","한동훈 대머리 기술 전환");

  const placement=new GameEngine([],()=>{},[]),player=placement.state.players[0];
  placement.state.phase="choose-active";placement.state.turn=0;player.hand=["character_60"];
  assert.equal(placement.chooseActive(0,"character_60"),true,"한동훈 배치 가능");
  assert.equal(player.active.formId,"wig","한동훈을 새로 내려놓으면 가발 기본 폼");
}

{
  const groundC=cards.find(card=>card.id==="character_58"),skill=groundC.skills[0],engine=battle();
  engine.state.players[0].tokens.red=3;
  engine.effects(0,skill.effects,{actionType:"skill"});
  assert.equal(engine.state.players[0].tokens.red,0,"그라운드 C 잔여 빨강 토큰 전부 소모");
  assert.equal(damageTaken(engine),150,"그라운드 C 잔여 빨강 3개 추가 피해 적용");
  const traitEngine=battle({enemyTokens:{red:3}});traitEngine.state.players[0].active={...copy(groundC),currentHp:150};
  traitEngine.effects(0,groundC.trait.effects,{actionType:"trait",tokenColor:"gray"});
  assert.equal(traitEngine.state.players[1].tokens.red,0,"그라운드 C 특성이 상대 빨강 토큰 전부 변환");
  assert.equal(traitEngine.state.players[1].tokens.gray,3,"그라운드 C 특성이 선택한 다른 색으로 변환");
  assert.equal(traitEngine.state.players[0].active.currentHp,120,"그라운드 C 특성 반동 피해 적용");
}

{
  const kimMoonSoo=cards.find(card=>card.id==="character_54"),engine=battle();
  engine.state.players[0].discard=["character_53"];
  engine.state.players[1].discard=["character_52"];
  engine.effects(0,kimMoonSoo.trait.effects,{actionType:"trait",trashCharacterId:"character_53"});
  assert.ok(engine.state.players[0].hand.includes("character_53"),"김문수는 자신의 트래쉬에서 인물 회수");
  assert.deepEqual([...engine.state.players[1].discard],["character_52"],"김문수 회수는 상대 트래쉬와 분리");

  const tails=battle({enemyTokens:{red:2,blue:2}});
  tails.effects(0,kimMoonSoo.skills[0].effects,{actionType:"skill",coinResult:"tails"});
  assert.equal(tails.state.players[0].tokens.red,1,"김문수 뒷면이면 기본 빨강 토큰만 획득");
  assert.equal(tails.state.players[0].tokens.blue,0,"김문수 뒷면에 추가 토큰 획득 없음");
  const heads=battle({enemyTokens:{red:2,blue:2}});
  heads.effects(0,kimMoonSoo.skills[0].effects,{actionType:"skill",coinResult:"heads",stealColor:"red"});
  assert.equal(heads.state.players[0].tokens.red,2,"김문수 앞면이면 토큰 1개 추가 획득");
  const noRed=battle({enemyTokens:{blue:2}});
  noRed.effects(0,[{type:"stealSpecificToken",color:"red",amount:1}],{actionType:"trait"});
  assert.equal(noRed.state.players[0].tokens.blue,0,"지정 빨강 토큰이 없을 때 다른 색을 잘못 가져오지 않음");
}

{
  const putin=cards.find(card=>card.id==="character_35"),skill=putin.skills[0];
  const american=battle();american.state.players[1].active.tags=["foreign","usa"];
  american.effects(0,skill.effects,{actionType:"skill"});
  assert.equal(damageTaken(american),130,"푸틴은 미국 태그 대상에게 기본 피해");
  const nonAmerican=battle();nonAmerican.state.players[1].active.tags=["foreign"];
  nonAmerican.effects(0,skill.effects,{actionType:"skill"});
  assert.equal(damageTaken(nonAmerican),150,"푸틴은 미국 태그가 없는 대상에게 추가 피해");
}

{
  const xi=cards.find(card=>card.id==="character_40"),engine=battle({enemyHp:500});
  engine.effects(0,xi.skills[0].effects,{actionType:"skill"});
  engine.endTurn(0,"gray");
  assert.equal(engine.state.turn,1,"시진핑 사용 후 상대 턴 시작");
  assert.equal(engine.state.actionAvailable,false,"시진핑 효과로 상대 행동 차단");
  assert.equal(engine.endTurn(1,"blue"),true,"행동이 막힌 상대도 토큰을 받고 턴 종료 가능");
  assert.equal(engine.state.players[1].tokens.blue,1,"시진핑 효과 중 상대 토큰 정상 획득");
}

{
  const kimJongIl=cards.find(card=>card.id==="character_67"),engine=battle();
  engine.state.players[0].active={...copy(kimJongIl),currentHp:150};
  engine.effects(0,kimJongIl.skills[0].effects,{actionType:"skill"});
  assert.equal(engine.state.players[0].active.hp,140,"김정일 최대 체력 160에서 140으로 감소");
  assert.equal(engine.state.players[0].active.currentHp,140,"김정일 현재 체력이 새 최대 체력보다 높으면 함께 감소");
}

{
  const yongHyeIn=cards.find(card=>card.id==="character_71"),engine=battle({enemyTokens:{red:2,blue:1}});
  engine.effects(0,yongHyeIn.skills[0].effects,{actionType:"skill"});
  engine.endTurn(0,"pink");
  assert.equal(engine.state.players[1].tokens.red,0,"용혜인 사용 직후 상대 턴 동안 압류 토큰 미보유");
  engine.endTurn(1,"green");
  assert.equal(engine.state.turn,0,"용혜인 효과 뒤 다시 내 차례");
  assert.equal(engine.state.players[1].tokens.red,2,"용혜인 압류 빨강 토큰 반환");
  assert.equal(engine.state.players[1].tokens.blue,1,"용혜인 압류 파랑 토큰 반환");
  assert.equal(engine.state.players[1].tokens.green,1,"상대가 턴 종료로 새로 받은 토큰 유지");
}

{
  const impeachment=cards.find(card=>card.id==="strategy_12"),engine=battle();
  const target=cards.find(card=>card.id==="character_07"),replacement=cards.find(card=>card.id==="character_08");
  engine.state.players[1].active={...copy(target),currentHp:170};
  engine.state.players[1].hand=[replacement.id];
  engine.state.players[1].characterUses=2;
  engine.effects(0,impeachment.effects,{actionType:"strategy"});
  assert.equal(engine.state.players[1].active,null,"탄핵은 모든 대통령을 필드에서 제거");
  assert.ok(engine.state.players[1].discard.includes(target.id),"탄핵된 대통령은 덱이 아닌 트래쉬로 이동");
  assert.equal(engine.state.players[1].characterUses,2,"탄핵 직후 기존 인물 사용 카운트 유지");
  engine.endTurn(0,"red");
  assert.equal(engine.completeForcedReplacement(1,replacement.id),true,"탄핵 후 상대 인물 강제 교체");
  assert.equal(engine.state.players[1].characterUses,2,"탄핵 교체 인물은 사용 카운트 미소비");
  const excluded=battle();excluded.state.players[1].active={...copy(cards.find(card=>card.id==="character_06")),currentHp:250};
  excluded.effects(0,impeachment.effects,{actionType:"strategy"});
  assert.equal(excluded.state.players[1].active.id,"character_06","노무현은 탄핵 대상에서 제외");
  assert.equal(excluded.state.players[1].discard.length,0,"탄핵 제외된 노무현은 트래쉬되지 않음");
  const noTarget=battle();noTarget.state.players[1].active={...copy(cards.find(card=>card.id==="character_58")),currentHp:150};
  noTarget.effects(0,impeachment.effects,{actionType:"strategy"});
  assert.equal(noTarget.state.players[1].active.name,"그라운드 C","탄핵은 대통령 카드가 아닌 인물에게 적용되지 않음");
}

{
  const spy=cards.find(card=>card.id==="strategy_25"),engine=battle(),me=engine.state.players[0],enemy=engine.state.players[1];
  me.hand=[spy.id,"character_18"];me.deck=[];enemy.hand=["character_19","character_20"];
  assert.equal(engine.useStrategy(0,spy.id,{stealHandId:"character_20"}),true,"간첩 카드 실제 사용 성공");
  assert.ok(me.discard.includes(spy.id),"간첩 확인 선택을 마치면 카드 트래쉬");
  assert.ok(me.hand.includes("character_20"),"간첩으로 선택한 상대 카드 획득");
  assert.ok(enemy.hand.includes("character_19"),"간첩으로 선택하지 않은 카드는 상대에게 반환");
  const revealPicker=appSource.match(/function chooseRevealedEnemyHandCard[^\n]+/)?.[0]||"";
  assert.match(revealPicker,/querySelector\("#close-modal"\)\?\.remove\(\)/,"간첩 카드 확인 후 닫기로 사용 취소 불가");
  assert.doesNotMatch(revealPicker,/keepModalOpenOnClose/,"간첩 앞면 확인창에 취소 처리 없음");
}

{
  const disruptionSource=appSource.match(/function aiDisruptionTokenColor[^\n]+/)?.[0];
  assert.ok(disruptionSource,"그라운드 C AI 방해 색 선택 함수 존재");
  const aiContext=vm.createContext({settings:{tokenTypes:["red","blue","green","yellow","purple","pink","orange","brown","black","white","gray"]}});
  vm.runInContext(`${disruptionSource};globalThis.pick=aiDisruptionTokenColor;`,aiContext);
  const chosen=aiContext.pick({players:[{active:{skills:[{cost:{red:2}}]},tokens:{red:3}},{active:cards.find(card=>card.id==="character_58"),tokens:{}}]},1,"red");
  assert.notEqual(chosen,"red","그라운드 C AI가 빨강 토큰을 다시 빨강으로 변환하지 않음");
  assert.match(appSource,/if\(e\.type==="convertAllEnemyTokensByColor"\)[\s\S]{0,120}count\*35/,"AI가 상대 빨강 토큰 수를 특성 가치에 반영");
  assert.match(appSource,/action\.type==="trait"[\s\S]{0,350}aiEffectUtilityScore/,"AI 특성 선택 점수에 변환 효과 반영");
  const scoringSource=appSource.match(/function aiBonusDamage[\s\S]*?function aiShouldUseOptionalCoin/)?.[0].replace(/function aiShouldUseOptionalCoin[\s\S]*/,"");
  const decisionContext=vm.createContext({cards,cardById,settings,RARITIES:["HR","SSR","SR","RR","R","U","C"],clone:value=>JSON.parse(JSON.stringify(value)),isVmaxCard:card=>card?.stage==="vmax",game:{canEvolve:()=>false,canUseSkill:()=>false,activeMatchesName:()=>false}});
  vm.runInContext(`${scoringSource};globalThis.choose=aiBestAction;`,decisionContext);
  const aiState={players:[{active:{id:"target",name:"상대",type:"character",attribute:"blue",hp:200,currentHp:200,skills:[{cost:{blue:2}}]},tokens:{red:3,blue:0},hand:[],deck:[],discard:[]},{active:{...JSON.parse(JSON.stringify(cards.find(card=>card.id==="character_58"))),currentHp:150},tokens:{red:0},hand:[],deck:[],discard:[],traitUsedThisTurn:false}]};
  assert.equal(decisionContext.choose(aiState)?.type,"trait","AI가 상대 빨강 토큰이 있을 때 그라운드 C 특성을 행동으로 선택");
}

{
  const engine=battle();engine.state.actionAvailable=false;engine.state.players[0].traitUsedThisTurn=true;
  engine.effects(0,cards.find(card=>card.id==="strategy_05").effects,{actionType:"strategy"});
  assert.equal(engine.state.actionAvailable,true,"비선실세로 기술 또는 특성 행동권 복구");
  assert.equal(engine.state.players[0].traitUsedThisTurn,false,"비선실세로 이번 턴 특성 재사용 허용");
}

{
  const playable=cards.filter(card=>card.type==="character"&&!card.stage?.includes("vmax"));
  const strategies=cards.filter(card=>card.type==="strategy");
  const makeDeck=offset=>[
    ...Array.from({length:7},(_,i)=>playable[(offset*7+i*5)%playable.length].id),
    ...Array.from({length:3},(_,i)=>strategies[(offset*3+i*7)%strategies.length].id),
  ].filter((id,index,list)=>list.indexOf(id)===index);
  const fillDeck=(deck,offset)=>{for(const card of [...playable,...strategies]){if(deck.length>=10)break;if(!deck.includes(card.id))deck.push(card.id);}return deck;};
  const runRandomAiMatch=offset=>{
    const engine=new GameEngine(fillDeck(makeDeck(offset),offset),()=>{},fillDeck(makeDeck(offset+4),offset+4));
    engine.state.phase="choose-active";engine.state.turn=0;
    const first=engine.state.players[0].hand.find(id=>cardById[id]?.type==="character"&&cardById[id]?.stage!=="vmax");
    const second=engine.state.players[1].hand.find(id=>cardById[id]?.type==="character"&&cardById[id]?.stage!=="vmax");
    assert.ok(first&&second,`무작위 AI 대전 ${offset} 시작 인물 확보`);
    engine.chooseActive(0,first);engine.chooseActive(1,second);engine.state.phase="playing";engine.state.turn=0;engine.state.actionAvailable=true;
    let turns=0;
    while(engine.state.winner==null&&turns<80){
      const index=engine.state.turn,p=engine.state.players[index];
      if(engine.state.phase==="choose-replacement"){
        const id=p.hand.find(id=>cardById[id]?.type==="character"&&cardById[id]?.stage!=="vmax");
        if(!id){engine.end(1-index);break;}
        if(p.forcedReplacement)engine.completeForcedReplacement(index,id);else engine.chooseActive(index,id,{replacement:true});
      }
      if(engine.state.phase==="forced-end"){engine.endTurn(index,p.active?.attribute||"gray");turns++;continue;}
      if(p.active?.faceDown){engine.flipFaceDownActive(index,{coinResult:"heads",tokenColor:p.active.attribute||"gray"});turns++;continue;}
      if(engine.state.actionAvailable){
        const skillIndex=(p.active?.skills||[]).findIndex(skill=>engine.canUseSkill(p,skill.cost,skill.effects,engine.state.players[1-index]));
        if(skillIndex>=0)engine.useSkill(index,skillIndex,{coinResult:turns%2?"heads":"tails",coinResults:["heads","tails","heads","tails","heads"]});
        else if(p.active?.trait&&!p.active.trait.auto&&!p.active.trait.passive&&!p.traitUsedThisTurn)engine.useTrait(index,{coinResult:"heads",coinResults:["heads","tails"]});
      }
      if(engine.state.winner==null&&["playing","forced-end"].includes(engine.state.phase)&&engine.state.turn===index)engine.endTurn(index,p.active?.attribute||"gray");
      turns++;
    }
    assert.ok(turns>0&&turns<=80,`무작위 AI 대전 ${offset} 턴 진행`);
    return engine.state.winner;
  };
  for(let match=1;match<=12;match++)runRandomAiMatch(match);
}

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
  const transformSource=appSource.match(/const pvpClone[\s\S]*?function stopPvpWatch/)?.[0].replace(/function stopPvpWatch[\s\S]*/,"");
  assert.ok(transformSource,"PvP 좌석 변환 함수 존재");
  const transformContext=vm.createContext({});
  vm.runInContext(`let pvpSession={seat:1};${transformSource};globalThis.pvpExports={flipPvpState,pvpLocalState,pvpWireState};`,transformContext);
  const wire={players:[{name:"host",hand:["a"]},{name:"guest",hand:["b"],replacementDoesNotCount:true}],turn:0,first:1,winner:null,setupChoice:{second:0},pvpSetupPending:[true,false],pvpLastAction:{actor:0},phase:"playing"};
  transformContext.wire=wire;
  const local=vm.runInContext("pvpExports.pvpLocalState(wire)",transformContext);
  assert.equal(local.players[0].name,"guest","PvP 2번 좌석에서 내 플레이어가 0번으로 변환");
  assert.equal(local.turn,1,"PvP 좌석 변환 시 턴 인덱스 반전");
  assert.equal(local.setupChoice.second,1,"PvP 배치 선택 좌석 반전");
  assert.deepEqual([...local.pvpSetupPending],[false,true],"PvP 초기 배치 대기 순서 반전");
  assert.equal(local.pvpLastAction.actor,1,"PvP 마지막 행동 주체 반전");
  transformContext.local=local;
  const roundTrip=vm.runInContext("pvpExports.pvpWireState(local)",transformContext);
  assert.equal(JSON.stringify(roundTrip),JSON.stringify(wire),"PvP 로컬↔서버 상태 왕복 보존");
  assert.equal(roundTrip.players[1].replacementDoesNotCount,true,"PvP에서 탄핵 무료 교체 상태 보존");
  assert.equal(wire.players[0].name,"host","PvP 좌석 변환은 원본 상태를 변경하지 않음");
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
  assert.match(appSource,/PATCH NOTES · v1\.1\.2/,"1.1.2 패치노트 표시");
  assert.match(appSource,/PATCH NOTES · v1\.1\.1/,"1.1.1 패치노트 존치");
  assert.match(appSource,/PATCH NOTES · v1\.1(?!\.)/,"1.1 패치노트 존치");
  assert.match(appSource,/SEASON_ONE_RESET_KEY[\s\S]{0,500}profile=resetProfile\(\)/,"시즌 1 최초 접속 데이터 초기화");
  assert.match(appSource,/중복 1장마다 팩 가격의 20%/,"중복 보상 패치노트");
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
  const values=new Map();let nextId=0;
  const localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
  const backendContext=vm.createContext({console,window:{POLITIMON_SUPABASE:{}},localStorage,crypto:{randomUUID:()=>`preview-${++nextId}`},Date,Intl,Math,JSON,Promise});
  vm.runInContext(backendSource,backendContext);
  const api=backendContext.window.politimonBackend;
  const attendanceEmail="attendance@example.test",attendance=(await api.signUp(attendanceEmail,"pw","출석자")).user;
  await api.saveGameProfile(attendance.id,{collection:{},deck:[],currency:250,achievements:{},claimedPvpMatches:{},records:{}},null,"season-1");
  const firstReward=await api.claimDailyLoginReward(attendance.id,new Date("2026-09-01T15:00:01.000Z"));
  assert.equal(firstReward.claimed,true,"한국 날짜 기준 첫 로그인 출석 보상 지급");
  assert.equal(firstReward.amount,50,"출석 보상 50P");
  assert.equal(firstReward.profile.currency,300,"출석 보상 지급 후 프로필 재화 반영");
  assert.equal(firstReward.revision,2,"출석 보상 지급과 프로필 버전 원자적 갱신");
  await api.signOut();
  const relogin=(await api.signIn(attendanceEmail,"pw")).user;
  assert.equal(relogin.id,attendance.id,"미리보기 재로그인에서도 동일 계정 유지");
  const repeatedReward=await api.claimDailyLoginReward(relogin.id,new Date("2026-09-02T14:59:59.000Z"));
  assert.equal(repeatedReward.claimed,false,"같은 한국 날짜 재로그인 중복 지급 차단");
  assert.equal(repeatedReward.amount,0,"중복 로그인 보상 0P");
  assert.equal(repeatedReward.profile.currency,300,"중복 로그인 후 재화 불변");
  assert.equal(repeatedReward.revision,2,"중복 로그인 후 프로필 버전 불변");
  const nextDayReward=await api.claimDailyLoginReward(relogin.id,new Date("2026-09-02T15:00:00.000Z"));
  assert.equal(nextDayReward.claimed,true,"한국 자정 이후 다음 날 출석 보상 지급");
  assert.equal(nextDayReward.profile.currency,350,"다음 날 50P 추가 지급");
  const nextDayRepeated=await api.claimDailyLoginReward(relogin.id,new Date("2026-09-02T23:00:00.000Z"));
  assert.equal(nextDayRepeated.claimed,false,"다음 날도 두 번째 로그인 중복 지급 차단");
  assert.equal(nextDayRepeated.profile.currency,350,"여러 번 로그인해도 하루 총 50P만 지급");
  const host=(await api.signUp("host@example.test","pw","방장")).user;
  const room=await api.createRoom({title:"회귀 테스트 방",isPrivate:true,password:"1234"},host);
  assert.equal(room.members.length,1,"멀티플레이 미리보기 방 생성");
  const guest=(await api.signIn("guest@example.test","pw")).user;
  await assert.rejects(()=>api.joinRoom(room.id,"0000",guest),/비밀번호/,"비공개 방 비밀번호 검증");
  await api.joinRoom(room.id,"1234",guest);
  await api.setReady(room.id,true);
  const readyRoom=await api.getRoom(room.id);
  assert.equal(readyRoom.members.length,2,"멀티플레이 두 사용자 입장");
  assert.ok(readyRoom.members.every(member=>member.ready),"멀티플레이 두 사용자 준비 완료");
  const hostLeave=await api.leaveRoom(room.id,host);
  assert.equal(hostLeave.deleted,false,"방장 퇴장 후 방 유지");
  const promoted=await api.getRoom(room.id);
  assert.equal(promoted.owner_id,guest.id,"방장 퇴장 후 참가자에게 방장 승계");
  assert.equal(promoted.members[0].is_host,true,"승계된 방장 플래그 반영");
  const guestLeave=await api.leaveRoom(room.id,guest);
  assert.equal(guestLeave.deleted,true,"마지막 참가자 퇴장 시 방 삭제");
  assert.equal(await api.getRoom(room.id),null,"삭제된 방 재조회 불가");
  assert.match(backendSource,/rpc\("submit_match_state", \{ p_match_id:matchId, p_expected_version:version, p_state:state, p_next_turn_user_id:nextTurnUserId, p_action:action \}\)/,"Supabase PvP 상태 저장 RPC 인자 보존");
  assert.match(backendSource,/rpc\("forfeit_match", \{ p_match_id:matchId, p_expected_version:version \}\)/,"Supabase PvP 탈주 RPC 버전 검증 인자 보존");
  assert.match(backendSource,/rpc\("claim_daily_login_reward"\)/,"운영 서버 출석 보상 RPC 연결");
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
  const duplicateSource=appSource.match(/function duplicatePackReward[\s\S]*?async function openPack/)?.[0].replace(/async function openPack[\s\S]*/,"");
  assert.ok(duplicateSource,"중복 보상 계산 함수 추출");
  const duplicateContext=vm.createContext({Math,Number,Object,Set});
  vm.runInContext(`${duplicateSource};globalThis.exports={duplicatePackReward,duplicatePullIndexes};`,duplicateContext);
  for(let count=1;count<=5;count++)assert.equal(duplicateContext.exports.duplicatePackReward(220,count),44*count,`중복 ${count}장 팩 가격 보상 비율`);
  const indexes=duplicateContext.exports.duplicatePullIndexes({owned:1},[{id:"owned"},{id:"new"},{id:"new"},{id:"third"},{id:"owned"}]);
  assert.deepEqual([...indexes],[0,2,4],"팩 내부에서 처음 나온 신규 카드는 획득, 같은 팩의 두 번째부터 중복 처리");
  assert.match(appSource,/profile\.currency-=price;profile\.currency\+=reward/,"팩 가격 차감 후 중복 보상 지급 순서");
}

{
  assert.match(compensationSql,/values \('v1\.1\.1-duplicate-compensation'\)/,"1.1.1 보상 캠페인 고정");
  assert.match(compensationSql,/select profiles\.id, new_campaign\.patch_id, 200[\s\S]*from public\.profiles/,"패치 당시 전체 가입자 200P 대상 등록");
  assert.match(compensationSql,/currency = profiles\.currency \+ claimed\.amount/,"기존 게임 프로필 200P 즉시 지급");
  assert.match(compensationSql,/before insert on public\.game_profiles/,"아직 게임 프로필 없는 기존 가입자 첫 저장 지급");
  assert.match(compensationSql,/on conflict \(patch_id\) do nothing/,"보상 캠페인 재실행 중복 방지");
}

{
  assert.match(dailyRewardSql,/reward_amount constant integer := 50/,"일일 출석 보상 50P 고정");
  assert.match(dailyRewardSql,/timezone\('Asia\/Seoul', now\(\)\)::date/,"출석일 한국 표준시 기준");
  assert.match(dailyRewardSql,/last_daily_login_date is distinct from reward_date/,"같은 날 중복 지급 조건 차단");
  assert.match(dailyRewardSql,/currency = currency \+ reward_amount[\s\S]*revision = revision \+ 1/,"재화와 프로필 버전 동시 갱신");
  assert.match(dailyRewardSql,/grant execute on function public\.claim_daily_login_reward\(\) to authenticated/,"인증 사용자만 출석 보상 실행");
  const claimCalls=appSource.match(/await claimDailyLoginReward\(\)/g)||[];
  assert.equal(claimCalls.length,5,"회원가입·두 로그인 화면·자동 로그인에 출석 확인 연결");
  assert.match(appSource,/pushNotification\("오늘의 출석 보상",`매일 첫 로그인 보상/,"출석 지급 알림 기록");
}

{
  assert.match(multiDeckSql,/add column if not exists decks jsonb/,"1.1.2 다중 덱 서버 필드 추가");
  assert.match(multiDeckSql,/jsonb_array_length\(decks_value\)>3/,"서버에서도 덱 최대 3개 제한");
  assert.match(multiDeckSql,/jsonb_build_object\('id','deck-1','name','덱 1','cards',deck\)/,"기존 덱을 덱 1로 안전하게 이전");
  assert.match(multiDeckSql,/'decks',decks,'activeDeckId',active_deck_id/,"덱 이름과 활성 덱 서버 응답 포함");
  assert.match(multiDeckSql,/last_daily_login_date is distinct from reward_date/,"1.1.2 적용 뒤에도 출석 중복 지급 방지 유지");
  assert.match(appSource,/function createDeck\(\)[^\n]+profile\.decks\.length>=MAX_DECKS/,"덱 추가 최대 3개 제한");
  assert.match(appSource,/function renameActiveDeck\(value\)[^\n]+slice\(0,20\)/,"덱 이름 20자 제한");
  assert.match(appSource,/data-select-deck/,"덱 전환 UI 제공");
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

console.log(`OK: 출석 보상 중복 로그인, 카드 효과 ${declaredTypes.length}종, AI 모의 대전 12회, 튜토리얼/동전/PvP 회귀 테스트 통과`);

const clone = value => JSON.parse(JSON.stringify(value));
const shuffle = list => { const a=[...list]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; };
const emptyTokens = () => Object.fromEntries(settings.tokenTypes.map(t=>[t,0]));
const isPlayableOpeningCharacter = id => cardById[id]?.type==="character"&&!isVmaxCard(cardById[id]);
const openingDeck = deck => {
  const size=settings.initialHandSize||4;
  if(!deck.some(isPlayableOpeningCharacter))return shuffle(deck);
  let shuffled=shuffle(deck);
  while(!shuffled.slice(0,size).some(isPlayableOpeningCharacter))shuffled=shuffle(deck);
  return shuffled;
};

class GameEngine {
  constructor(playerDeck, onUpdate, opponentDeck=null) { this.onUpdate=onUpdate; this.log=[]; this.state=this.createState(playerDeck,opponentDeck); }
  createState(playerDeck, opponentDeckInput=null) {
    const usable = playerDeck.filter(id=>cardById[id]);
    const opponentUsable = (opponentDeckInput||[]).filter(id=>cardById[id]);
    const opponentDeck = shuffle(opponentUsable.length ? opponentUsable : Object.keys(cardById));
    const s = { phase:"setup", turn:null, first:null, winner:null, actionAvailable:false, setupChoice:null,
      players:[this.makePlayer("나",usable),this.makePlayer("AI",opponentDeck)], log:[] };
    s.players.forEach(p=>this.draw(p,settings.initialHandSize)); return s;
  }
  makePlayer(name,deck) { return { name, deck:openingDeck(deck), hand:[], active:null, tokens:emptyTokens(), characterUses:0, discard:[], replacementRequired:false, replacementDoesNotCount:false, traitUsedThisTurn:false, traitAfterSkillAvailable:false, pendingDamage:0, nextSkillBlocked:false, skillBlockedThisTurn:false, nextActionBlocked:false, actionBlockedThisTurn:false, forceNextCoinHeads:false, skillDamageMultiplierThisTurn:1, skillDamageMultiplierNextTurn:1, skillDamageBonusThisTurn:0, skillDamageBonusNextTurn:0, damageReductionRulesThisTurn:[], damageReductionRulesNextTurn:[], skillCostIncreaseThisTurn:0, skillCostIncreaseNextTurn:0, actionCostIncreaseThisTurn:0, actionCostIncreaseNextTurn:0, extraTokensThisTurn:0, nextTurnExtraTokens:0, skipTokenGainThisTurn:false, skipTokenGainNextTurn:false, suspendedTokensReturn:null, freeRetreatThisTurn:false, protectedPackThisTurn:null, protectedPackNextOpponentTurn:null, reflectDamageThisTurn:false, reflectDamageNextOpponentTurn:false, previousOpponentAttackDamage:0, currentOpponentAttackDamage:0, roundDamageTo10ThisTurn:false }; }
  snapshot(){ return clone(this.state); }
  emit(message){ if(message) this.state.log.unshift(message); this.onUpdate(this.snapshot()); }
  draw(player,n=1){ for(let i=0;i<n;i++){const id=player.deck.shift(); if(id) player.hand.push(id);} }
  hasPlayableCharacterInHand(index){return this.state.players[index]?.hand.some(isPlayableOpeningCharacter);}
  loseIfNoPlayableCharacter(index){const p=this.state.players[index];if(this.state.winner!=null||!p||p.active||this.hasPlayableCharacterInHand(index))return false;this.emit(`${p.name}은(는) 배치할 인물 카드가 없어 패배합니다.`);this.end(1-index);return true;}
  setup(first) { this.state.first=first; this.state.turn=first; this.state.phase="choose-active"; this.state.setupChoice={ second:1-first, inspected:false }; this.emit(`${this.state.players[first].name}이(가) 선공입니다.`); }
  chooseActive(index,cardId,{replacement=false}={}) { const p=this.state.players[index], card=cardById[cardId]; if(!card||card.type!=="character"||isVmaxCard(card)||!p.hand.includes(cardId)) return false;
    if(replacement&&(this.state.phase!=="choose-replacement"||this.state.turn!==index||!p.replacementRequired))return false;
    const countsAsCharacterUse=!(replacement&&p.replacementDoesNotCount); p.hand.splice(p.hand.indexOf(cardId),1); p.active={...clone(card),currentHp:card.hp}; if(countsAsCharacterUse)p.characterUses++; p.replacementRequired=false; p.replacementDoesNotCount=false; p.traitUsedThisTurn=false;if(p.pendingDamage&&p.active){p.active.currentHp-=p.pendingDamage;this.emit(`${p.active.name}에게 초과 피해 ${p.pendingDamage}`);p.pendingDamage=0;if(p.active.currentHp<=0){this.removeActive(index,"defeated");return true;}}this.applyAutoTraits(index);
    if(p.characterUses>3) { this.end(index===0?1:0); return false; }
    if(replacement){ this.state.phase="playing"; this.state.actionAvailable=!p.forcedReplacement; p.forcedReplacement=false; }
    else if(index===this.state.turn) { this.state.phase="playing"; this.state.actionAvailable=true; }
    this.emit(`${p.name}: ${card.name} 배치 (${p.characterUses}/3)`); return true;
  }
  inspectSecondPlayerTop() { const idx=this.state.setupChoice?.second, p=this.state.players[idx]; if(idx==null) return null; if(!this.state.setupChoice.inspected){this.state.setupChoice.inspected=true; this.emit("후공 보너스: 덱 맨 위 카드를 확인했습니다.");} return p.deck[0]||null; }
  swapSecondPlayerTop(handId) { const idx=this.state.setupChoice?.second, p=this.state.players[idx]; if(idx==null||!p.deck.length||!p.hand.includes(handId))return false; const top=p.deck.shift();p.hand.splice(p.hand.indexOf(handId),1,top);p.deck.unshift(handId);this.emit("후공 보너스: 카드 1장을 교환했습니다.");return true; }
  startAfterSetup(){ this.state.setupChoice=null; this.state.phase="choose-active"; this.emit("선공 플레이어가 시작 인물을 선택합니다."); }
  specificCost(cost={}){return Object.fromEntries(Object.entries(cost).filter(([c])=>c!=="any"))}
  effectiveCost(player,cost={}){const extra=(player?.skillCostIncreaseThisTurn||0)+(player?.actionCostIncreaseThisTurn||0);return extra>0?{...cost,any:(cost.any||0)+extra}:cost;}
  canPay(p,cost={}){const specific=this.specificCost(cost), any=cost.any||0;if(!Object.entries(specific).every(([c,n])=>(p.tokens[c]||0)>=n))return false;const remaining=settings.tokenTypes.reduce((sum,c)=>sum+Math.max(0,(p.tokens[c]||0)-(specific[c]||0)),0);return remaining>=any}
  canUseSkill(p,cost={},effects=[],enemy=null){const sourceIndex=this.state.players.indexOf(p),target=enemy||(sourceIndex>=0?this.state.players[1-sourceIndex]:null),targetAllowed=!effects.some(e=>e.type==="turnEnemyActiveFaceDownIfEnemyAttributeIn"&&!e.attributes?.includes(target?.active?.attribute));return targetAllowed&&!p.skillBlockedThisTurn&&this.canPay(p,this.effectiveCost(p,cost))}
  pay(p,cost={}){const specific=this.specificCost(cost), any=cost.any||0;Object.entries(specific).forEach(([c,n])=>p.tokens[c]-=n);let left=any;settings.tokenTypes.map(c=>[c,p.tokens[c]||0]).sort((a,b)=>b[1]-a[1]).forEach(([c])=>{if(left<=0)return;const spend=Math.min(left,p.tokens[c]||0);p.tokens[c]-=spend;left-=spend;});}
  // trait는 선택 사항입니다. 카드 데이터에 trait가 없으면 특성 행동 자체를 제공하지 않습니다.
  activeMatchesName(active,name){if(!active||!name)return false;const ids=[active.id,active.baseCardId,active.evolvesFrom,active.evolvedFromActive?.id].filter(Boolean),names=new Set([active.name,active.evolvedFromActive?.name,...ids.map(id=>cardById[id]?.name)].filter(Boolean));return names.has(name);}
  effectsBlocked(source,effects=[]){const enemy=this.state.players[1-source];const blocker=effects.find(e=>(e.type==="cannotUseAgainstName"||e.type==="cannotUseIfEnemyName")&&this.activeMatchesName(enemy.active,e.name));if(blocker){this.emit(`${enemy.active.name}을(를) 상대로는 사용할 수 없습니다.`);return true;}return false;}
  actionEvent(source,type,label,color,cardId=null){if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("politimon:action",{detail:{source,type,label,color,cardId:cardId||this.state.players[source]?.active?.id}}));}
  applyAutoTraits(index){const p=this.state.players[index],trait=p?.active?.trait;if(!trait?.auto||p.active?.faceDown||this.state.winner!=null)return false;const activeName=p.active.name,traitName=trait.name;this.actionEvent(index,"trait",traitName,"#ff667f");this.effects(index,trait.effects||[],{actionType:"auto-trait"});this.emit(`${activeName}의 자동 특성 「${traitName}」 적용`);return true;}
  useTrait(index,context={}){ const p=this.state.players[index],canAct=this.isPlayersAction(index),special=this.state.phase==="playing"&&this.state.turn===index&&this.state.winner==null&&p.traitAfterSkillAvailable,extraCost={any:p.actionCostIncreaseThisTurn||0}; if((!canAct&&!special)||!p.active||!p.active.trait||p.active.trait.auto||p.active.trait.passive||p.traitUsedThisTurn||(p.active.trait.oncePerActive&&p.active.trait.usedOnce)||!this.canPay(p,extraCost)||this.effectsBlocked(index,p.active.trait.effects))return false; const activeName=p.active.name,traitName=p.active.trait.name; if(extraCost.any>0)this.pay(p,extraCost);p.traitUsedThisTurn=true;if(p.active.trait.oncePerActive)p.active.trait.usedOnce=true;p.traitAfterSkillAvailable=false; this.actionEvent(index,"trait",traitName,"#ff667f"); this.effects(index,p.active.trait.effects||[],{...context,actionType:"trait"}); this.state.actionAvailable=false; this.emit(`${activeName}의 특성 「${traitName}」 발동`);return true; }
  useSkill(index,skillIndex,context={}){const p=this.state.players[index], skill=p.active?.skills[skillIndex],activeName=p.active?.name;if(!this.isPlayersAction(index)||!skill||!this.canUseSkill(p,skill.cost,skill.effects,this.state.players[1-index])||this.effectsBlocked(index,skill.effects))return false;if(skill.effects?.some(e=>e.type==="requiresStrategyInHand")){const strategyId=p.hand.find(id=>cardById[id]?.type==="strategy");if(!strategyId)return false;p.hand.splice(p.hand.indexOf(strategyId),1);this.removeCard(index,strategyId,"combo");}const keepAction=skill.effects?.some(e=>e.type==="replaceSelfWithHandCharacter"&&e.allowAction);this.pay(p,this.effectiveCost(p,skill.cost));this.actionEvent(index,"skill",skill.name,settings.tokenColors?.[p.active.attribute]||"#70efff");this.state.actionAvailable=false;this.effects(index,skill.effects,{...context,actionType:"skill"});this.state.actionAvailable=!!((keepAction||this.state.actionAvailable)&&p.active&&this.state.winner==null);this.emit(`${activeName}의 기술 「${skill.name}」 사용`);return true;}
  canEvolve(index,cardId){const p=this.state.players[index],card=cardById[cardId];return this.isPlayersAction(index)&&isVCard(p.active)&&card?.type==="character"&&isVmaxCard(card)&&card.evolvesFrom===p.active.id&&p.hand.includes(cardId)&&p.characterUses<3;}
  evolveActive(index,cardId){const p=this.state.players[index],card=cardById[cardId];if(!this.canEvolve(index,cardId))return false;const base=p.active;p.hand.splice(p.hand.indexOf(cardId),1);p.active={...clone(card),currentHp:card.hp,evolvedFromActive:clone(base),baseCardId:base.id};p.characterUses++;p.traitUsedThisTurn=false;p.traitAfterSkillAvailable=false;this.state.actionAvailable=false;this.actionEvent(index,"skill","VMAX 진화",settings.tokenColors?.[card.attribute]||"#70efff");this.applyAutoTraits(index);this.emit(`${base.name}이(가) ${card.name}(으)로 진화했습니다. (${p.characterUses}/3)`);return true;}
  useStrategy(index,cardId,context={}){const p=this.state.players[index],card=cardById[cardId],asStrategy=card?.type==="strategy"||card?.trait?.treatAsStrategy;if(this.state.phase!=="playing"||this.state.turn!==index||this.state.winner!=null||p.active?.faceDown||!card||!asStrategy||!p.hand.includes(cardId))return false;const choice=card.choices?.[Number.isInteger(context.choiceIndex)?context.choiceIndex:0],effects=choice?.effects||card.effects||card.trait?.effects||[];if(effects.some(e=>e.type==="discardAnyHandCardThenDefeatEnemy")&&(!context.discardHandId||context.discardHandId===cardId||!p.hand.includes(context.discardHandId)))return false;if(this.effectsBlocked(index,effects))return false;this.actionEvent(index,"strategy",choice?`${card.name} · ${choice.label}`:card.name,"#ffb45b");p.hand.splice(p.hand.indexOf(cardId),1);this.removeCard(index,cardId,"strategy");this.effects(index,effects,{...context,actionType:"strategy",cardId});this.emit(`${p.name}이(가) 「${card.name}」${choice?` · ${choice.label}`:""} 사용`);return true;}
  retreat(index){ const p=this.state.players[index],free=this.state.phase==="playing"&&this.state.turn===index&&this.state.winner==null&&p.freeRetreatThisTurn; if((!this.isPlayersAction(index)&&!free)||!p.active||(!free&&!this.canPay(p,p.active.retreatCost||{})))return false;if(!free)this.pay(p,p.active.retreatCost||{});p.freeRetreatThisTurn=false;this.removeActive(index,"retreat");if(this.state.winner==null){this.state.phase="choose-replacement";p.replacementRequired=true;p.forcedReplacement=false;}this.emit(`${p.name}이(가) ${free?"비용 없이 ":""}후퇴했습니다. 새 인물을 배치한 뒤 행동 1회를 더 할 수 있습니다.`);return true;}
  bonusDamage(source,e){const me=this.state.players[source],enemy=this.state.players[1-source];if(e.type==="bonusDamageIfEnemyAttribute"&&enemy.active?.attribute===e.attribute)return e.amount||0;if(e.type==="bonusDamageIfEnemyAttributeExceptName"&&enemy.active?.attribute===e.attribute&&enemy.active?.name!==e.name)return e.amount||0;if(e.type==="bonusDamageIfEnemyAttributeIn"&&e.attributes?.includes(enemy.active?.attribute))return e.amount||0;if(e.type==="bonusDamageIfEnemyAttributeNotIn"&&!e.attributes?.includes(enemy.active?.attribute))return e.amount||0;if(e.type==="bonusDamageUnlessEnemyAttribute"&&enemy.active?.attribute!==e.attribute)return e.amount||0;if(e.type==="bonusDamageUnlessEnemyTag"&&!enemy.active?.tags?.includes(e.tag))return e.amount||0;if(e.type==="bonusDamageIfEnemyName"&&enemy.active?.name===e.name)return e.amount||0;if(e.type==="bonusDamageIfSummonedBy"&&me.active?.summonedBy===e.cardId)return e.amount||0;if(e.type==="bonusDamageIfSelfHpAtLeast"&&me.active?.currentHp>=e.threshold)return e.amount||0;if(e.type==="bonusDamageIfEnemyHpAtMost"&&enemy.active?.currentHp<=e.threshold)return e.amount||0;if(e.type==="bonusDamageIfEnemyHpRatioAtLeast"&&enemy.active?.hp&&enemy.active.currentHp/enemy.active.hp>=e.ratio)return e.amount||0;if(e.type==="bonusDamageIfEnemyTag"&&enemy.active?.tags?.includes(e.tag))return e.amount||0;if(e.type==="bonusDamageForEnemyTag"&&enemy.active?.tags?.includes(e.tag))return e.amount||0;if(e.type==="bonusDamageForActiveCardsWithoutTag")return [me.active,enemy.active].filter(card=>card&&!card.tags?.includes(e.tag)).length*(e.amount||0);if(e.type==="bonusDamageForActiveCardsWithAttribute")return [me.active,enemy.active].filter(card=>card?.attribute===e.attribute).length*(e.amount||0);if(e.type==="bonusDamageIfCharacterUseNumber"&&me.characterUses===e.useNumber)return e.amount||0;if(e.type==="bonusDamageIfEnemyPack"&&enemy.active?.packIds?.includes(e.packId))return e.amount||0;return 0;}
  reduceOutgoingDamage(source,damage){const p=this.state.players[source];let final=Math.max(0,damage);for(const rule of p.damageReductionRulesThisTurn||[]){if(rule.tag&&p.active?.tags?.includes(rule.tag)){final=Math.max(0,final-(rule.amount||0));this.emit(`${p.active.name}의 피해가 ${rule.amount||0} 감소했습니다.`);}}return final;}
  coinResult(me,context={}){const forced=!!me.forceNextCoinHeads,result=forced?"heads":(context.coinResult||((Math.random()<.5)?"heads":"tails"));if(forced)me.forceNextCoinHeads=false;this.emit(`동전 결과: ${result==="heads"?"앞":"뒤"}`);return result;}
  coinResults(me,context={},count=1){let results=context.coinResults?.length?context.coinResults.slice(0,count):[];const forced=!!me.forceNextCoinHeads;if(forced){results[0]="heads";me.forceNextCoinHeads=false;}while(results.length<count)results.push(Math.random()<.5?"heads":"tails");this.emit(`동전 결과: 앞 ${results.filter(x=>x==="heads").length}회 / ${results.length}회`);return results;}
  applyDamage(source,damage,{direct=false,overflowToReplacement=false}={}){
    const me=this.state.players[source],enemy=this.state.players[1-source];
    if(!enemy.active)return false;
    if(enemy.protectedPackThisTurn?.packId&&enemy.active.packIds?.includes(enemy.protectedPackThisTurn.packId)){
      this.emit(`${enemy.active.name}은(는) 보호 효과로 피해를 받지 않았습니다.`);
      return false;
    }
    let final=Math.max(0,damage);
    const modifiers=[];
    if(!direct){
      if(enemy.active.weakness===me.active?.attribute){final*=2;modifiers.push("약점 ×2");}
      if(enemy.active.resistance===me.active?.attribute){final=Math.max(0,final-30);modifiers.push("저항 -30");}
    }
    const passiveReduction=(enemy.active.trait?.passive?enemy.active.trait.effects||[]:[]).filter(e=>e.type==="passiveDamageReduction").reduce((sum,e)=>sum+(e.amount||0),0);
    const totalReduction=(enemy.active.permanentDamageReduction||0)+passiveReduction;
    if(totalReduction>0&&final>0){final=Math.max(0,final-totalReduction);modifiers.push(`피해 경감 -${totalReduction}`);}
    if(!direct&&enemy.reflectDamageThisTurn&&final>0){
      enemy.reflectDamageThisTurn=false;
      if(me.active){
        me.active.currentHp-=final;
        this.emit(`${enemy.active.name}이(가) 공격을 반사해 ${me.active.name}에게 ${final} 피해`);
        if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("politimon:hit",{detail:{source:1-source,target:source,damage:final,baseDamage:Math.max(0,damage),modifiers:["공격 반사"],direct:true}}));
        if(me.active.currentHp<=0)this.removeActive(source,"defeated");
      }
      return false;
    }
    if(!direct&&final>0)enemy.currentOpponentAttackDamage=(enemy.currentOpponentAttackDamage||0)+final;
    const overflow=overflowToReplacement?Math.max(0,final-enemy.active.currentHp):0;
    enemy.active.currentHp-=final;
    this.emit(`${enemy.active.name}에게 ${final} 피해${modifiers.length?` (${modifiers.join(" · ")})`:""}`);
    if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("politimon:hit",{detail:{source,target:1-source,damage:final,baseDamage:Math.max(0,damage),modifiers,direct}}));
    if(enemy.active.currentHp<=0){
      if(overflow)enemy.pendingDamage+=overflow;
      this.removeActive(1-source,"defeated");
      return true;
    }
    return false;
  }
  convertToken(player,fromColor,toColor){const source=fromColor&&player.tokens[fromColor]>0?fromColor:settings.tokenTypes.find(c=>c!==toColor&&(player.tokens[c]||0)>0);if(!source)return false;player.tokens[source]--;player.tokens[toColor]=(player.tokens[toColor]||0)+1;return true;}
  effects(source,effects,context={}){let nextDamageBonus=0,nextDamageMultiplier=1,gainTokenOnDefeat=0,healSelfOnDefeat=0;effects.forEach(e=>{const me=this.state.players[source],enemy=this.state.players[1-source];if(e.type==="cannotUseAgainstName")return;if(e.type?.startsWith("bonusDamage")){nextDamageBonus+=this.bonusDamage(source,e);return;}if(e.type==="coinFlipDamageModifier"){const result=this.coinResult(me,context);if(result==="heads"){nextDamageMultiplier*=e.headsMultiplier||1;nextDamageBonus+=e.headsBonus||0;}else nextDamageBonus+=e.tailsBonus||0;return;}if(e.type==="repeatCoinBonusUntilTails"){const results=context.coinResults?.length?context.coinResults:(me.forceNextCoinHeads?["heads"]:[Math.random()<.5?"heads":"tails"]);if(me.forceNextCoinHeads)me.forceNextCoinHeads=false;let heads=0;for(const result of results){if(result==="heads")heads++;else break;}nextDamageBonus+=(e.headsBonus||0)*heads;this.emit(`동전 결과: 앞면 ${heads}회${results[heads]==="tails"?" 후 뒷면":""}`);return;}if(e.type==="streakCoinDamageModifier"){const results=context.coinResults?.length?context.coinResults:(me.forceNextCoinHeads?["heads"]:[Math.random()<.5?"heads":"tails"]);if(me.forceNextCoinHeads)me.forceNextCoinHeads=false;let heads=0;for(const result of results){if(result==="heads")heads++;else break;}const bonuses=e.headsBonuses||[];nextDamageBonus+=bonuses[Math.min(heads,bonuses.length-1)]||0;if(results[heads]==="tails")nextDamageBonus+=e.tailsBonus||0;this.emit(`동전 결과: 앞면 ${heads}회${results[heads]==="tails"?" 후 뒷면":""}`);return;}if(e.type==="fixedCoinFlipsDamageBonus"){const results=this.coinResults(me,context,e.flips||1);nextDamageBonus+=(e.headsBonus||0)*results.filter(x=>x==="heads").length;return;}if(e.type==="coinFlipHealSelfOrBonusDamage"){const result=this.coinResult(me,context);if(result==="heads"&&me.active)me.active.currentHp=Math.min(me.active.hp,me.active.currentHp+(e.headsHeal||0));else nextDamageBonus+=e.tailsBonus||0;return;}if(e.type==="coinFlipSelfDamageOnTails"){const result=this.coinResult(me,context);if(result==="tails"&&me.active){me.active.currentHp-=e.amount||0;this.emit(`${me.active.name}에게 반동 ${e.amount||0} 피해`);if(me.active.currentHp<=0)this.removeActive(source,"defeated");}return;}if(e.type==="coinFlip"&&typeof window!=="undefined")window.dispatchEvent(new CustomEvent("politimon:coinflip",{detail:{source,...e}}));if(e.type==="defeatIfHpAtOrBelow"&&enemy.active&&enemy.active.currentHp<=e.threshold){this.emit(`${enemy.active.name}은(는) 조건 충족으로 즉시 제거됩니다.`);this.removeActive(1-source,"defeated");}if(e.type==="gainTokenIfDefeats"){gainTokenOnDefeat+=e.amount||1;return;}if(e.type==="healSelfIfDefeats"){healSelfOnDefeat+=e.amount||0;return;}if(e.type==="requiresStrategyInHand")return;if(e.type==="blockOpponentNextSkill"){enemy.nextSkillBlocked=true;this.emit(`${enemy.name}은(는) 다음 턴에 기술을 사용할 수 없습니다.`);return;}if(e.type==="forceNextCoinHeads"){me.forceNextCoinHeads=true;this.emit(`${me.name}의 다음 동전 던지기 1회는 앞면으로 간주됩니다.`);return;}if(e.type==="nextTurnSkillDamageMultiplier"){me.skillDamageMultiplierNextTurn=e.amount||1;this.emit(`${me.name}의 다음 턴 기술 피해량이 ${e.amount}배가 됩니다.`);return;}if(e.type==="nextTurnExtraToken"){me.nextTurnExtraTokens+=(e.amount||1);this.emit(`${me.name}은(는) 다음 턴 종료 시 토큰을 추가로 받습니다.`);return;}if(e.type==="allowExtraSkill"){this.state.actionAvailable=true;this.emit(`${me.name}은(는) 기술을 한 번 더 사용할 수 있습니다.`);return;}if(e.type==="revealRandomHand"){const revealed=enemy.hand.slice().sort(()=>Math.random()-.5).slice(0,e.amount||1).map(id=>cardById[id]?.name||id);this.emit(revealed.length?`${enemy.name}의 손패 확인: ${revealed.join(", ")}`:`${enemy.name}의 손패가 없습니다.`);return;}if(e.type==="convertEnemyToken"){for(let i=0;i<(e.amount||1);i++)if(this.convertToken(enemy,null,e.to))this.emit(`${enemy.name}의 토큰 1개가 ${settings.tokenLabels[e.to]||e.to}(으)로 바뀌었습니다.`);return;}if(e.type==="convertOwnTokenToActiveAttribute"){const to=context.tokenColor||me.active?.attribute||settings.tokenTypes[0];for(let i=0;i<(e.amount||1);i++)if(this.convertToken(me,null,to))this.emit(`${me.name}의 토큰 1개가 ${settings.tokenLabels[to]||to}(으)로 바뀌었습니다.`);return;}if(e.type==="discardCharacterFromHand"){const id=me.hand.find(id=>cardById[id]?.type==="character");if(id){me.hand.splice(me.hand.indexOf(id),1);this.removeCard(source,id,"effect");}return;}if(e.type==="damage"&&enemy.active){let damage=((e.amount||0)+nextDamageBonus)*nextDamageMultiplier;if(context.actionType==="skill")damage*=me.skillDamageMultiplierThisTurn||1;nextDamageBonus=0;nextDamageMultiplier=1;const defeated=this.applyDamage(source,damage,{overflowToReplacement:e.overflowToReplacement});if(defeated){if(gainTokenOnDefeat>0){const color=context.tokenColor||me.active?.attribute||settings.tokenTypes[0];me.tokens[color]=(me.tokens[color]||0)+gainTokenOnDefeat;this.emit(`${me.name}이(가) ${settings.tokenLabels[color]} 토큰 ${gainTokenOnDefeat}개 획득`);}if(healSelfOnDefeat&&me.active)me.active.currentHp=Math.min(me.active.hp,me.active.currentHp+healSelfOnDefeat);}return;}if(e.type==="directDamage"){this.applyDamage(source,e.amount||0,{direct:true});return;}if(e.type==="selfDamage"&&me.active){me.active.currentHp-=e.amount||0;this.emit(`${me.active.name}에게 반동 ${e.amount||0} 피해`);if(me.active.currentHp<=0)this.removeActive(source,"defeated");}if(e.type==="heal"&&me.active)me.active.currentHp=Math.min(me.active.hp,me.active.currentHp+e.amount);if(e.type==="draw")this.draw(me,e.amount);if(e.type==="addToken")me.tokens[e.color]=(me.tokens[e.color]||0)+e.amount;if(e.type==="stealToken"){for(let i=0;i<(e.amount||1);i++){const color=context.stealColor||settings.tokenTypes.slice().sort((a,b)=>(enemy.tokens[b]||0)-(enemy.tokens[a]||0))[0];if((enemy.tokens[color]||0)>0){enemy.tokens[color]--;me.tokens[color]=(me.tokens[color]||0)+1;this.emit(`${me.name}이(가) ${settings.tokenLabels[color]} 토큰을 가져왔습니다.`);}}}});}
  effects(source,effects,context={}){let nextDamageBonus=0,nextDamageMultiplier=1,gainTokenOnDefeat=0,healSelfOnDefeat=0;for(const e of effects||[]){const me=this.state.players[source],enemy=this.state.players[1-source];if(e.type==="cannotUseAgainstName")continue;if(e.type?.startsWith("bonusDamage")){nextDamageBonus+=this.bonusDamage(source,e);continue;}if(e.type==="coinFlipDamageModifier"){if(e.optional&&context.skipOptionalCoinFlip)continue;const result=this.coinResult(me,context);if(result==="heads"){nextDamageMultiplier*=e.headsMultiplier||1;nextDamageBonus+=e.headsBonus||0;}else nextDamageBonus+=e.tailsBonus||0;continue;}if(e.type==="repeatCoinBonusUntilTails"){const results=context.coinResults?.length?context.coinResults:(me.forceNextCoinHeads?["heads"]:[Math.random()<.5?"heads":"tails"]);if(me.forceNextCoinHeads)me.forceNextCoinHeads=false;let heads=0;for(const result of results){if(result==="heads")heads++;else break;}nextDamageBonus+=(e.headsBonus||0)*heads;this.emit(`동전 결과: 앞면 ${heads}회${results[heads]==="tails"?" 후 뒷면":""}`);continue;}if(e.type==="streakCoinDamageModifier"){const fallbackCount=e.maxFlips||3,results=context.coinResults?.length?context.coinResults:(me.forceNextCoinHeads?["heads"]:Array.from({length:fallbackCount},()=>Math.random()<.5?"heads":"tails"));if(me.forceNextCoinHeads)me.forceNextCoinHeads=false;let heads=0;for(const result of results){if(result==="heads")heads++;else break;}const bonuses=e.headsBonuses||[];nextDamageBonus+=bonuses[Math.min(heads,bonuses.length-1)]||0;if(results[heads]==="tails")nextDamageBonus+=e.tailsBonus||0;this.emit(`동전 결과: 앞면 ${heads}회${results[heads]==="tails"?" 후 뒷면":""}`);continue;}if(e.type==="fixedCoinFlipsDamageBonus"){const results=this.coinResults(me,context,e.flips||1);nextDamageBonus+=(e.headsBonus||0)*results.filter(x=>x==="heads").length;continue;}if(e.type==="coinFlipHealSelfOrBonusDamage"){if(e.optional&&context.skipOptionalCoinFlip)continue;const result=this.coinResult(me,context);if(result==="heads"&&me.active)me.active.currentHp=Math.min(me.active.hp,me.active.currentHp+(e.headsHeal||0));else nextDamageBonus+=e.tailsBonus||0;continue;}if(e.type==="coinFlipSelfDamageOnTails"){if(e.optional&&context.skipOptionalCoinFlip)continue;const result=this.coinResult(me,context);if(result==="tails"&&me.active){me.active.currentHp-=e.amount||0;this.emit(`${me.active.name}에게 반동 ${e.amount||0} 피해`);if(me.active.currentHp<=0)this.removeActive(source,"defeated");}continue;}if(e.type==="coinFlip"&&typeof window!=="undefined")window.dispatchEvent(new CustomEvent("politimon:coinflip",{detail:{source,...e}}));if(e.type==="defeatIfHpAtOrBelow"&&enemy.active&&enemy.active.currentHp<=e.threshold){this.emit(`${enemy.active.name}은(는) 조건 충족으로 즉시 제거됩니다.`);this.removeActive(1-source,"defeated");}if(e.type==="gainTokenIfDefeats"){gainTokenOnDefeat+=e.amount||1;continue;}if(e.type==="healSelfIfDefeats"){healSelfOnDefeat+=e.amount||0;continue;}if(e.type==="healIfDiscarded"){if(context.discardedCharacter&&me.active)me.active.currentHp=Math.min(me.active.hp,me.active.currentHp+(e.amount||0));continue;}if(e.type==="requiresStrategyInHand")continue;if(e.type==="blockOpponentNextSkill"){enemy.nextSkillBlocked=true;this.emit(`${enemy.name}은(는) 다음 턴에 기술을 사용할 수 없습니다.`);continue;}if(e.type==="forceNextCoinHeads"){me.forceNextCoinHeads=true;this.emit(`${me.name}의 다음 동전 던지기 1회는 앞면으로 간주됩니다.`);continue;}if(e.type==="nextTurnSkillDamageMultiplier"){me.skillDamageMultiplierNextTurn=e.amount||1;this.emit(`${me.name}의 다음 턴 기술 피해량이 ${e.amount}배가 됩니다.`);continue;}if(e.type==="nextTurnExtraToken"){me.nextTurnExtraTokens+=(e.amount||1);this.emit(`${me.name}은(는) 다음 턴 종료 시 토큰을 추가로 받습니다.`);continue;}if(e.type==="allowExtraSkill"){this.state.actionAvailable=true;this.emit(`${me.name}은(는) 기술을 한 번 더 사용할 수 있습니다.`);continue;}if(e.type==="allowTraitAfterSkill"){me.traitAfterSkillAvailable=true;this.emit(`${me.name}은(는) 이 기술 후 특성을 사용할 수 있습니다.`);continue;}if(e.type==="revealRandomHand"){const ids=enemy.hand.slice().sort(()=>Math.random()-.5).slice(0,e.amount||1),revealed=ids.map(id=>cardById[id]?.name||id);this.emit(revealed.length?`${enemy.name}의 손패 확인: ${revealed.join(", ")}`:`${enemy.name}의 손패가 없습니다.`);if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("politimon:reveal",{detail:{source,target:1-source,ids}}));continue;}if(e.type==="convertEnemyToken"){for(let i=0;i<(e.amount||1);i++){const from=context.convertEnemyColor;if(this.convertToken(enemy,from,e.to))this.emit(`${enemy.name}의 토큰 1개가 ${settings.tokenLabels[e.to]||e.to}(으)로 바뀌었습니다.`);}continue;}if(e.type==="convertOwnTokenToActiveAttribute"){const to=context.tokenColor||me.active?.attribute||settings.tokenTypes[0];for(let i=0;i<(e.amount||1);i++)if(this.convertToken(me,null,to))this.emit(`${me.name}의 토큰 1개가 ${settings.tokenLabels[to]||to}(으)로 바뀌었습니다.`);continue;}if(e.type==="optionalDiscardCharacterFromHand"){const id=context.discardCharacterId;if(id&&me.hand.includes(id)&&cardById[id]?.type==="character"){me.hand.splice(me.hand.indexOf(id),1);this.removeCard(source,id,"effect");context.discardedCharacter=true;}continue;}if(e.type==="discardCharacterFromHand"){const requested=context.discardCharacterId,id=requested&&me.hand.includes(requested)&&cardById[requested]?.type==="character"?requested:me.hand.find(id=>cardById[id]?.type==="character");if(id){me.hand.splice(me.hand.indexOf(id),1);this.removeCard(source,id,"effect");context.discardedCharacter=true;}continue;}if(e.type==="damage"&&enemy.active){let damage=((e.amount||0)+nextDamageBonus)*nextDamageMultiplier;if(context.actionType==="skill")damage*=me.skillDamageMultiplierThisTurn||1;nextDamageBonus=0;nextDamageMultiplier=1;const defeated=this.applyDamage(source,damage,{overflowToReplacement:e.overflowToReplacement});if(defeated){if(gainTokenOnDefeat>0){const color=context.tokenColor||me.active?.attribute||settings.tokenTypes[0];me.tokens[color]=(me.tokens[color]||0)+gainTokenOnDefeat;this.emit(`${me.name}이(가) ${settings.tokenLabels[color]} 토큰 ${gainTokenOnDefeat}개 획득`);}if(healSelfOnDefeat&&me.active)me.active.currentHp=Math.min(me.active.hp,me.active.currentHp+healSelfOnDefeat);}continue;}if(e.type==="directDamage"){this.applyDamage(source,e.amount||0,{direct:true});continue;}if(e.type==="selfDamage"&&me.active){me.active.currentHp-=e.amount||0;this.emit(`${me.active.name}에게 반동 ${e.amount||0} 피해`);if(me.active.currentHp<=0)this.removeActive(source,"defeated");}if(e.type==="heal"&&me.active)me.active.currentHp=Math.min(me.active.hp,me.active.currentHp+e.amount);if(e.type==="draw")this.draw(me,e.amount);if(e.type==="addToken")me.tokens[e.color]=(me.tokens[e.color]||0)+e.amount;if(e.type==="stealToken"){for(let i=0;i<(e.amount||1);i++){const color=context.stealColor||settings.tokenTypes.slice().sort((a,b)=>(enemy.tokens[b]||0)-(enemy.tokens[a]||0))[0];if((enemy.tokens[color]||0)>0){enemy.tokens[color]--;me.tokens[color]=(me.tokens[color]||0)+1;this.emit(`${me.name}이(가) ${settings.tokenLabels[color]} 토큰을 가져왔습니다.`);}}}}}
  effects(source,effects,context={}){
    let nextDamageBonus=0,nextDamageMultiplier=1,gainTokenOnDefeat=0,healSelfOnDefeat=0;
    const coinTypes=["coinFlipDamageModifier","coinFlipSelfDamageOnTails","coinFlipHealSelfOrBonusDamage","fixedCoinFlipsDamageBonus","repeatCoinBonusUntilTails","streakCoinDamageModifier"];
    const skipOptionalCoin=e=>context.skipOptionalCoinFlip&&(e.optional||context.optionalText)&&coinTypes.includes(e.type);
    for(const e of effects||[]){
      const me=this.state.players[source],enemy=this.state.players[1-source];
      if(e.type==="cannotUseAgainstName")continue;
      if(skipOptionalCoin(e))continue;
      if(e.type?.startsWith("bonusDamage")){nextDamageBonus+=this.bonusDamage(source,e);continue;}
      if(e.type==="coinFlipDamageModifier"){const result=this.coinResult(me,context);if(result==="heads"){nextDamageMultiplier*=e.headsMultiplier||1;nextDamageBonus+=e.headsBonus||0;}else nextDamageBonus+=e.tailsBonus||0;continue;}
      if(e.type==="repeatCoinBonusUntilTails"){const results=context.coinResults?.length?context.coinResults.slice():[Math.random()<.5?"heads":"tails"];if(me.forceNextCoinHeads){results[0]="heads";me.forceNextCoinHeads=false;}let heads=0;for(const result of results){if(result==="heads")heads++;else break;}nextDamageBonus+=(e.headsBonus||0)*heads;this.emit(`동전 결과: 앞 ${heads}회${results[heads]==="tails"?" 후 뒤":""}`);continue;}
      if(e.type==="streakCoinDamageModifier"){const fallbackCount=e.maxFlips||3,results=context.coinResults?.length?context.coinResults.slice():Array.from({length:fallbackCount},()=>Math.random()<.5?"heads":"tails");if(me.forceNextCoinHeads){results[0]="heads";me.forceNextCoinHeads=false;}let heads=0;for(const result of results){if(result==="heads")heads++;else break;}const bonuses=e.headsBonuses||[];nextDamageBonus+=bonuses[Math.min(heads,bonuses.length-1)]||0;if(results[heads]==="tails")nextDamageBonus+=e.tailsBonus||0;this.emit(`동전 결과: 앞 ${heads}회${results[heads]==="tails"?" 후 뒤":""}`);continue;}
      if(e.type==="fixedCoinFlipsDamageBonus"){const results=this.coinResults(me,context,e.flips||1);nextDamageBonus+=(e.headsBonus||0)*results.filter(x=>x==="heads").length;continue;}
      if(e.type==="coinFlipHealSelfOrBonusDamage"){const result=this.coinResult(me,context);if(result==="heads"&&me.active)me.active.currentHp=Math.min(me.active.hp,me.active.currentHp+(e.headsHeal||0));else nextDamageBonus+=e.tailsBonus||0;continue;}
      if(e.type==="coinFlipSelfDamageOnTails"){const result=this.coinResult(me,context);if(result==="tails"&&me.active){me.active.currentHp-=e.amount||0;this.emit(`${me.active.name}에게 반동 ${e.amount||0} 피해`);if(me.active.currentHp<=0)this.removeActive(source,"defeated");}continue;}
      if(e.type==="coinFlip"&&typeof window!=="undefined")window.dispatchEvent(new CustomEvent("politimon:coinflip",{detail:{source,...e}}));
      if(e.type==="defeatIfHpAtOrBelow"&&enemy.active&&enemy.active.currentHp<=e.threshold){this.emit(`${enemy.active.name}은(는) 조건 충족으로 즉시 제거됩니다.`);this.removeActive(1-source,"defeated");}
      if(e.type==="gainTokenIfDefeats"){gainTokenOnDefeat+=e.amount||1;continue;}
      if(e.type==="healSelfIfDefeats"){healSelfOnDefeat+=e.amount||0;continue;}
      if(e.type==="healIfDiscarded"){if(context.discardedCharacter&&me.active)me.active.currentHp=Math.min(me.active.hp,me.active.currentHp+(e.amount||0));continue;}
      if(e.type==="requiresStrategyInHand")continue;
      if(e.type==="blockOpponentNextSkill"){enemy.nextSkillBlocked=true;this.emit(`${enemy.name}은(는) 다음 턴에 기술을 사용할 수 없습니다.`);continue;}
      if(e.type==="forceNextCoinHeads"){me.forceNextCoinHeads=true;this.emit(`${me.name}의 다음 동전 던지기 1회는 앞면으로 간주됩니다.`);continue;}
      if(e.type==="nextTurnSkillDamageMultiplier"){me.skillDamageMultiplierNextTurn=e.amount||1;this.emit(`${me.name}의 다음 턴 기술 피해량이 ${e.amount}배가 됩니다.`);continue;}
      if(e.type==="nextTurnExtraToken"){me.nextTurnExtraTokens+=(e.amount||1);this.emit(`${me.name}은(는) 다음 턴 종료 시 토큰을 추가로 받습니다.`);continue;}
      if(e.type==="allowExtraSkill"){this.state.actionAvailable=true;this.emit(`${me.name}은(는) 기술을 한 번 더 사용할 수 있습니다.`);continue;}
      if(e.type==="allowTraitAfterSkill"){me.traitAfterSkillAvailable=true;this.emit(`${me.name}은(는) 이 기술 후 특성을 사용할 수 있습니다.`);continue;}
      if(e.type==="revealRandomHand"){const ids=enemy.hand.slice().sort(()=>Math.random()-.5).slice(0,e.amount||1),revealed=ids.map(id=>cardById[id]?.name||id);this.emit(revealed.length?`${enemy.name}의 손패 확인: ${revealed.join(", ")}`:`${enemy.name}의 손패가 없습니다.`);if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("politimon:reveal",{detail:{source,target:1-source,ids}}));continue;}
      if(e.type==="convertEnemyToken"){for(let i=0;i<(e.amount||1);i++){const from=context.convertEnemyColor;if(this.convertToken(enemy,from,e.to))this.emit(`${enemy.name}의 토큰 1개가 ${settings.tokenLabels[e.to]||e.to}(으)로 바뀌었습니다.`);}continue;}
      if(e.type==="convertOwnTokenToActiveAttribute"){const to=context.tokenColor||me.active?.attribute||settings.tokenTypes[0];for(let i=0;i<(e.amount||1);i++)if(this.convertToken(me,null,to))this.emit(`${me.name}의 토큰 1개가 ${settings.tokenLabels[to]||to}(으)로 바뀌었습니다.`);continue;}
      if(e.type==="optionalDiscardCharacterFromHand"){const id=context.discardCharacterId;if(id&&me.hand.includes(id)&&cardById[id]?.type==="character"){me.hand.splice(me.hand.indexOf(id),1);this.removeCard(source,id,"effect");context.discardedCharacter=true;}continue;}
      if(e.type==="discardCharacterFromHand"){const requested=context.discardCharacterId,id=requested&&me.hand.includes(requested)&&cardById[requested]?.type==="character"?requested:me.hand.find(id=>cardById[id]?.type==="character");if(id){me.hand.splice(me.hand.indexOf(id),1);this.removeCard(source,id,"effect");context.discardedCharacter=true;}continue;}
      if(e.type==="damage"&&enemy.active){let damage=((e.amount||0)+nextDamageBonus)*nextDamageMultiplier;if(context.actionType==="skill")damage*=me.skillDamageMultiplierThisTurn||1;nextDamageBonus=0;nextDamageMultiplier=1;const defeated=this.applyDamage(source,damage,{overflowToReplacement:e.overflowToReplacement});if(defeated){if(gainTokenOnDefeat>0){const color=context.tokenColor||me.active?.attribute||settings.tokenTypes[0];me.tokens[color]=(me.tokens[color]||0)+gainTokenOnDefeat;this.emit(`${me.name}이(가) ${settings.tokenLabels[color]} 토큰 ${gainTokenOnDefeat}개 획득`);}if(healSelfOnDefeat&&me.active)me.active.currentHp=Math.min(me.active.hp,me.active.currentHp+healSelfOnDefeat);}continue;}
      if(e.type==="directDamage"){this.applyDamage(source,e.amount||0,{direct:true});continue;}
      if(e.type==="selfDamage"&&me.active){if(e.optionalCoinCost&&context.skipOptionalCoinFlip)continue;me.active.currentHp-=e.amount||0;this.emit(`${me.active.name}에게 반동 ${e.amount||0} 피해`);if(me.active.currentHp<=0)this.removeActive(source,"defeated");}
      if(e.type==="heal"&&me.active)me.active.currentHp=Math.min(me.active.hp,me.active.currentHp+e.amount);
      if(e.type==="draw")this.draw(me,e.amount);
      if(e.type==="addToken")me.tokens[e.color]=(me.tokens[e.color]||0)+e.amount;
      if(e.type==="stealToken"){for(let i=0;i<(e.amount||1);i++){const color=context.stealColor||settings.tokenTypes.slice().sort((a,b)=>(enemy.tokens[b]||0)-(enemy.tokens[a]||0))[0];if((enemy.tokens[color]||0)>0){enemy.tokens[color]--;me.tokens[color]=(me.tokens[color]||0)+1;this.emit(`${me.name}이(가) ${settings.tokenLabels[color]} 토큰을 가져왔습니다.`);}}}
    }
  }
  effects(source,effects,context={}){
    let nextDamageBonus=0,nextDamageMultiplier=1,gainTokenOnDefeat=0,healSelfOnDefeat=0,queuedSelfDamage=0,defeatSelfAfterDamage=false,skipNextDamage=false;
    const coinTypes=["coinFlipDamageModifier","coinFlipSelfDamageOnTails","coinFlipHealSelfOrBonusDamage","fixedCoinFlipsDamageBonus","repeatCoinBonusUntilTails","streakCoinDamageModifier","coinFlipsDamageBonusAndSelfDamage","coinFlipBonusDamageStealTokenOrSelfDamage","coinFlipBonusDamageUnlessEnemyAttribute","coinFlipBonusOrSelfDamageIfEnemyAttribute","fixedCoinFlipsAllHeadsAddToken","recoverThisStrategyOnCoinHeads","coinFlipStealToken","coinFlipAddTokensByResult","coinFlipBonusDamageOrHealEnemy","pushYourLuckDamageModifier"];
    const skipOptionalCoin=e=>context.skipOptionalCoinFlip&&(e.optional||context.optionalText)&&coinTypes.includes(e.type);
    const rarityRank=id=>RARITIES.indexOf(cardById[id]?.rarity)<0?RARITIES.length:RARITIES.indexOf(cardById[id]?.rarity);
    const stealOne=(me,enemy,color=context.stealColor)=>{
      const selected=color&&settings.tokenTypes.includes(color)&&((enemy.tokens[color]||0)>0)?color:null;
      const fallback=color?null:settings.tokenTypes.slice().sort((a,b)=>(enemy.tokens[b]||0)-(enemy.tokens[a]||0)).find(c=>(enemy.tokens[c]||0)>0);
      const picked=selected||fallback;
      if(!picked)return false;
      enemy.tokens[picked]--;me.tokens[picked]=(me.tokens[picked]||0)+1;
      this.emit(`${me.name}이(가) ${settings.tokenLabels[picked]} 토큰을 가져왔습니다.`);
      return true;
    };
    const recoverFromTrash=(me,matcher,requestedId=null)=>{
      const candidates=(me.discard||[]).filter(id=>cardById[id]?.type==="character"&&matcher(cardById[id],id));
      if(!candidates.length)return false;
      const selected=requestedId&&candidates.includes(requestedId)?requestedId:candidates.sort((a,b)=>rarityRank(a)-rarityRank(b)||a.localeCompare(b))[0];
      const index=me.discard.indexOf(selected);
      if(index<0)return false;
      me.discard.splice(index,1);me.hand.push(selected);
      this.emit(`${me.name}이(가) 트래쉬에서 ${cardById[selected]?.name||selected}을(를) 손패로 가져왔습니다.`);
      return true;
    };
    const applyQueuedSelfDamage=me=>{
      if(queuedSelfDamage>0&&me.active){me.active.currentHp-=queuedSelfDamage;this.emit(`${me.active.name}에게 반동 ${queuedSelfDamage} 피해`);queuedSelfDamage=0;if(me.active.currentHp<=0)this.removeActive(source,"defeated");}
    };
    const returnActiveToDeck=(owner,reason="deck")=>{
      const player=this.state.players[owner];
      if(!player.active)return false;
      const active=player.active,id=active.id,name=active.name;
      const returned=[id,...(active.evolvedFromActive?.id?[active.evolvedFromActive.id]:[])];
      player.active=null;
      player.deck=shuffle([...returned,...player.deck]);
      player.replacementRequired=true;
      player.forcedReplacement=true;
      this.emit(`${name}이(가) 덱으로 되돌아갔고 덱을 셔플했습니다.${returned.length>1?" 진화 전 카드도 함께 되돌아갑니다.":""}`);
      return true;
    };
    const discardActive=(player,reason="effect",refill=true)=>{
      const active=player.active;
      if(!active)return null;
      const ids=[active.id,...(active.evolvedFromActive?.id?[active.evolvedFromActive.id]:[])];
      player.active=null;
      ids.forEach(id=>player.discard.push(id));
      if(refill)this.refill(player);
      this.emit(`${active.name} 제거 (${reason})${ids.length>1?" · 진화 전 카드도 함께 제거":""}`);
      return active;
    };
    const handCharacterCandidates=(player,e={})=>(player.hand||[]).filter(id=>{
      const card=cardById[id];
      return card?.type==="character"&&!isVmaxCard(card)&&id!==e.excludeCardId&&(!e.cardId||id===e.cardId)&&(!e.name||card.name===e.name);
    });
    const playHandCharacter=(player,id,{increment=true,summonedBy=null}={})=>{
      const card=cardById[id],handIndex=player.hand.indexOf(id);
      if(!card||card.type!=="character"||isVmaxCard(card)||handIndex<0)return false;
      player.hand.splice(handIndex,1);
      player.active={...clone(card),currentHp:card.hp};
      if(summonedBy)player.active.summonedBy=summonedBy;
      if(increment)player.characterUses++;
      player.replacementRequired=false;
      player.forcedReplacement=false;
      player.traitUsedThisTurn=false;
      player.traitAfterSkillAvailable=false;
      this.applyAutoTraits(this.state.players.indexOf(player));
      this.emit(`${player.name}: ${card.name} 배치 (${player.characterUses}/3)`);
      if(player.characterUses>3)this.end(this.state.players.indexOf(player)===0?1:0);
      return true;
    };
    for(const e of effects||[]){
      const me=this.state.players[source],enemy=this.state.players[1-source];
      if(e.type==="cannotUseAgainstName"||e.type==="cannotUseIfEnemyName")continue;
      if(skipOptionalCoin(e))continue;
      if(e.type==="transformSelfByHp"&&me.active){
        const low=me.active.currentHp<=(e.threshold||0);
        const nextName=low?e.belowName:e.aboveName,nextAttribute=low?e.belowAttribute:e.aboveAttribute,nextTags=low?e.belowTags:e.aboveTags;
        const before=`${me.active.name}/${me.active.attribute}`;
        if(nextName)me.active.name=nextName;
        if(nextAttribute)me.active.attribute=nextAttribute;
        if(nextTags)me.active.tags=[...new Set(nextTags)];
        const after=`${me.active.name}/${me.active.attribute}`;
        if(before!==after)this.emit(`${me.active.name}(으)로 상태가 바뀌었습니다. 속성: ${settings.tokenLabels[me.active.attribute]||me.active.attribute}`);
        continue;
      }
      if(e.type?.startsWith("bonusDamage")&&e.type!=="bonusDamageForOwnTokenColorThenSpend"){nextDamageBonus+=this.bonusDamage(source,e);continue;}
      if(e.type==="guessRandomHandCardAttributeBonus"){
        const hidden=enemy.hand.slice();
        const picked=context.guessedHandId&&hidden.includes(context.guessedHandId)?context.guessedHandId:hidden[Math.floor(Math.random()*hidden.length)];
        const guessed=context.guessedAttribute||me.active?.attribute;
        if(picked&&cardById[picked]?.attribute===guessed){nextDamageBonus+=e.amount||0;this.emit(`속성 맞추기 성공: ${settings.tokenLabels[guessed]||guessed}`);}
        else this.emit(picked?`속성 맞추기 실패: ${cardById[picked].name}은(는) ${settings.tokenLabels[cardById[picked].attribute]||"속성 없음"}`:"상대 손패에 맞출 카드가 없습니다.");
        continue;
      }
      if(e.type==="coinFlipDamageModifier"){const result=this.coinResult(me,context);if(result==="heads"){nextDamageMultiplier*=e.headsMultiplier||1;nextDamageBonus+=e.headsBonus||0;}else nextDamageBonus+=e.tailsBonus||0;continue;}
      if(e.type==="repeatCoinBonusUntilTails"){const results=context.coinResults?.length?context.coinResults.slice():[Math.random()<.5?"heads":"tails"];if(me.forceNextCoinHeads){results[0]="heads";me.forceNextCoinHeads=false;}let heads=0;for(const result of results){if(result==="heads")heads++;else break;}nextDamageBonus+=(e.headsBonus||0)*heads;this.emit(`동전 결과: 앞 ${heads}회${results[heads]==="tails"?" 후 뒤":""}`);continue;}
      if(e.type==="streakCoinDamageModifier"){const fallbackCount=e.maxFlips||3,results=context.coinResults?.length?context.coinResults.slice():Array.from({length:fallbackCount},()=>Math.random()<.5?"heads":"tails");if(me.forceNextCoinHeads){results[0]="heads";me.forceNextCoinHeads=false;}let heads=0;for(const result of results){if(result==="heads")heads++;else break;}const bonuses=e.headsBonuses||[];nextDamageBonus+=bonuses[Math.min(heads,bonuses.length-1)]||0;if(results[heads]==="tails")nextDamageBonus+=e.tailsBonus||0;this.emit(`동전 결과: 앞 ${heads}회${results[heads]==="tails"?" 후 뒤":""}`);continue;}
      if(e.type==="fixedCoinFlipsDamageBonus"){const results=this.coinResults(me,context,e.flips||1);nextDamageBonus+=(e.headsBonus||0)*results.filter(x=>x==="heads").length;continue;}
      if(e.type==="fixedCoinFlipsAllHeadsAddToken"){const results=this.coinResults(me,context,e.flips||1);if(results.every(result=>result==="heads")){const color=e.color||me.active?.attribute||settings.tokenTypes[0];me.tokens[color]=(me.tokens[color]||0)+(e.amount||1);this.emit(`${me.name}이(가) ${settings.tokenLabels[color]||color} 토큰 ${e.amount||1}개를 획득했습니다.`);}continue;}
      if(e.type==="coinFlipsDamageBonusAndSelfDamage"){const results=this.coinResults(me,context,e.flips||1),heads=results.filter(x=>x==="heads").length,tails=results.length-heads;nextDamageBonus+=(e.headsBonus||0)*heads;queuedSelfDamage+=(e.tailsSelfDamage||0)*tails;continue;}
      if(e.type==="coinFlipBonusDamageStealTokenOrSelfDamage"){const result=this.coinResult(me,context);if(result==="heads"){nextDamageBonus+=e.headsBonus||0;for(let i=0;i<(e.headsStealToken||0);i++)stealOne(me,enemy);}else queuedSelfDamage+=e.tailsSelfDamage||0;continue;}
      if(e.type==="coinFlipBonusDamageUnlessEnemyAttribute"){if(enemy.active?.attribute!==e.attribute){const result=this.coinResult(me,context);if(result==="heads")nextDamageBonus+=e.headsBonus||0;}continue;}
      if(e.type==="coinFlipBonusOrSelfDamageIfEnemyAttribute"){if(enemy.active?.attribute===e.attribute){const result=this.coinResult(me,context);if(result==="heads")nextDamageBonus+=e.headsBonus||0;else queuedSelfDamage+=e.tailsSelfDamage||0;}continue;}
      if(e.type==="coinFlipStealToken"){const result=this.coinResult(me,context);if(result==="heads")for(let i=0;i<(e.amount||1);i++)stealOne(me,enemy);continue;}
      if(e.type==="coinFlipAddTokensByResult"){const results=this.coinResults(me,context,e.flips||1),heads=results.filter(x=>x==="heads").length,tails=results.length-heads;if(e.headsColor&&heads){me.tokens[e.headsColor]=(me.tokens[e.headsColor]||0)+heads;this.emit(`${me.name}이(가) ${settings.tokenLabels[e.headsColor]||e.headsColor} 토큰 ${heads}개를 획득했습니다.`);}if(e.tailsColor&&tails){me.tokens[e.tailsColor]=(me.tokens[e.tailsColor]||0)+tails;this.emit(`${me.name}이(가) ${settings.tokenLabels[e.tailsColor]||e.tailsColor} 토큰 ${tails}개를 획득했습니다.`);}continue;}
      if(e.type==="coinFlipBonusDamageOrHealEnemy"){const result=this.coinResult(me,context);if(result==="heads")nextDamageBonus+=e.headsBonus||0;else if(enemy.active&&e.tailsHealEnemy){enemy.active.currentHp=Math.min(enemy.active.hp,enemy.active.currentHp+e.tailsHealEnemy);this.emit(`${enemy.active.name}의 HP를 ${e.tailsHealEnemy} 회복했습니다.`);}continue;}
      if(e.type==="pushYourLuckDamageModifier"){const results=context.coinResults?.length?context.coinResults.slice():[];if(!results.length)continue;if(me.forceNextCoinHeads){results[0]="heads";me.forceNextCoinHeads=false;}const tailsIndex=results.indexOf("tails"),heads=tailsIndex>=0?tailsIndex:results.length;if(tailsIndex>=0){queuedSelfDamage+=e.tailsSelfDamage||0;this.emit(`동전 도전 실패: 추가 피해를 잃고 반동 ${e.tailsSelfDamage||0} 피해`);}else{nextDamageBonus+=heads*(e.headsBonus||0);this.emit(`동전 도전 성공: 추가 피해 ${heads*(e.headsBonus||0)}`);}continue;}
      if(e.type==="coinFlipHealSelfOrBonusDamage"){const result=this.coinResult(me,context);if(result==="heads"&&me.active)me.active.currentHp=Math.min(me.active.hp,me.active.currentHp+(e.headsHeal||0));else nextDamageBonus+=e.tailsBonus||0;continue;}
      if(e.type==="coinFlipSelfDamageOnTails"){const result=this.coinResult(me,context);if(result==="tails")queuedSelfDamage+=e.amount||0;continue;}
      if(e.type==="recoverThisStrategyOnCoinHeads"){const result=this.coinResult(me,context),id=context.cardId;if(result==="heads"&&id){const idx=me.discard.lastIndexOf(id);if(idx>=0){me.discard.splice(idx,1);me.hand.push(id);this.emit(`${cardById[id]?.name||id}을(를) 다시 손패로 가져왔습니다.`);}}continue;}
      if(e.type==="coinFlip"&&typeof window!=="undefined")window.dispatchEvent(new CustomEvent("politimon:coinflip",{detail:{source,...e}}));
      if(e.type==="defeatIfHpAtOrBelow"&&enemy.active&&enemy.active.currentHp<=e.threshold){if(enemy.protectedPackThisTurn?.packId&&enemy.active.packIds?.includes(enemy.protectedPackThisTurn.packId)){this.emit(`${enemy.active.name}은(는) 보호 효과로 제거되지 않습니다.`);continue;}this.emit(`${enemy.active.name}은(는) 조건 충족으로 즉시 제거됩니다.`);this.removeActive(1-source,"defeated");continue;}
      if(e.type==="gainTokenIfDefeats"){gainTokenOnDefeat+=e.amount||1;continue;}
      if(e.type==="healSelfIfDefeats"){healSelfOnDefeat+=e.amount||0;continue;}
      if(e.type==="healIfDiscarded"){if(context.discardedCharacter&&me.active)me.active.currentHp=Math.min(me.active.hp,me.active.currentHp+(e.amount||0));continue;}
      if(e.type==="requiresStrategyInHand")continue;
      if(e.type==="blockOpponentNextSkill"){enemy.nextSkillBlocked=true;this.emit(`${enemy.name}은(는) 다음 턴에 기술을 사용할 수 없습니다.`);continue;}
      if(e.type==="increaseEnemySkillCostNextTurn"){enemy.skillCostIncreaseNextTurn+=(e.amount||0);this.emit(`${enemy.name}의 다음 턴 기술 비용이 아무 토큰 ${e.amount||0}개만큼 증가합니다.`);continue;}
      if(e.type==="increaseEnemyActionCostNextTurn"){enemy.actionCostIncreaseNextTurn+=(e.amount||0);this.emit(`${enemy.name}의 다음 턴 기술/특성 비용이 아무 토큰 ${e.amount||0}개만큼 증가합니다.`);continue;}
      if(e.type==="forceNextCoinHeads"){me.forceNextCoinHeads=true;this.emit(`${me.name}의 다음 동전 던지기 1회는 앞면으로 간주됩니다.`);continue;}
      if(e.type==="nextTurnSkillDamageMultiplier"){me.skillDamageMultiplierNextTurn=e.amount||1;this.emit(`${me.name}의 다음 턴 기술 피해량이 ${e.amount}배가 됩니다.`);continue;}
      if(e.type==="nextTurnSkillDamageBonusIfEnemyAttribute"){if(enemy.active?.attribute===e.attribute){me.skillDamageBonusNextTurn+=(e.amount||0);this.emit(`${me.name}의 다음 턴 기술 피해가 ${e.amount} 증가합니다.`);}continue;}
      if(e.type==="nextTurnExtraToken"){me.nextTurnExtraTokens+=(e.amount||1);this.emit(`${me.name}은(는) 다음 턴 종료 시 토큰을 추가로 받습니다.`);continue;}
      if(e.type==="allowExtraSkill"){this.state.actionAvailable=true;this.emit(`${me.name}은(는) 기술을 한 번 더 사용할 수 있습니다.`);continue;}
      if(e.type==="allowExtraAction"){this.state.actionAvailable=true;me.traitUsedThisTurn=false;this.emit(`${me.name}은(는) 기술 또는 특성을 한 번 더 사용할 수 있습니다.`);continue;}
      if(e.type==="allowTraitAfterSkill"){me.traitAfterSkillAvailable=true;this.emit(`${me.name}은(는) 이 기술 후 특성을 사용할 수 있습니다.`);continue;}
      if(e.type==="allowFreeRetreatThisTurn"){me.freeRetreatThisTurn=true;this.emit(`${me.name}은(는) 이번 턴 비용 없이 후퇴할 수 있습니다.`);continue;}
      if(e.type==="shieldPackFromOpponentEffectsNextTurn"){me.protectedPackNextOpponentTurn={packId:e.packId};this.emit(`${me.name}의 ${packs.find(p=>p.id===e.packId)?.name||e.packId} 인물이 다음 상대 턴에 보호됩니다.`);continue;}
      if(e.type==="reflectNextOpponentDamage"){me.reflectDamageNextOpponentTurn=true;this.emit(`${me.active?.name||me.name}은(는) 다음 상대 턴 공격을 한 번 반사합니다.`);continue;}
      if(e.type==="reflectPreviousOpponentDamage"){const amount=me.previousOpponentAttackDamage||0;if(amount>0&&enemy.active){me.previousOpponentAttackDamage=0;this.emit(`${me.name}이(가) 직전 상대 턴에 받은 공격 피해 ${amount}을(를) 반사합니다.`);this.applyDamage(source,amount,{direct:true});}else this.emit("직전 상대 턴에 반사할 공격 피해가 없습니다.");continue;}
      if(e.type==="skipEnemyNextTokenGain"){enemy.skipTokenGainNextTurn=true;this.emit(`${enemy.name}은(는) 다음 턴 종료 시 토큰을 받을 수 없습니다.`);continue;}
      if(e.type==="turnEnemyActiveFaceDownIfEnemyAttributeIn"){if(enemy.active&&e.attributes?.includes(enemy.active.attribute)){if(enemy.protectedPackThisTurn?.packId&&enemy.active.packIds?.includes(enemy.protectedPackThisTurn.packId)){this.emit(`${enemy.active.name}은(는) 보호 효과로 뒷면이 되지 않습니다.`);continue;}enemy.active.faceDown=true;enemy.traitUsedThisTurn=false;enemy.traitAfterSkillAvailable=false;this.emit(`${enemy.active.name} 카드가 뒷면이 되어 비활성화됩니다.`);}continue;}
      if(e.type==="blockOpponentNextAction"){enemy.nextActionBlocked=true;this.emit(`${enemy.name}은(는) 다음 턴에 행동할 수 없습니다.`);continue;}
      if(e.type==="blockOpponentNextActionIfEnemyAttributeIn"){if(e.attributes?.includes(enemy.active?.attribute)){enemy.nextActionBlocked=true;this.emit(`${enemy.name}은(는) 다음 턴에 행동할 수 없습니다.`);}else this.emit(`${enemy.active?.name||"상대 인물"}은(는) 효과 대상이 아닙니다.`);continue;}
      if(e.type==="reduceOpponentDamageNextTurnIfTag"){const exists=(enemy.damageReductionRulesNextTurn||[]).some(rule=>rule.tag===e.tag&&rule.amount===e.amount);if(!e.unique||!exists)enemy.damageReductionRulesNextTurn.push({tag:e.tag,amount:e.amount||0});this.emit(`${enemy.name}의 다음 턴 해당 정치인 피해가 ${e.amount||0} 감소합니다.`);continue;}
      if(e.type==="revealRandomHand"){const ids=enemy.hand.slice().sort(()=>Math.random()-.5).slice(0,e.amount||1),revealed=ids.map(id=>cardById[id]?.name||id);this.emit(revealed.length?`${enemy.name}의 손패 확인: ${revealed.join(", ")}`:`${enemy.name}의 손패가 없습니다.`);if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("politimon:reveal",{detail:{source,target:1-source,ids}}));continue;}
      if(e.type==="revealChosenEnemyHand"){const id=context.revealHandId&&enemy.hand.includes(context.revealHandId)?context.revealHandId:enemy.hand[0];this.emit(id?`${enemy.name}의 손패 확인: ${cardById[id]?.name||id}`:`${enemy.name}의 손패가 없습니다.`);if(id&&typeof window!=="undefined")window.dispatchEvent(new CustomEvent("politimon:reveal",{detail:{source,target:1-source,ids:[id]}}));continue;}
      if(e.type==="returnEnemyHandStrategiesToDeck"){const returned=[];enemy.hand=enemy.hand.filter(id=>{if(cardById[id]?.type==="strategy"){returned.push(id);return false;}return true;});if(returned.length){enemy.deck=shuffle([...returned,...enemy.deck]);this.emit(`${enemy.name}의 전략 카드 ${returned.length}장이 덱으로 되돌아갔고 셔플되었습니다.`);}else this.emit(`${enemy.name}의 손패에 되돌릴 전략 카드가 없습니다.`);continue;}
      if(e.type==="stealEnemyTopDeckCard"){const id=enemy.deck.shift();if(id){me.hand.push(id);this.emit(`${me.name}이(가) 상대 덱에서 카드 1장을 가져왔습니다.`);}else this.emit(`${enemy.name}의 덱에 가져올 카드가 없습니다.`);continue;}
      if(e.type==="convertEnemyToken"){for(let i=0;i<(e.amount||1);i++){const from=context.convertEnemyColor;if(this.convertToken(enemy,from,e.to))this.emit(`${enemy.name}의 토큰 1개가 ${settings.tokenLabels[e.to]||e.to}(으)로 바뀌었습니다.`);}continue;}
      if(e.type==="convertOwnTokenToActiveAttribute"){const to=context.tokenColor||me.active?.attribute||settings.tokenTypes[0];for(let i=0;i<(e.amount||1);i++)if(this.convertToken(me,null,to))this.emit(`${me.name}의 토큰 1개가 ${settings.tokenLabels[to]||to}(으)로 바뀌었습니다.`);continue;}
      if(e.type==="convertOwnTokenToChosenColor"){const to=context.tokenColor||me.active?.attribute||settings.tokenTypes[0];for(let i=0;i<(e.amount||1);i++)if(this.convertToken(me,null,to))this.emit(`${me.name}의 토큰 1개가 ${settings.tokenLabels[to]||to}(으)로 바뀌었습니다.`);continue;}
      if(e.type==="convertAllEnemyTokensByColor"){const from=e.from,to=context.tokenColor||me.active?.attribute||settings.tokenTypes[0],count=enemy.tokens[from]||0;if(count){enemy.tokens[from]=0;enemy.tokens[to]=(enemy.tokens[to]||0)+count;this.emit(`${enemy.name}의 ${settings.tokenLabels[from]||from} 토큰 ${count}개가 ${settings.tokenLabels[to]||to}(으)로 바뀌었습니다.`);}continue;}
      if(e.type==="changeSelfAttribute"&&me.active){const to=context.tokenColor||me.active.attribute;if(settings.tokenTypes.includes(to)){me.active.attribute=to;this.emit(`${me.active.name}의 속성이 ${settings.tokenLabels[to]||to}(으)로 바뀌었습니다.`);}continue;}
      if(e.type==="toggleSelfForm"&&me.active?.forms?.length){
        const currentIndex=Math.max(0,me.active.forms.findIndex(form=>form.id===me.active.formId));
        const form=me.active.forms[(currentIndex+1)%me.active.forms.length];
        const currentHp=me.active.currentHp;
        Object.assign(me.active,{formId:form.id,name:form.name,image:form.image,attribute:form.attribute,weakness:form.weakness,resistance:form.resistance,skills:clone(form.skills||[])});
        me.active.currentHp=currentHp;
        this.emit(`${me.active.name}(으)로 폼 체인지했습니다. 현재 HP ${currentHp}은(는) 유지됩니다.`);
        continue;
      }
      if(e.type==="increaseMaxHp"&&me.active){me.active.hp+=(e.amount||0);this.emit(`${me.active.name}의 최대 HP가 ${e.amount||0} 증가했습니다.`);continue;}
      if(e.type==="decreaseMaxHp"&&me.active){me.active.hp=Math.max(10,me.active.hp-(e.amount||0));me.active.currentHp=Math.min(me.active.currentHp,me.active.hp);this.emit(`${me.active.name}의 최대 HP가 ${e.amount||0} 감소했습니다.`);continue;}
      if(e.type==="healIfSelfTag"){if(me.active?.tags?.includes(e.tag)){me.active.currentHp=Math.min(me.active.hp,me.active.currentHp+(e.amount||0));this.emit(`${me.active.name}의 HP를 ${e.amount||0} 회복했습니다.`);}continue;}
      if(e.type==="addPermanentDamageReduction"&&me.active){me.active.permanentDamageReduction=(me.active.permanentDamageReduction||0)+(e.amount||0);this.emit(`${me.active.name}이(가) 영구 피해 경감 ${e.amount||0}을 얻었습니다.`);continue;}
      if(e.type==="nextAttackDamageMultiplierThisTurn"){me.skillDamageMultiplierThisTurn*=e.amount||1;if(e.roundDownTo)me.roundDamageTo10ThisTurn=true;this.emit(`${me.name}의 이번 턴 다음 기술 피해량이 ${e.amount}배가 됩니다.`);continue;}
      if(e.type==="bonusDamageForOwnTokenColorThenSpend"){const color=e.color,count=me.tokens[color]||0;if(count){me.tokens[color]=0;nextDamageBonus+=count*(e.amount||0);this.emit(`${me.name}이(가) ${settings.tokenLabels[color]||color} 토큰 ${count}개를 추가 소모했습니다.`);}continue;}
      if(e.type==="discardOwnTokensDrawThenDiscardHandBonusDamage"){if(e.optional&&context.skipOptionalTrade)continue;const color=e.color,count=me.tokens[color]||0;if(count){me.tokens[color]=0;this.draw(me,count);const discarded=me.hand.splice(0);discarded.forEach(id=>me.discard.push(id));nextDamageBonus+=discarded.length*(e.amount||0);this.emit(`${me.name}이(가) ${settings.tokenLabels[color]||color} 토큰 ${count}개와 손패 ${discarded.length}장을 트래쉬했습니다.`);}continue;}
      if(e.type==="recoverRandomStrategyFromDeck"){const strategies=(me.deck||[]).filter(id=>cardById[id]?.type==="strategy");const id=strategies[Math.floor(Math.random()*strategies.length)];if(id){me.deck.splice(me.deck.indexOf(id),1);me.hand.push(id);this.emit(`${me.name}이(가) 덱에서 ${cardById[id]?.name||id}을(를) 손패로 가져왔습니다.`);}continue;}
      if(e.type==="optionalDefeatSelfForBonusDamage"){if(context.defeatSelfForBonus){nextDamageBonus+=e.amount||0;defeatSelfAfterDamage=true;this.emit(`${me.active?.name||me.name}이(가) 추가 피해를 선택했습니다.`);}continue;}
      if(e.type==="discardAnyHandCardThenDefeatEnemy"){const id=context.discardHandId;if(id&&me.hand.includes(id)&&enemy.active){me.hand.splice(me.hand.indexOf(id),1);me.discard.push(id);this.emit(`${me.name}이(가) 손패 1장을 트래쉬했습니다.`);this.removeActive(1-source,"defeated");}else this.emit("트래쉬할 손패 또는 상대 인물 카드가 없습니다.");continue;}
      if(e.type==="stealAllTokensExceptCount"){const keep=e.keep||0,kept=[];for(let i=0;i<keep;i++){const color=settings.tokenTypes.slice().filter(c=>(enemy.tokens[c]||0)>kept.filter(keptColor=>keptColor===c).length).sort((a,b)=>((enemy.tokens[b]||0)-kept.filter(c=>c===b).length)-((enemy.tokens[a]||0)-kept.filter(c=>c===a).length))[0];if(color)kept.push(color);}let total=0;settings.tokenTypes.forEach(color=>{const leave=kept.filter(c=>c===color).length,steal=Math.max(0,(enemy.tokens[color]||0)-leave);if(steal){enemy.tokens[color]-=steal;me.tokens[color]=(me.tokens[color]||0)+steal;total+=steal;}});this.emit(`${me.name}이(가) 상대 토큰 ${total}개를 가져왔습니다.`);continue;}
      if(e.type==="swapHandCardWithEnemy"){const own=context.ownHandId&&me.hand.includes(context.ownHandId)?context.ownHandId:me.hand[0],other=context.enemyHandId&&enemy.hand.includes(context.enemyHandId)?context.enemyHandId:enemy.hand[0];if(own&&other){me.hand[me.hand.indexOf(own)]=other;enemy.hand[enemy.hand.indexOf(other)]=own;this.emit(`${me.name}이(가) 손패 1장을 교환했습니다.`);}continue;}
      if(e.type==="discardPreferredHandCardForBonusDamage"){let id=me.hand.includes(e.preferredCardId)?e.preferredCardId:(context.discardHandId&&me.hand.includes(context.discardHandId)?context.discardHandId:me.hand[0]);if(id){me.hand.splice(me.hand.indexOf(id),1);me.discard.push(id);const bonus=id===e.preferredCardId?(e.preferredBonus||0):(e.fallbackBonus||0);nextDamageBonus+=bonus;this.emit(`${cardById[id]?.name||id}을(를) 트래쉬하고 추가 피해 ${bonus}`);}continue;}
      if(e.type==="suspendEnemyTokens"){const suspended=emptyTokens();let total=0;settings.tokenTypes.forEach(color=>{const count=enemy.tokens[color]||0;if(count){suspended[color]=count;enemy.tokens[color]=0;total+=count;}});if(total){enemy.suspendedTokensReturn=suspended;this.emit(`${enemy.name}의 토큰 ${total}개를 한 턴간 압류했습니다.`);}continue;}
      if(e.type==="spyTwoEnemyCardsStealOneAndReplace"){const seen=enemy.hand.slice(0,2);if(seen.length){seen.forEach(id=>{const idx=enemy.hand.indexOf(id);if(idx>=0)enemy.hand.splice(idx,1);});const selected=context.stealHandId&&seen.includes(context.stealHandId)?context.stealHandId:[...seen].sort((a,b)=>rarityRank(a)-rarityRank(b)||a.localeCompare(b))[0],returned=seen.find(id=>id!==selected);if(returned)enemy.hand.push(returned);me.hand.push(selected);const replacement=me.deck.shift();if(replacement)enemy.hand.push(replacement);this.emit(`${me.name}이(가) 상대 손패 ${seen.length}장을 확인하고 1장을 가져왔습니다. 상대는 ${me.name}의 덱에서 1장을 받았습니다.`);}else this.emit(`${enemy.name}의 손패에 확인할 카드가 없습니다.`);continue;}
      if(e.type==="selfDefeatAndSkipDamageIfEnemyNameIn"){if((e.names||[]).some(name=>this.activeMatchesName(enemy.active,name))){skipNextDamage=true;this.emit(`${enemy.active.name}을(를) 상대로 피해를 줄 수 없어 스스로 제거됩니다.`);this.removeActive(source,"defeated");}continue;}
      if(e.type==="treatEnemyAttributeForDamage"&&enemy.active){this.emit(`${enemy.active.name}의 속성을 ${settings.tokenLabels[e.attribute]||e.attribute}(으)로 취급합니다.`);continue;}
      if(e.type==="optionalDiscardCharacterFromHand"){const id=context.discardCharacterId;if(id&&me.hand.includes(id)&&cardById[id]?.type==="character"){me.hand.splice(me.hand.indexOf(id),1);this.removeCard(source,id,"effect");context.discardedCharacter=true;}continue;}
      if(e.type==="discardCharacterFromHand"){const requested=context.discardCharacterId,id=requested&&me.hand.includes(requested)&&cardById[requested]?.type==="character"?requested:me.hand.find(id=>cardById[id]?.type==="character");if(id){me.hand.splice(me.hand.indexOf(id),1);this.removeCard(source,id,"effect");context.discardedCharacter=true;}continue;}
      if(e.type==="recoverCharacterFromTrash"){recoverFromTrash(me,(card,id)=>(!e.attribute||card.attribute===e.attribute)&&(!e.name||card.name===e.name)&&(!e.cardId||id===e.cardId),context.trashCharacterId);continue;}
      if(e.type==="recoverCharacterFromTrashToDeck"){
        const candidates=(me.discard||[]).filter(id=>{const card=cardById[id];return card?.type==="character"&&(!e.attribute||card.attribute===e.attribute)&&(!e.name||card.name===e.name)&&(!e.cardId||id===e.cardId);});
        const selected=context.trashCharacterId&&candidates.includes(context.trashCharacterId)?context.trashCharacterId:candidates.sort((a,b)=>rarityRank(a)-rarityRank(b)||a.localeCompare(b))[0];
        if(selected){const idx=me.discard.indexOf(selected);me.discard.splice(idx,1);me.deck=shuffle([selected,...me.deck]);this.emit(`${cardById[selected]?.name||selected}을(를) 트래쉬에서 덱으로 되돌리고 셔플했습니다.`);}
        continue;
      }
      if(e.type==="evolveSelfFromHandWithoutUseCount"&&me.active){
        const id=e.cardId,card=cardById[id],handIndex=me.hand.indexOf(id);
        if(!card||handIndex<0){this.emit(`${card?.name||id} 카드가 손패에 없어 덮어씌울 수 없습니다.`);continue;}
        const base=me.active;
        me.hand.splice(handIndex,1);
        me.active={...clone(card),currentHp:card.hp,evolvedFromActive:clone(base),baseCardId:base.id};
        me.traitUsedThisTurn=false;
        me.traitAfterSkillAvailable=false;
        this.applyAutoTraits(source);
        this.emit(`${base.name} 위에 ${card.name}을(를) 덮어씌웠습니다. 인물 사용 카운트는 증가하지 않습니다.`);
        continue;
      }
      if(e.type==="playHandCharacterAsStrategyNoCount"){
        const candidates=handCharacterCandidates(me,e),id=context.handCharacterId&&candidates.includes(context.handCharacterId)?context.handCharacterId:candidates[0];
        if(!id){this.emit("배치할 인물 카드가 손패에 없습니다.");continue;}
        if(me.active)discardActive(me,"switch",false);
        playHandCharacter(me,id,{increment:false});
        continue;
      }
      if(e.type==="replaceSelfWithHandCharacter"&&me.active){
        const id=e.cardId,card=cardById[id];
        discardActive(me,"effect",true);
        if(id&&me.hand.includes(id))playHandCharacter(me,id,{increment:true,summonedBy:e.summonedBy||null});
        else this.emit(`${card?.name||id} 카드가 손패에 없어 배치하지 못했습니다.`);
        if(e.allowAction&&me.active&&this.state.winner==null){this.state.phase="playing";this.state.actionAvailable=true;}
        continue;
      }
      if(e.type==="sendEnemyActiveToDeck"){if(enemy.active&&enemy.protectedPackThisTurn?.packId&&enemy.active.packIds?.includes(enemy.protectedPackThisTurn.packId))this.emit(`${enemy.active.name}은(는) 보호 효과로 덱으로 돌아가지 않습니다.`);else returnActiveToDeck(1-source);continue;}
      if(e.type==="sendEnemyActiveToDeckIfPackNotName"){if(enemy.active?.type==="character"&&enemy.active?.packIds?.includes(e.packId)&&enemy.active?.name!==e.name){if(enemy.protectedPackThisTurn?.packId&&enemy.active.packIds?.includes(enemy.protectedPackThisTurn.packId))this.emit(`${enemy.active.name}은(는) 보호 효과로 덱으로 돌아가지 않습니다.`);else returnActiveToDeck(1-source);}else this.emit(`${enemy.active?.name||"상대 인물"}은(는) 효과 대상이 아닙니다.`);continue;}
      if(e.type==="sendEnemyActiveToDeckIfNameIn"){if(enemy.active?.type==="character"&&(e.names||[]).includes(enemy.active.name)){if(enemy.protectedPackThisTurn?.packId&&enemy.active.packIds?.includes(enemy.protectedPackThisTurn.packId))this.emit(`${enemy.active.name}은(는) 보호 효과로 덱으로 돌아가지 않습니다.`);else returnActiveToDeck(1-source);}else this.emit(`${enemy.active?.name||"상대 인물"}은(는) 효과 대상이 아닙니다.`);continue;}
      if(e.type==="discardEnemyActiveIfPackNoUseCount"){if(e.excludedIds?.includes(enemy.active?.id))this.emit(`${enemy.active.name}은(는) 탄핵 대상에서 제외됩니다.`);else if(enemy.active?.type==="character"&&enemy.active.packIds?.includes(e.packId)){if(enemy.protectedPackThisTurn?.packId&&enemy.active.packIds.includes(enemy.protectedPackThisTurn.packId))this.emit(`${enemy.active.name}은(는) 보호 효과로 트래쉬되지 않습니다.`);else{const removed=discardActive(enemy,"탄핵",true);if(removed){enemy.replacementRequired=true;enemy.forcedReplacement=true;enemy.replacementDoesNotCount=true;this.emit(`${removed.name}이(가) 탄핵되어 트래쉬로 이동했습니다. 교체 인물은 사용 카운트를 소비하지 않습니다.`);}}}else this.emit(`${enemy.active?.name||"상대 인물"}은(는) 대통령 카드가 아닙니다.`);continue;}
      if(e.type==="toggleOwnActiveGender"&&me.active){const tags=new Set(me.active.tags||[]);if(tags.has("female")){tags.delete("female");tags.add("male");this.emit(`${me.active.name}의 성별 태그가 남성으로 바뀌었습니다.`);}else{tags.delete("male");tags.add("female");this.emit(`${me.active.name}의 성별 태그가 여성으로 바뀌었습니다.`);}me.active.tags=[...tags];continue;}
      if(e.type==="discardEnemyTokens"){let total=0;settings.tokenTypes.forEach(c=>{total+=enemy.tokens[c]||0;enemy.tokens[c]=0;});this.emit(`${enemy.name}의 토큰 ${total}개를 모두 트래쉬했습니다.`);continue;}
      if(e.type==="stealSpecificToken"){for(let i=0;i<(e.amount||1);i++)stealOne(me,enemy,e.color);continue;}
      if(e.type==="defeatEnemyAndSelf"){if(enemy.active){if(enemy.protectedPackThisTurn?.packId&&enemy.active.packIds?.includes(enemy.protectedPackThisTurn.packId))this.emit(`${enemy.active.name}은(는) 보호 효과로 제거되지 않습니다.`);else this.removeActive(1-source,"defeated");}if(me.active)this.removeActive(source,"defeated");continue;}
      if(e.type==="damageByEnemyTrashCharacters"&&enemy.active){const count=(enemy.discard||[]).filter(id=>cardById[id]?.type==="character").length;let damage=(e.amount||0)*count;if(context.actionType==="skill")damage=(damage+(me.skillDamageBonusThisTurn||0))*(me.skillDamageMultiplierThisTurn||1);if(context.actionType!=="strategy")damage=this.reduceOutgoingDamage(source,damage);const defeated=this.applyDamage(source,damage,{overflowToReplacement:e.overflowToReplacement});if(defeated){if(gainTokenOnDefeat>0){const color=context.tokenColor||me.active?.attribute||settings.tokenTypes[0];me.tokens[color]=(me.tokens[color]||0)+gainTokenOnDefeat;this.emit(`${me.name}이(가) ${settings.tokenLabels[color]} 토큰 ${gainTokenOnDefeat}개 획득`);}if(healSelfOnDefeat&&me.active)me.active.currentHp=Math.min(me.active.hp,me.active.currentHp+healSelfOnDefeat);}applyQueuedSelfDamage(me);continue;}
      if(e.type==="damage"&&enemy.active){if(skipNextDamage){skipNextDamage=false;nextDamageBonus=0;nextDamageMultiplier=1;applyQueuedSelfDamage(me);continue;}let damage=((e.amount||0)+nextDamageBonus)*nextDamageMultiplier;if(context.actionType==="skill")damage=(damage+(me.skillDamageBonusThisTurn||0))*(me.skillDamageMultiplierThisTurn||1);if(me.roundDamageTo10ThisTurn)damage=Math.floor(damage/10)*10;if(context.actionType!=="strategy")damage=this.reduceOutgoingDamage(source,damage);nextDamageBonus=0;nextDamageMultiplier=1;me.roundDamageTo10ThisTurn=false;const defeated=this.applyDamage(source,damage,{overflowToReplacement:e.overflowToReplacement});if(defeated){if(gainTokenOnDefeat>0){const color=context.tokenColor||me.active?.attribute||settings.tokenTypes[0];me.tokens[color]=(me.tokens[color]||0)+gainTokenOnDefeat;this.emit(`${me.name}이(가) ${settings.tokenLabels[color]} 토큰 ${gainTokenOnDefeat}개 획득`);}if(healSelfOnDefeat&&me.active)me.active.currentHp=Math.min(me.active.hp,me.active.currentHp+healSelfOnDefeat);}applyQueuedSelfDamage(me);if(defeatSelfAfterDamage&&me.active){defeatSelfAfterDamage=false;this.removeActive(source,"effect");}continue;}
      if(e.type==="directDamage"){this.applyDamage(source,e.amount||0,{direct:true});applyQueuedSelfDamage(me);continue;}
      if(e.type==="selfDamage"&&me.active){if(e.optionalCoinCost&&context.skipOptionalCoinFlip)continue;me.active.currentHp-=e.amount||0;this.emit(`${me.active.name}에게 반동 ${e.amount||0} 피해`);if(me.active.currentHp<=0)this.removeActive(source,"defeated");}
      if(e.type==="heal"&&me.active)me.active.currentHp=Math.min(me.active.hp,me.active.currentHp+e.amount);
      if(e.type==="healIfSelfHpAtMost"&&me.active&&me.active.currentHp<=(e.threshold||0)){me.active.currentHp=Math.min(me.active.hp,me.active.currentHp+(e.amount||0));this.emit(`${me.active.name}의 HP를 ${e.amount||0} 회복했습니다.`);}
      if(e.type==="draw")this.draw(me,e.amount);
      if(e.type==="addToken"||e.type==="attachToken"){const color=e.color==="any"?(context.tokenColor||me.active?.attribute||settings.tokenTypes[0]):e.color;me.tokens[color]=(me.tokens[color]||0)+(e.amount||1);this.emit(`${me.name}이(가) ${settings.tokenLabels[color]||color} 토큰 ${e.amount||1}개를 ${e.type==="attachToken"?"붙였습니다":"획득했습니다."}`);}
      if(e.type==="stealToken"){for(let i=0;i<(e.amount||1);i++)stealOne(me,enemy);}
    }
    applyQueuedSelfDamage(this.state.players[source]);
  }
  removeCard(index,id,reason){ const p=this.state.players[index];p.discard.push(id);this.refill(p);this.emit(`${cardById[id]?.name||id} 제거 (${reason})`); }
  removeActive(index,reason){
    const p=this.state.players[index],active=p.active;
    if(!active)return;
    const ids=[active.id,...(active.evolvedFromActive?.id?[active.evolvedFromActive.id]:[])];
    p.active=null;
    p.replacementDoesNotCount=reason==="retreat";
    ids.forEach(id=>p.discard.push(id));
    this.refill(p);
    this.emit(`${active.name} 제거 (${reason})${ids.length>1?" · 진화 전 카드도 함께 제거":""}`);
    if(reason!=="retreat"&&p.characterUses>=3){this.end(1-index);return;}
    if(reason==="defeated"){
      const hasReplacement=p.hand.some(id=>cardById[id]?.type==="character"&&!isVmaxCard(cardById[id]));
      if(!hasReplacement){
        this.emit(`${p.name}은(는) 배치할 인물 카드가 없어 패배합니다.`);
        this.end(1-index);
        return;
      }
    }
    p.replacementRequired=true;
    p.forcedReplacement=reason==="defeated";
    if(reason==="defeated")this.emit(`${p.name}은(는) 다음 턴에 인물을 강제 교체합니다.`);
  }
  refill(p){if(Number.isInteger(settings.handRefillCount)&&settings.handRefillCount>0)this.draw(p,settings.handRefillCount);}
  flipFaceDownActive(index,context={}){const p=this.state.players[index];if(this.state.phase!=="playing"||this.state.turn!==index||!this.state.actionAvailable||this.state.winner!=null||!p.active?.faceDown)return null;const result=this.coinResult(p,context);if(result==="heads"){p.active.faceDown=false;this.emit(`${p.active.name} 카드가 앞면이 되어 다시 활성화됩니다.`);}else this.emit(`${p.active.name} 카드는 뒷면 상태를 유지합니다.`);const color=settings.tokenTypes.includes(context.tokenColor)?context.tokenColor:(p.active.attribute&&settings.tokenTypes.includes(p.active.attribute)?p.active.attribute:settings.tokenTypes[0]);this.endTurn(index,color,[],{allowFaceDownPass:true});return result;}
  endTurn(index,color,extraColors=[],{allowFaceDownPass=false}={}){
    if(!["playing","forced-end"].includes(this.state.phase)||this.state.turn!==index||this.state.winner!=null)return false;
    if(!settings.tokenTypes.includes(color))return false;
    const current=this.state.players[index],extra=current.extraTokensThisTurn||0;
    if(current.active?.faceDown&&!allowFaceDownPass)return false;
    let gained=0;
    if(current.skipTokenGainThisTurn)this.emit(`${current.name}은(는) 효과로 토큰을 받을 수 없습니다.`);
    else{
      current.tokens[color]++;gained++;
      for(let i=0;i<extra;i++){const extraColor=extraColors[i]&&settings.tokenTypes.includes(extraColors[i])?extraColors[i]:color;current.tokens[extraColor]++;gained++;}
    }
    if(current.suspendedTokensReturn){
      let total=0;
      settings.tokenTypes.forEach(c=>{const count=current.suspendedTokensReturn[c]||0;if(count){current.tokens[c]=(current.tokens[c]||0)+count;total+=count;}});
      current.suspendedTokensReturn=null;
      if(total)this.emit(`${current.name}의 압류된 토큰 ${total}개가 돌아왔습니다.`);
    }
    current.extraTokensThisTurn=0;current.traitAfterSkillAvailable=false;current.forceNextCoinHeads=false;current.skillBlockedThisTurn=false;current.actionBlockedThisTurn=false;current.damageReductionRulesThisTurn=[];current.skillDamageMultiplierThisTurn=1;current.skillDamageBonusThisTurn=0;current.skillCostIncreaseThisTurn=0;current.actionCostIncreaseThisTurn=0;current.skipTokenGainThisTurn=false;current.freeRetreatThisTurn=false;current.protectedPackThisTurn=null;current.reflectDamageThisTurn=false;current.previousOpponentAttackDamage=0;current.currentOpponentAttackDamage=0;current.roundDamageTo10ThisTurn=false;
    if(current.protectedPackNextOpponentTurn){current.protectedPackThisTurn=current.protectedPackNextOpponentTurn;current.protectedPackNextOpponentTurn=null;}
    if(current.reflectDamageNextOpponentTurn){current.reflectDamageThisTurn=true;current.reflectDamageNextOpponentTurn=false;}
    this.state.turn=1-index;
    const next=this.state.players[this.state.turn];
    next.previousOpponentAttackDamage=next.currentOpponentAttackDamage||0;next.currentOpponentAttackDamage=0;
    next.protectedPackThisTurn=null;next.reflectDamageThisTurn=false;next.traitUsedThisTurn=false;next.traitAfterSkillAvailable=false;next.skillBlockedThisTurn=next.nextSkillBlocked;next.nextSkillBlocked=false;next.actionBlockedThisTurn=next.nextActionBlocked;next.nextActionBlocked=false;next.damageReductionRulesThisTurn=next.damageReductionRulesNextTurn||[];next.damageReductionRulesNextTurn=[];next.skillDamageMultiplierThisTurn=next.skillDamageMultiplierNextTurn||1;next.skillDamageMultiplierNextTurn=1;next.skillDamageBonusThisTurn=next.skillDamageBonusNextTurn||0;next.skillDamageBonusNextTurn=0;next.skillCostIncreaseThisTurn=next.skillCostIncreaseNextTurn||0;next.skillCostIncreaseNextTurn=0;next.actionCostIncreaseThisTurn=next.actionCostIncreaseNextTurn||0;next.actionCostIncreaseNextTurn=0;next.skipTokenGainThisTurn=next.skipTokenGainNextTurn;next.skipTokenGainNextTurn=false;next.extraTokensThisTurn=next.nextTurnExtraTokens||0;next.nextTurnExtraTokens=0;
    this.state.actionAvailable=false;
    if(next.replacementRequired){this.state.phase="choose-replacement";}
    else{this.state.phase="playing";this.state.actionAvailable=!next.actionBlockedThisTurn;if(next.actionBlockedThisTurn)this.emit(`${next.name}은(는) 이번 턴 행동할 수 없습니다.`);this.applyAutoTraits(this.state.turn);}
    this.emit(`${current.name}의 턴 종료${gained?`: ${settings.tokenLabels[color]} 토큰 +1${extra?` · 추가 토큰 +${extra}`:""}`:""}`);
    if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("politimon:turn",{detail:{turn:this.state.turn}}));
    return true;
  }
  completeForcedReplacement(index,id){const p=this.state.players[index];if(this.state.turn!==index||!p.replacementRequired||!p.forcedReplacement)return false;this.chooseActive(index,id,{replacement:true});this.state.phase="forced-end";this.state.actionAvailable=false;return true;}
  isPlayersAction(i){return this.state.phase==="playing"&&this.state.turn===i&&this.state.actionAvailable&&this.state.winner==null&&!this.state.players[i]?.active?.faceDown;}
  end(winner){if(this.state.winner!=null)return;this.state.winner=winner;this.state.phase="finished";this.state.actionAvailable=false;this.emit(`${this.state.players[winner].name}의 승리!`);}
}

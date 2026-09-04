const KEY = "politimon-profile-v1";
// 초기화 후에도 즉시 덱을 완성할 수 있도록, 고정된 빨강 컨셉 기본 덱을 지급합니다.
const STARTER_DECK = ["character_04","character_18","character_20","character_22","character_53","character_58","character_59","strategy_04","strategy_05","strategy_18"];
const STARTER_COLLECTION = Object.fromEntries(STARTER_DECK.map(id=>[id,1]));
const MAX_DECKS = 3;
const defaultDeckSlot = (index=0,cards=[]) => ({ id:`deck-${index+1}`, name:`덱 ${index+1}`, cards:[...cards] });
const defaultProfile = () => ({
  collection: { ...STARTER_COLLECTION },
  deck: [...STARTER_DECK],
  decks: [defaultDeckSlot(0,STARTER_DECK)],
  activeDeckId: "deck-1",
  currency: 250,
  achievements: {},
  claimedPvpMatches: {},
  records: { wins:0, losses:0, plays:0, aiPlays:0, aiWins:0, pvpPlays:0, pvpWins:0, packsOpened:0, cardsPulled:0, tutorial:0 }
});
function normalizeProfile(profile) {
  const base = defaultProfile(), source=profile&&typeof profile==="object"?profile:{}, records = { ...base.records, ...(source.records||{}) };
  const legacyDeck=Array.isArray(source.deck)?source.deck:base.deck;
  const sourceDecks=Array.isArray(source.decks)?source.decks:[];
  const decks=(sourceDecks.length?sourceDecks:[defaultDeckSlot(0,legacyDeck)]).slice(0,MAX_DECKS).map((slot,index)=>({
    id:String(slot?.id||`deck-${index+1}`).slice(0,40),
    name:String(slot?.name||`덱 ${index+1}`).trim().slice(0,20)||`덱 ${index+1}`,
    cards:Array.isArray(slot?.cards)?slot.cards:[]
  }));
  const activeDeckId=decks.some(slot=>slot.id===source.activeDeckId)?source.activeDeckId:decks[0].id;
  const activeDeck=decks.find(slot=>slot.id===activeDeckId);
  if(Array.isArray(source.deck))activeDeck.cards=[...source.deck];
  return { ...base, ...source, collection: source.collection&&typeof source.collection==="object"&&!Array.isArray(source.collection)?source.collection:base.collection, deck:[...activeDeck.cards], decks, activeDeckId, achievements:source.achievements&&typeof source.achievements==="object"&&!Array.isArray(source.achievements)?source.achievements:{}, claimedPvpMatches:source.claimedPvpMatches&&typeof source.claimedPvpMatches==="object"&&!Array.isArray(source.claimedPvpMatches)?source.claimedPvpMatches:{}, records };
}
const profileStorageKey=userId=>userId?`${KEY}:user:${userId}`:KEY;
function loadProfile(userId=null) { try { return normalizeProfile(JSON.parse(localStorage.getItem(profileStorageKey(userId)))||defaultProfile()); } catch { return defaultProfile(); } }
function saveProfile(profile,userId=null) { localStorage.setItem(profileStorageKey(userId), JSON.stringify(normalizeProfile(profile))); }
function resetProfile(userId=null) { const profile = defaultProfile(); saveProfile(profile,userId); return profile; }

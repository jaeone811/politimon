const KEY = "politimon-profile-v1";
// 초기화 후에도 즉시 덱을 완성할 수 있도록, 고정된 빨강 컨셉 기본 덱을 지급합니다.
const STARTER_DECK = ["character_04","character_18","character_20","character_22","character_53","character_58","character_59","strategy_04","strategy_05","strategy_18"];
const STARTER_COLLECTION = Object.fromEntries(STARTER_DECK.map(id=>[id,1]));
const defaultProfile = () => ({
  collection: { ...STARTER_COLLECTION },
  deck: [...STARTER_DECK],
  currency: 250,
  achievements: {},
  claimedPvpMatches: {},
  records: { wins:0, losses:0, plays:0, aiPlays:0, aiWins:0, pvpPlays:0, pvpWins:0, packsOpened:0, cardsPulled:0, tutorial:0 }
});
function normalizeProfile(profile) {
  const base = defaultProfile(), source=profile&&typeof profile==="object"?profile:{}, records = { ...base.records, ...(source.records||{}) };
  return { ...base, ...source, collection: source.collection&&typeof source.collection==="object"&&!Array.isArray(source.collection)?source.collection:base.collection, deck:Array.isArray(source.deck)?source.deck:base.deck, achievements:source.achievements&&typeof source.achievements==="object"&&!Array.isArray(source.achievements)?source.achievements:{}, claimedPvpMatches:source.claimedPvpMatches&&typeof source.claimedPvpMatches==="object"&&!Array.isArray(source.claimedPvpMatches)?source.claimedPvpMatches:{}, records };
}
const profileStorageKey=userId=>userId?`${KEY}:user:${userId}`:KEY;
function loadProfile(userId=null) { try { return normalizeProfile(JSON.parse(localStorage.getItem(profileStorageKey(userId)))||defaultProfile()); } catch { return defaultProfile(); } }
function saveProfile(profile,userId=null) { localStorage.setItem(profileStorageKey(userId), JSON.stringify(normalizeProfile(profile))); }
function resetProfile(userId=null) { const profile = defaultProfile(); saveProfile(profile,userId); return profile; }

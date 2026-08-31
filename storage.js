const KEY = "politimon-profile-v1";
// 초기화 후에도 즉시 덱을 완성할 수 있도록, 고정된 빨강 컨셉 기본 덱을 지급합니다.
const STARTER_DECK = ["character_04","character_18","character_20","character_22","character_53","character_58","character_59","strategy_04","strategy_05","strategy_18"];
const STARTER_COLLECTION = Object.fromEntries(STARTER_DECK.map(id=>[id,1]));
const defaultProfile = () => ({
  collection: { ...STARTER_COLLECTION },
  deck: [...STARTER_DECK],
  currency: 500,
  achievements: {},
  records: { wins:0, losses:0, plays:0, aiPlays:0, aiWins:0, pvpPlays:0, pvpWins:0, packsOpened:0, cardsPulled:0, tutorial:0 }
});
function normalizeProfile(profile) {
  const base = defaultProfile(), records = { ...base.records, ...(profile.records||{}) };
  return { ...base, ...profile, collection: profile.collection||base.collection, deck: profile.deck||base.deck, achievements: profile.achievements||{}, records };
}
function loadProfile() { try { return normalizeProfile(JSON.parse(localStorage.getItem(KEY))||defaultProfile()); } catch { return defaultProfile(); } }
function saveProfile(profile) { localStorage.setItem(KEY, JSON.stringify(profile)); }
function resetProfile() { const profile = defaultProfile(); saveProfile(profile); return profile; }

const db = require('./db');
const { pickRandomZodiac, zodiacSkinId } = require('./zodiac');

const INITIAL_COINS = 50000;
const DELETED_TX_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 保留刪除記號約 180 天

function isPersistablePhotoData(pd) {
  return typeof pd === 'string' && (pd.startsWith('data:') || pd.startsWith('http://') || pd.startsWith('https://'));
}

function txTimeMs(t) {
  if (!t) return 0;
  if (t.ts) {
    const ms = Date.parse(t.ts);
    if (!Number.isNaN(ms)) return ms;
  }
  if (typeof t.id === 'number' && Number.isFinite(t.id)) return t.id;
  const n = parseInt(t.id, 10);
  return Number.isFinite(n) ? n : 0;
}

function mergeDeletedTxIds(a, b) {
  const out = {};
  for (const src of [a, b]) {
    if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
    for (const [id, at] of Object.entries(src)) {
      const t = +at || 0;
      if (!id || t <= 0) continue;
      if (!out[id] || t > out[id]) out[id] = t;
    }
  }
  return out;
}

function pruneDeletedTxIds(map, wipedAt = 0) {
  const now = Date.now();
  const out = {};
  for (const [id, at] of Object.entries(map || {})) {
    const t = +at || 0;
    if (!id || t <= 0) continue;
    if (wipedAt > 0 && t < wipedAt) continue; // wipe 前的刪除記號可丟
    if (now - t > DELETED_TX_TTL_MS) continue;
    out[id] = t;
  }
  return out;
}

/** wipe 之後才建立的交易才保留（用 ts／id 時間判斷，避免整包丟棄新記帳） */
function filterTxAfterWipe(txList, wipedAt) {
  if (!Array.isArray(txList)) return [];
  if (!wipedAt) return txList.slice();
  return txList.filter((t) => txTimeMs(t) >= wipedAt);
}

function filterTxNotDeleted(txList, deletedMap) {
  if (!Array.isArray(txList)) return [];
  if (!deletedMap || !Object.keys(deletedMap).length) return txList.slice();
  return txList.filter((t) => t && t.id != null && !deletedMap[String(t.id)]);
}

function mergeTxPhotoRows(existingTx, incomingTx, deletedMap = {}) {
  if (!Array.isArray(incomingTx)) return filterTxNotDeleted(existingTx, deletedMap);
  if (!Array.isArray(existingTx)) return filterTxNotDeleted(incomingTx, deletedMap);
  const prevById = new Map(existingTx.filter((t) => t && t.id != null).map((t) => [t.id, t]));
  const seen = new Set();
  const out = [];
  for (const t of incomingTx) {
    if (!t || t.id == null) {
      out.push(t);
      continue;
    }
    if (deletedMap[String(t.id)]) continue;
    seen.add(t.id);
    const prev = prevById.get(t.id);
    if (!prev) {
      out.push(t);
      continue;
    }
    const merged = { ...prev, ...t };
    if (isPersistablePhotoData(t.photoData)) merged.photoData = t.photoData;
    else if (isPersistablePhotoData(prev.photoData)) merged.photoData = prev.photoData;
    else {
      delete merged.photoData;
      if (prev.photo?.remoteUrl) merged.photo = { ...prev.photo };
      else if (t.photo?.remoteUrl) merged.photo = { ...t.photo };
      else {
        delete merged.photo;
        merged.hasPhoto = false;
      }
    }
    if (merged.photoData || merged.photo?.remoteUrl) merged.hasPhoto = true;
    out.push(merged);
  }
  for (const t of existingTx) {
    if (!t || t.id == null || seen.has(t.id)) continue;
    if (deletedMap[String(t.id)]) continue;
    out.push(t);
  }
  return out.sort((a, b) => new Date(b.ts) - new Date(a.ts));
}

function mergeGameState(existing, incoming) {
  if (!incoming || typeof incoming !== 'object') return existing;
  if (!existing || typeof existing !== 'object') return incoming;
  const merged = { ...existing, ...incoming };
  const existingWipe = +(existing._historyWipedAt || 0);
  const incomingWipe = +(incoming._historyWipedAt || 0);
  const wipedAt = Math.max(existingWipe, incomingWipe);
  if (wipedAt > 0) merged._historyWipedAt = wipedAt;

  const deleted = pruneDeletedTxIds(
    mergeDeletedTxIds(existing.deletedTxIds, incoming.deletedTxIds),
    wipedAt
  );
  merged.deletedTxIds = deleted;

  if (Array.isArray(incoming.tx) || Array.isArray(existing.tx)) {
    // 依時間過濾 wipe 前舊帳，再以 tombstone 排除已刪；不再因「未 ack wipe」整包丟棄新交易
    const existingTx = filterTxNotDeleted(filterTxAfterWipe(existing.tx, wipedAt), deleted);
    const incomingTx = filterTxNotDeleted(filterTxAfterWipe(incoming.tx, wipedAt), deleted);
    merged.tx = mergeTxPhotoRows(existingTx, incomingTx, deleted);
  }

  if (incoming._savedAt && (!existing._savedAt || incoming._savedAt >= existing._savedAt)) {
    merged._savedAt = incoming._savedAt;
  } else if (existing._savedAt) {
    merged._savedAt = existing._savedAt;
  }
  return merged;
}

async function loginOrRegister(payload) {
  let user = (await db.findByGoogleId(payload.sub)) || (await db.findByEmail(payload.email));
  const now = new Date().toISOString();
  let isNewUser = false;

  if (!user) {
    isNewUser = true;
    const zodiacType = pickRandomZodiac();
    user = {
      googleId: payload.sub,
      email: payload.email,
      name: payload.name || '',
      picture: payload.picture || '',
      createdAt: now,
      lastLoginAt: now,
      zodiacType,
      spineSkinId: zodiacSkinId(zodiacType),
      spineDecos: [],
      wallet: { coins: INITIAL_COINS, gems: 50 },
      klineHistory: null,
      gameState: null,
    };
  } else {
    user.googleId = payload.sub;
    user.name = payload.name || user.name;
    user.picture = payload.picture || user.picture;
    user.lastLoginAt = now;
  }

  await db.saveUser(user.email, user);
  return { user, isNewUser };
}

async function syncGameState(email, patch) {
  const user = await db.findByEmail(email);
  if (!user) return null;

  if (patch.wallet) user.wallet = patch.wallet;
  if (patch.zodiacType) user.zodiacType = patch.zodiacType;
  if (patch.spineSkinId !== undefined) user.spineSkinId = patch.spineSkinId;
  if (patch.spineDecos) user.spineDecos = patch.spineDecos;
  if (patch.market) user.klineHistory = patch.market;
  if (patch.gameState) {
    user.gameState = mergeGameState(user.gameState, patch.gameState);
  }

  await db.saveUser(email, user);
  return user;
}

function toClientUser(user, isNewUser) {
  return {
    email: user.email,
    name: user.name,
    picture: user.picture,
    googleId: user.googleId,
    isNewUser: !!isNewUser,
    zodiacType: user.zodiacType,
    spineSkinId: user.spineSkinId,
    spineDecos: user.spineDecos || [],
    wallet: user.wallet,
    klineHistory: user.klineHistory,
    gameState: user.gameState,
  };
}

function extractUserPhotoTransactions(user) {
  if (!user?.gameState?.tx || !Array.isArray(user.gameState.tx)) return [];
  return user.gameState.tx.filter((t) => {
    if (!t) return false;
    if (isPersistablePhotoData(t.photoData)) return true;
    if (t.photo?.remoteUrl) return true;
    return false;
  });
}

module.exports = {
  loginOrRegister,
  syncGameState,
  toClientUser,
  extractUserPhotoTransactions,
  INITIAL_COINS,
  // exported for tests / purge helpers
  mergeGameState,
  filterTxAfterWipe,
  mergeDeletedTxIds,
};

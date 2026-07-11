const db = require('./db');
const { pickRandomZodiac, zodiacSkinId } = require('./zodiac');

const INITIAL_COINS = 50000;

function isPersistablePhotoData(pd) {
  return typeof pd === 'string' && (pd.startsWith('data:') || pd.startsWith('http://') || pd.startsWith('https://'));
}

function mergeTxPhotoRows(existingTx, incomingTx) {
  if (!Array.isArray(incomingTx)) return existingTx;
  if (!Array.isArray(existingTx)) return incomingTx;
  const prevById = new Map(existingTx.filter((t) => t && t.id != null).map((t) => [t.id, t]));
  return incomingTx.map((t) => {
    if (!t || t.id == null) return t;
    const prev = prevById.get(t.id);
    if (!prev) return t;
    const merged = { ...prev, ...t };
    delete merged.photo;
    delete merged.photoData;
    merged.hasPhoto = false;
    if (isPersistablePhotoData(prev.photoData)) merged.photoData = prev.photoData;
    else if (prev.photo?.remoteUrl) merged.photo = { ...prev.photo };
    return merged;
  });
}

function mergeGameState(existing, incoming) {
  if (!incoming || typeof incoming !== 'object') return existing;
  if (!existing || typeof existing !== 'object') return incoming;
  const merged = { ...existing, ...incoming };
  if (Array.isArray(incoming.tx)) {
    merged.tx = mergeTxPhotoRows(existing.tx, incoming.tx);
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
};

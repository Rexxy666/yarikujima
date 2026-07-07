const db = require('./db');
const { pickRandomZodiac, zodiacSkinId } = require('./zodiac');

const INITIAL_COINS = 50000;

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
  if (patch.gameState) user.gameState = patch.gameState;

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

module.exports = { loginOrRegister, syncGameState, toClientUser, INITIAL_COINS };

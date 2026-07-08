function txHasPhoto(t) {
  if (!t || typeof t !== 'object') return false;
  if (t.hasPhoto === true) return true;
  if (t.photo != null && t.photo !== '') return true;
  if (typeof t.photoData === 'string' && t.photoData.length > 0) return true;
  if (t.photoData && typeof t.photoData === 'object') return true;
  return false;
}

function stripTxPhotosAggressive(gameState) {
  if (!gameState || typeof gameState !== 'object') return { gameState, txCount: 0 };
  if (!Array.isArray(gameState.tx)) return { gameState, txCount: 0 };

  let txCount = 0;
  const tx = gameState.tx.map((t) => {
    if (!t || typeof t !== 'object') return t;
    if (!txHasPhoto(t)) return t;
    txCount += 1;
    const next = { ...t };
    delete next.photo;
    delete next.photoData;
    next.hasPhoto = false;
    return next;
  });

  if (txCount === 0) return { gameState, txCount: 0 };
  return { gameState: { ...gameState, tx, _savedAt: Date.now() }, txCount };
}

function stripTxPhotos(gameState) {
  return stripTxPhotosAggressive(gameState);
}

async function purgeAllTransactionPhotos(db, { dryRun = false, aggressive = true } = {}) {
  const stripFn = aggressive ? stripTxPhotosAggressive : stripTxPhotos;
  const users = await db.listAllUsers();
  let userCount = 0;
  let txCount = 0;
  const details = [];

  for (const user of users) {
    const { gameState, txCount: n } = stripFn(user.gameState);
    if (n === 0) continue;
    userCount += 1;
    txCount += n;
    details.push({ email: user.email, txCount: n });
    if (!dryRun) {
      user.gameState = gameState;
      await db.saveUser(user.email, user);
    }
  }

  return { userCount, txCount, totalUsers: users.length, details };
}

module.exports = { txHasPhoto, stripTxPhotos, stripTxPhotosAggressive, purgeAllTransactionPhotos };

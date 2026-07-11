/**
 * 清空所有使用者雲端存檔中的記帳歷史與相簿（game_state.tx）。
 * 保留錢包、生肖、onboarded 等養成進度，只洗掉交易／照片。
 * 寫入 _historyWipedAt，避免客戶端舊本機存檔再次 sync 回來。
 */
function clearGameStateHistory(gameState) {
  const wipedAt = Date.now();
  if (!gameState || typeof gameState !== 'object') {
    return {
      gameState: { tx: [], _historyWipedAt: wipedAt, _savedAt: wipedAt },
      txCount: 0,
      photoCount: 0,
    };
  }

  const prevTx = Array.isArray(gameState.tx) ? gameState.tx : [];
  let photoCount = 0;
  for (const t of prevTx) {
    if (!t || typeof t !== 'object') continue;
    if (
      t.hasPhoto === true ||
      (t.photo != null && t.photo !== '') ||
      (typeof t.photoData === 'string' && t.photoData.length > 0) ||
      (t.photoData && typeof t.photoData === 'object')
    ) {
      photoCount += 1;
    }
  }

  return {
    gameState: {
      ...gameState,
      tx: [],
      _historyWipedAt: wipedAt,
      _savedAt: wipedAt,
    },
    txCount: prevTx.length,
    photoCount,
  };
}

async function purgeAllUserHistory(db, { dryRun = false } = {}) {
  const users = await db.listAllUsers();
  let userCount = 0;
  let txCount = 0;
  let photoCount = 0;
  const details = [];

  for (const user of users) {
    const result = clearGameStateHistory(user.gameState);
    userCount += 1;
    txCount += result.txCount;
    photoCount += result.photoCount;
    details.push({
      email: user.email,
      txCount: result.txCount,
      photoCount: result.photoCount,
    });

    if (!dryRun) {
      user.gameState = result.gameState;
      await db.saveUser(user.email, user);
    }
  }

  return {
    userCount,
    txCount,
    photoCount,
    totalUsers: users.length,
    details,
  };
}

module.exports = { clearGameStateHistory, purgeAllUserHistory };

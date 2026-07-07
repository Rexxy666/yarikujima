#!/usr/bin/env node
/**
 * 清除所有 Google 帳號雲端存檔中，記帳交易（game_state.tx）的照片欄位。
 *
 * 本專案不使用 Prisma；照片存在 PostgreSQL users.game_state JSONB 內：
 *   tx[].photo、tx[].photoData（base64 或 URL）
 *
 * 用法：
 *   DATABASE_URL=postgres://... node scripts/reset-all-transaction-photos.js
 *   node scripts/reset-all-transaction-photos.js --dry-run
 *
 * 本機 JSON 模式（未設定 DATABASE_URL）會改寫 data/users.json。
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const fs = require('fs');
const { Pool } = require('pg');

const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');
const dryRun = process.argv.includes('--dry-run');

function txHasPhoto(t) {
  if (!t || typeof t !== 'object') return false;
  if (t.photo != null && t.photo !== '') return true;
  if (typeof t.photoData === 'string' && t.photoData.length > 0) return true;
  if (t.photoData && typeof t.photoData === 'object') return true;
  return false;
}

function stripTxPhotos(gameState) {
  if (!gameState || typeof gameState !== 'object') return { gameState, txCount: 0 };
  if (!Array.isArray(gameState.tx)) return { gameState, txCount: 0 };

  let txCount = 0;
  const tx = gameState.tx.map((t) => {
    if (!txHasPhoto(t)) return t;
    txCount += 1;
    const next = { ...t };
    delete next.photo;
    delete next.photoData;
    return next;
  });

  if (txCount === 0) return { gameState, txCount: 0 };
  return { gameState: { ...gameState, tx, _savedAt: Date.now() }, txCount };
}

function shouldUseSsl(url) {
  if (!url) return false;
  if (/localhost|127\.0\.0\.1/.test(url)) return false;
  return true;
}

async function resetPostgres() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: shouldUseSsl(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : false,
  });

  try {
    const { rows } = await pool.query(
      'SELECT email, game_state FROM users WHERE game_state IS NOT NULL'
    );

    let userCount = 0;
    let txCount = 0;

    for (const row of rows) {
      const { gameState, txCount: n } = stripTxPhotos(row.game_state);
      if (n === 0) continue;
      userCount += 1;
      txCount += n;
      console.log(`  ${dryRun ? '[dry-run] ' : ''}${row.email}: ${n} 筆交易照片`);
      if (!dryRun) {
        await pool.query('UPDATE users SET game_state = $1::jsonb WHERE email = $2', [
          JSON.stringify(gameState),
          row.email,
        ]);
      }
    }

    return { userCount, txCount, totalUsers: rows.length };
  } finally {
    await pool.end();
  }
}

async function resetLocalFile() {
  if (!fs.existsSync(USERS_FILE)) {
    console.error('找不到 data/users.json');
    process.exit(1);
  }

  const all = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  const emails = Object.keys(all);
  let userCount = 0;
  let txCount = 0;

  for (const email of emails) {
    const user = all[email];
    const { gameState, txCount: n } = stripTxPhotos(user?.gameState);
    if (n === 0) continue;
    userCount += 1;
    txCount += n;
    console.log(`  ${dryRun ? '[dry-run] ' : ''}${email}: ${n} 筆交易照片`);
    if (!dryRun) all[email] = { ...user, gameState };
  }

  if (!dryRun && userCount > 0) {
    const tmp = USERS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(all, null, 2), 'utf8');
    fs.renameSync(tmp, USERS_FILE);
  }

  return { userCount, txCount, totalUsers: emails.length };
}

async function main() {
  const usePg = !!(process.env.DATABASE_URL || '').trim();
  console.log(usePg ? '[db] PostgreSQL' : '[db] 本機 data/users.json');
  if (dryRun) console.log('[mode] dry-run（不寫入）');

  const result = usePg ? await resetPostgres() : await resetLocalFile();

  console.log('');
  console.log(
    `=== ${dryRun ? '（試算）' : '成功'}重置所有帳號的記帳照片！` +
      `共 ${result.userCount} 位使用者、${result.txCount} 筆交易` +
      `（掃描 ${result.totalUsers} 位） ===`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

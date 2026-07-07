#!/usr/bin/env node
/**
 * 清除所有 Google 帳號雲端存檔中，記帳交易（game_state.tx）的照片欄位。
 *
 * 用法：
 *   DATABASE_URL=postgres://... npm run reset:photos
 *   npm run reset:photos:dry-run
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require('../lib/db');
const { purgeAllTransactionPhotos } = require('../lib/purge-photos');

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const usePg = !!(process.env.DATABASE_URL || '').trim();
  console.log(usePg ? '[db] PostgreSQL' : '[db] 本機 data/users.json');
  if (dryRun) console.log('[mode] dry-run（不寫入）');

  const result = await purgeAllTransactionPhotos(db, { dryRun });
  result.details.forEach(({ email, txCount }) => {
    console.log(`  ${dryRun ? '[dry-run] ' : ''}${email}: ${txCount} 筆交易照片`);
  });

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

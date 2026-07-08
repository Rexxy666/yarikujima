#!/usr/bin/env node
/**
 * 暴力物理清空 PostgreSQL users.game_state.tx 內所有照片欄位。
 * 本專案無 Prisma / 無獨立 Photo 表；照片在 game_state JSONB 的 tx[] 裡。
 *
 * 用法（擇一）：
 *   DATABASE_URL="postgresql://..." node scripts/force-clear-photos.js
 *   node scripts/force-clear-photos.js --via-api   # 用 .env JWT_SECRET 呼叫 Render admin API
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = require('pg');
const db = require('../lib/db');
const { purgeAllTransactionPhotos, stripTxPhotosAggressive } = require('../lib/purge-photos');

const viaApi = process.argv.includes('--via-api');
const dryRun = process.argv.includes('--dry-run');
const PRODUCTION_URL = (process.env.RENDER_APP_URL || 'https://yarikujima.onrender.com').replace(/\/$/, '');

function shouldUseSsl(url) {
  if (!url) return false;
  if (/localhost|127\.0\.0\.1/.test(url)) return false;
  return true;
}

/** 用 SQL 直接在 JSONB 陣列上剝除 photo / photoData / hasPhoto */
async function forceClearViaSql(pool, { dryRun: sim = false } = {}) {
  const countRes = await pool.query(`
    SELECT COUNT(*)::int AS n FROM users
    WHERE game_state IS NOT NULL
      AND game_state ? 'tx'
      AND jsonb_array_length(COALESCE(game_state->'tx', '[]'::jsonb)) > 0
  `);
  const totalUsers = countRes.rows[0].n;

  const scanRes = await pool.query(`
    SELECT email, game_state FROM users WHERE game_state IS NOT NULL
  `);

  let userCount = 0;
  let txCount = 0;
  for (const row of scanRes.rows) {
    const { gameState, txCount: n } = stripTxPhotosAggressive(row.game_state);
    if (n === 0) continue;
    userCount += 1;
    txCount += n;
    console.log(`  ${sim ? '[dry-run] ' : ''}${row.email}: ${n} 筆含照片交易`);
    if (!sim) {
      await pool.query('UPDATE users SET game_state = $1::jsonb WHERE email = $2', [
        JSON.stringify(gameState),
        row.email,
      ]);
    }
  }

  return { userCount, txCount, totalUsers: scanRes.rows.length, scannedWithTx: totalUsers };
}

async function forceClearViaDbModule() {
  return purgeAllTransactionPhotos(db, { dryRun, aggressive: true });
}

async function forceClearViaAdminApi() {
  const secret = (process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || '').trim();
  if (!secret) {
    throw new Error('缺少 JWT_SECRET，無法呼叫 admin API');
  }
  const q = dryRun ? '?dryRun=1&aggressive=1' : '?aggressive=1';
  const res = await fetch(`${PRODUCTION_URL}/api/admin/purge-all-photos${q}`, {
    method: 'POST',
    headers: { 'x-admin-secret': secret },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

async function main() {
  console.log('=== 正在嘗試強制連線雲端資料庫並物理清空照片 ===');
  if (dryRun) console.log('[mode] dry-run（不寫入）\n');

  let result;

  if (viaApi || !(process.env.DATABASE_URL || '').trim()) {
    console.log(`[連線] Render Admin API → ${PRODUCTION_URL}`);
    result = await forceClearViaAdminApi();
    (result.details || []).forEach(({ email, txCount: n }) => {
      console.log(`  ${dryRun ? '[dry-run] ' : ''}${email}: ${n} 筆含照片交易`);
    });
  } else {
    console.log('[連線] PostgreSQL DATABASE_URL 直連');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: shouldUseSsl(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : false,
    });
    try {
      result = await forceClearViaSql(pool, { dryRun });
    } finally {
      await pool.end();
    }
  }

  console.log('');
  console.log(
    `[成功] 已物理清空 game_state.tx 照片欄位：` +
      `${result.txCount} 筆交易、${result.userCount} 位使用者` +
      `（掃描 ${result.totalUsers} 位）`
  );
  console.log('=== 資料庫舊照片清理程序執行完畢 ===');
}

main().catch((err) => {
  console.error('[失敗]', err.message || err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * 清空 Render 上所有帳號的記帳歷史與相簿（game_state.tx = []）。
 *
 *   node scripts/force-clear-history.js --via-api
 *   node scripts/force-clear-history.js --via-api --dry-run
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const dryRun = process.argv.includes('--dry-run');
const PRODUCTION_URL = (process.env.RENDER_APP_URL || 'https://yarikujima.onrender.com').replace(/\/$/, '');

async function main() {
  const secret = (process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || '').trim();
  if (!secret) throw new Error('缺少 JWT_SECRET，無法呼叫 admin API');

  const q = dryRun ? '?dryRun=1' : '';
  console.log(`=== 清空雲端記帳／相簿 → ${PRODUCTION_URL} ===`);
  if (dryRun) console.log('[mode] dry-run\n');

  const res = await fetch(`${PRODUCTION_URL}/api/admin/purge-all-history${q}`, {
    method: 'POST',
    headers: { 'x-admin-secret': secret },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);

  (body.details || []).forEach(({ email, txCount, photoCount }) => {
    console.log(`  ${dryRun ? '[dry-run] ' : ''}${email}: ${txCount} 筆交易（含照片 ${photoCount}）`);
  });
  console.log('');
  console.log(
    `[成功] 已清空 ${body.txCount || 0} 筆交易／${body.photoCount || 0} 張照片，` +
      `影響 ${body.userCount || 0} 位使用者（掃描 ${body.totalUsers || 0}）`
  );
}

main().catch((err) => {
  console.error('[失敗]', err.message || err);
  process.exit(1);
});

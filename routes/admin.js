const express = require('express');
const db = require('../lib/db');
const { purgeAllTransactionPhotos } = require('../lib/purge-photos');
const { purgeAllUserHistory } = require('../lib/purge-history');

const router = express.Router();

function adminSecret() {
  return (process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || '').trim();
}

function requireAdmin(req, res) {
  const secret = adminSecret();
  const provided = (req.headers['x-admin-secret'] || '').trim();
  if (!secret || provided !== secret) {
    res.status(403).json({ error: 'forbidden' });
    return false;
  }
  return true;
}

/** POST /api/admin/purge-all-photos — 需 Header: x-admin-secret: <JWT_SECRET> */
router.post('/purge-all-photos', async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const dryRun = req.query.dryRun === '1' || req.query.dry_run === '1';
    const aggressive = req.query.aggressive !== '0';
    const result = await purgeAllTransactionPhotos(db, { dryRun, aggressive });

    console.log(
      `[admin] purge-all-photos${dryRun ? ' (dry-run)' : ''}: ` +
        `${result.txCount} tx photos across ${result.userCount} users`
    );

    return res.json({ ok: true, dryRun, ...result });
  } catch (err) {
    console.error('[admin] purge-all-photos failed:', err);
    return res.status(500).json({ error: err.message || 'purge failed' });
  }
});

/**
 * POST /api/admin/purge-all-history
 * 清空所有帳號的記帳紀錄與相簿（game_state.tx = []）。
 * Header: x-admin-secret: <JWT_SECRET>
 */
router.post('/purge-all-history', async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const dryRun = req.query.dryRun === '1' || req.query.dry_run === '1';
    const result = await purgeAllUserHistory(db, { dryRun });

    console.log(
      `[admin] purge-all-history${dryRun ? ' (dry-run)' : ''}: ` +
        `${result.txCount} tx / ${result.photoCount} photos across ${result.userCount} users`
    );

    return res.json({ ok: true, dryRun, ...result });
  } catch (err) {
    console.error('[admin] purge-all-history failed:', err);
    return res.status(500).json({ error: err.message || 'purge failed' });
  }
});

module.exports = router;

const express = require('express');
const { bearerFromReq, verifyAppJwt } = require('../lib/auth');
const db = require('../lib/db');
const { extractUserPhotoTransactions } = require('../lib/users');

const router = express.Router();

/**
 * 相片持久化：Base64 存在 PostgreSQL users.game_state.tx[].photoData
 * 讀取時嚴格依 JWT 使用者隔離，訪客或未登入一律拒絕。
 */
router.get('/', async (req, res) => {
  try {
    const token = bearerFromReq(req);
    if (!token) return res.status(401).json({ error: '未登入', photos: [] });

    const decoded = verifyAppJwt(token);
    const user = (await db.findByEmail(decoded.email)) || (await db.findByGoogleId(decoded.sub));
    if (!user) return res.status(404).json({ error: '找不到使用者', photos: [] });

    const photos = extractUserPhotoTransactions(user);
    return res.json({ ok: true, ownerId: user.googleId, photos });
  } catch (err) {
    const code = err.jwtCode || err.name || 'Error';
    console.warn(`[photos/GET] auth failed (${code}):`, err.message);
    return res.status(401).json({ error: '登入已過期', photos: [] });
  }
});

router.post('/presign', (req, res) => {
  try {
    const token = bearerFromReq(req);
    if (!token) return res.status(401).json({ error: '未登入' });

    verifyAppJwt(token);

    const mime = (req.body?.mime || 'image/webp').trim();
    const bytes = Number(req.body?.bytes) || 0;
    const id = (req.body?.id || '').trim();
    if (!id) return res.status(400).json({ error: '缺少 id' });

    const bucket = (process.env.S3_BUCKET || '').trim();
    const region = (process.env.AWS_REGION || 'ap-northeast-1').trim();

    if (!bucket) {
      return res.json({
        configured: false,
        mode: 'database',
        id,
        mime,
        bytes,
        message: '相片以 Base64 存入 PostgreSQL game_state；未使用本地 uploads 目錄。',
      });
    }

    const storageKey = `ledger-photos/${id}`;
    const publicUrl = `https://${bucket}.s3.${region}.amazonaws.com/${storageKey}`;

    return res.json({
      configured: true,
      mode: 'presigned',
      storageKey,
      publicUrl,
      uploadUrl: null,
      message: 'S3_BUCKET 已設定，請接入 AWS SDK 產生 uploadUrl。',
    });
  } catch (err) {
    return res.status(401).json({ error: err.message || '授權失敗' });
  }
});

module.exports = router;

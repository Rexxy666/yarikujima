const express = require('express');
const { bearerFromReq, verifyAppJwt } = require('../lib/auth');

const router = express.Router();

/**
 * 相片持久化：Base64 字串存在 PostgreSQL users.game_state.tx[].photoData
 * 此路由僅供未來 S3 選配；預設不寫入伺服器本地硬碟。
 */
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

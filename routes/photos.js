const express = require('express');
const { bearerFromReq, verifyAppJwt } = require('../lib/auth');

const router = express.Router();

/** 預留 S3 / Cloudinary Presigned URL 端點（尚未設定雲端時回傳 deferred） */
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
        mode: 'deferred',
        id,
        mime,
        bytes,
        message: '雲端物件儲存尚未設定，相片將以本機結構暫存待上傳。',
      });
    }

    const storageKey = `ledger-photos/${id}`;
    const publicUrl = `https://${bucket}.s3.${region}.amazonaws.com/${storageKey}`;

    // TODO: 接入 @aws-sdk/client-s3 getSignedUrl 產生真實 PUT presign
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

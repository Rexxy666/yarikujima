const express = require('express');
const {
  verifyGoogleIdToken,
  signAppJwt,
  verifyAppJwt,
  bearerFromReq,
  getGoogleClientId,
} = require('../lib/auth');
const { loginOrRegister, syncGameState, toClientUser } = require('../lib/users');
const db = require('../lib/db');

const router = express.Router();

router.post('/google', async (req, res) => {
  try {
    const idToken = (req.body?.id_token || req.body?.credential || '').trim();
    if (!idToken) {
      console.warn('[auth/google] 請求缺少 id_token');
      return res.status(400).json({ error: '缺少 id_token' });
    }

    const clientId = getGoogleClientId();
    if (!clientId) {
      console.error('[auth/google] 環境變數 GOOGLE_CLIENT_ID 未載入');
      return res.status(500).json({ error: '後端尚未設定 GOOGLE_CLIENT_ID，請在 .env 填入後重啟伺服器' });
    }

    const payload = await verifyGoogleIdToken(idToken);
    const { user, isNewUser } = await loginOrRegister(payload);
    const token = signAppJwt(user);

    console.log(`[auth/google] 登入成功：${user.email}（${isNewUser ? '新用戶' : '老用戶'}）`);
    return res.json({
      token,
      user: toClientUser(user, isNewUser),
    });
  } catch (err) {
    console.error('[auth/google]', err.message);
    return res.status(401).json({ error: err.message || 'Google 登入驗證失敗' });
  }
});

router.get('/me', async (req, res) => {
  try {
    const token = bearerFromReq(req);
    if (!token) return res.status(401).json({ error: '未登入' });

    const decoded = verifyAppJwt(token);
    const user = (await db.findByEmail(decoded.email)) || (await db.findByGoogleId(decoded.sub));
    if (!user) return res.status(404).json({ error: '找不到使用者' });

    return res.json({ ok: true, user: toClientUser(user, false) });
  } catch (err) {
    const code = err.jwtCode || err.name || 'Error';
    console.warn(`[auth/me] JWT verify failed (${code}):`, err.message);
    return res.status(401).json({ error: '登入已過期，請重新登入' });
  }
});

router.post('/sync', async (req, res) => {
  try {
    const token = bearerFromReq(req);
    if (!token) return res.status(401).json({ error: '未登入' });

    const decoded = verifyAppJwt(token);
    const user = await syncGameState(decoded.email, req.body || {});
    if (!user) return res.status(404).json({ error: '找不到使用者' });

    return res.json({ ok: true, user: toClientUser(user, false) });
  } catch (err) {
    const code = err.jwtCode || err.name || 'Error';
    console.warn(`[auth/sync] JWT verify failed (${code}):`, err.message);
    return res.status(401).json({ error: '登入已過期，請重新登入' });
  }
});

module.exports = router;

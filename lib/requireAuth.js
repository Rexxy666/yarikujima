'use strict';

/**
 * requireAuth — 保護需要登入的 API。
 * 從 Authorization: Bearer <token> 取出 App JWT，驗證後把 email 放到 req.userEmail。
 * 驗證失敗一律回 401，讓前端知道要（重新）登入。
 */
const { verifyAppJwt, bearerFromReq } = require('./auth');

module.exports = function requireAuth(req, res, next) {
  const token = bearerFromReq(req);
  if (!token) return res.status(401).json({ error: '請先登入' });
  let payload;
  try {
    payload = verifyAppJwt(token);
  } catch (err) {
    return res.status(401).json({ error: '登入已失效，請重新登入' });
  }
  if (!payload || !payload.email) {
    return res.status(401).json({ error: '登入資訊不完整' });
  }
  req.userEmail = String(payload.email).trim().toLowerCase();
  next();
};

const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');

function getGoogleClientId() {
  return (process.env.GOOGLE_CLIENT_ID || '').trim();
}

function getOAuthClient() {
  const clientId = getGoogleClientId();
  return clientId ? new OAuth2Client(clientId) : null;
}

function getJwtSecret() {
  const secret = (
    process.env.JWT_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    ''
  ).trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production' || process.env.RENDER === 'true') {
    console.error(
      '[FATAL] 生產環境必須設定 JWT_SECRET（或 NEXTAUTH_SECRET），不可使用預設值或執行期隨機生成。'
    );
    process.exit(1);
  }
  return 'dev-only-change-in-production';
}

function isDefaultJwtSecret() {
  return getJwtSecret() === 'dev-only-change-in-production';
}

function getJwtExpires() {
  return (process.env.JWT_EXPIRES ?? 'none').trim();
}

function isPermanentJwt() {
  const v = getJwtExpires().toLowerCase();
  return !v || v === 'none' || v === 'permanent' || v === '0' || v === 'false' || v === 'never';
}

function jwtSignOptions() {
  return isPermanentJwt() ? {} : { expiresIn: getJwtExpires() };
}

async function verifyGoogleIdToken(idToken) {
  const clientId = getGoogleClientId();
  const client = getOAuthClient();

  if (!clientId) {
    console.error('[auth] GOOGLE_CLIENT_ID 缺失 — process.env.GOOGLE_CLIENT_ID =', process.env.GOOGLE_CLIENT_ID);
    throw new Error('後端尚未設定 GOOGLE_CLIENT_ID，請在 .env 填入後重啟伺服器');
  }

  const ticket = await client.verifyIdToken({
    idToken,
    audience: clientId,
  });
  const payload = ticket.getPayload();
  if (!payload?.email) throw new Error('Google 帳號缺少 Email');
  return payload;
}

function signAppJwt(user) {
  return jwt.sign(
    { sub: user.googleId, email: user.email },
    getJwtSecret(),
    jwtSignOptions()
  );
}

function verifyAppJwt(token) {
  try {
    return jwt.verify(token, getJwtSecret());
  } catch (err) {
    err.jwtCode = err.name;
    throw err;
  }
}

function bearerFromReq(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

module.exports = {
  getGoogleClientId,
  verifyGoogleIdToken,
  signAppJwt,
  verifyAppJwt,
  bearerFromReq,
  isDefaultJwtSecret,
};

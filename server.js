/* 浮島記帳 — Express 後端
   靜態檔 + Gemini 代理 + Google OAuth JWT 登入
   啟動：node server.js → http://localhost:8787 */
const path = require('path');

// ⚠️ 必須在所有會讀取 process.env 的模組之前載入 .env
require('dotenv').config({ path: path.join(__dirname, '.env') });

const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require('express');
const authRouter = require('./routes/auth');
const db = require('./lib/db');
const { isDefaultJwtSecret } = require('./lib/auth');

function envStr(key, fallback = '') {
  return (process.env[key] || fallback).trim();
}

function isProduction() {
  return envStr('NODE_ENV') === 'production' || envStr('RENDER') === 'true';
}

function warnProductionConfig() {
  if (!isProduction()) return;

  if (!envStr('DATABASE_URL')) {
    console.warn(
      '[WARN] 未設定 DATABASE_URL — 將使用容器內暫存 JSON 檔。\n' +
        '       請在 Render 建立 PostgreSQL 並綁定 DATABASE_URL，否則 redeploy 後資料會清空。'
    );
  }

  if (isDefaultJwtSecret()) {
    console.error(
      '[FATAL] JWT_SECRET 仍為開發預設值 — 請在 Render Dashboard 設定固定密鑰（JWT_SECRET 或 NEXTAUTH_SECRET）。'
    );
    process.exit(1);
  }

  if (!envStr('GOOGLE_CLIENT_ID')) {
    console.warn('[WARN] 未設定 GOOGLE_CLIENT_ID — Google 登入將無法使用。');
  }
}

const PORT = envStr('PORT', '8787') || 8787;
const KEY = envStr('GEMINI_API_KEY');
const MODEL = envStr('GEMINI_MODEL', 'gemini-flash-latest');

function getGoogleClientId() {
  return envStr('GOOGLE_CLIENT_ID');
}

warnProductionConfig();

const app = express();
app.use(express.json({ limit: '16mb' }));

// 公開設定（前端 Google 登入按鈕需要 Client ID）
app.get('/api/config', (_req, res) => {
  const googleClientId = getGoogleClientId();
  if (!googleClientId) {
    console.warn('[config] GOOGLE_CLIENT_ID 未設定 — 請確認專案根目錄 .env 存在且已重啟伺服器');
  }
  res.json({
    googleClientId,
    authEnabled: !!googleClientId,
    enableBetaDebug: envStr('ENABLE_BETA_DEBUG', 'true').toLowerCase() !== 'false',
    dbMode: envStr('DATABASE_URL') ? 'postgresql' : 'file',
    jwtConfigured: !!(envStr('JWT_SECRET') || envStr('NEXTAUTH_SECRET')),
  });
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    dbMode: envStr('DATABASE_URL') ? 'postgresql' : 'file',
    jwtConfigured: !!(envStr('JWT_SECRET') || envStr('NEXTAUTH_SECRET')),
  });
});

app.use('/api/auth', authRouter);
app.use('/api/photos', require('./routes/photos'));
app.use('/api/admin', require('./routes/admin'));

// Gemini 代理端點
app.post('/api/chat', (req, res) => {
  if (!KEY) {
    return res.status(500).json({
      error: { message: '後端尚未設定 GEMINI_API_KEY，請在 .env 填入金鑰後重啟伺服器。' },
    });
  }
  const gbody = JSON.stringify(req.body || {});
  const opts = {
    hostname: 'generativelanguage.googleapis.com',
    path: `/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(KEY)}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(gbody),
    },
  };
  const gr = https.request(opts, (gres) => {
    let out = '';
    gres.on('data', (c) => (out += c));
    gres.on('end', () => {
      res.status(gres.statusCode).type('application/json').send(out);
    });
  });
  gr.on('error', (e) => {
    res.status(502).json({ error: { message: e.message } });
  });
  gr.write(gbody);
  gr.end();
});

// 靜態檔
app.use(express.static(__dirname, { index: 'index.html' }));

app.use((req, res) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    return res.sendFile(path.join(__dirname, 'index.html'));
  }
  res.status(404).json({ error: 'Not found' });
});

http.createServer(app).listen(PORT, async () => {
  const googleClientId = getGoogleClientId();
  const jwtSecret = envStr('JWT_SECRET');
  const dbMode = envStr('DATABASE_URL') ? 'PostgreSQL' : 'local JSON file';
  try {
    await db.logDbReady();
  } catch (err) {
    console.error('[db] 無法初始化使用者資料庫:', err.message);
    if (envStr('DATABASE_URL')) process.exit(1);
    console.warn('[db] 已略過 PostgreSQL，改以本機 JSON 模式啟動。');
  }
  console.log(`\n🏝️  浮島記帳已啟動 → http://localhost:${PORT}`);
  console.log(`📁  .env 路徑：${path.join(__dirname, '.env')}`);
  console.log(`💾  資料庫模式：${dbMode}`);
  console.log(
    KEY
      ? `🔮  Gemini 聊天已就緒（模型：${MODEL}）`
      : '⚠️  尚未設定 GEMINI_API_KEY，聊天會退回內建台詞。'
  );
  console.log(
    googleClientId
      ? `🔐  Google 登入已就緒（Client ID 前綴：${googleClientId.slice(0, 12)}…）`
      : '⚠️  尚未設定 GOOGLE_CLIENT_ID，登入功能無法使用。'
  );
  console.log(
    jwtSecret
      ? '🔑  JWT_SECRET 已載入'
      : '⚠️  尚未設定 JWT_SECRET，將使用開發用預設值。'
  );
  if (isDefaultJwtSecret()) {
    console.warn('⚠️  JWT_SECRET 使用預設值 — 每次重新部署若未設定環境變數，所有登入 token 會失效');
  }
});

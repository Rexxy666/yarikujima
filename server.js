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
const { normalizeDatabaseEnv, hasDatabaseConfig, describeDatabaseConfig } = require('./lib/database-url');

// 資料庫連線字串正規化（必須在 require('./lib/db') 之前）
normalizeDatabaseEnv();

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
// 預設 gemini-3.5-flash；尖峰 503 時自動降級至 GEMINI_MODEL_FALLBACKS
const MODEL = envStr('GEMINI_MODEL', 'gemini-3.5-flash');
const GEMINI_MODEL_FALLBACKS = envStr('GEMINI_MODEL_FALLBACKS', 'gemini-2.5-flash,gemini-2.5-flash-lite');
const GEMINI_RETRY_DELAYS_MS = [1000, 2000, 4000];
const GEMINI_MAX_RETRIES = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function geminiModelChain() {
  const primary = MODEL || 'gemini-3.5-flash';
  let fallbacks = [];
  try {
    fallbacks = GEMINI_MODEL_FALLBACKS.split(',').map((s) => s.trim()).filter(Boolean);
  } catch (err) {
    console.warn('[chat] GEMINI_MODEL_FALLBACKS 解析失敗，改用預設降級鏈:', err.message);
    fallbacks = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
  }
  return [...new Set([primary, ...fallbacks])];
}

function sanitizeGeminiBody(body, model) {
  const out = body && typeof body === 'object' ? JSON.parse(JSON.stringify(body)) : {};
  const gc = out.generationConfig && typeof out.generationConfig === 'object' ? out.generationConfig : {};
  delete gc.thinkingConfig;
  if (/gemini-3(?:\.|-)/.test(model)) {
    gc.thinkingConfig = { thinkingLevel: 'minimal' };
  } else {
    gc.thinkingConfig = { thinkingBudget: 0 };
  }
  out.generationConfig = gc;
  return out;
}

function geminiGenerateContent(body, model) {
  return new Promise((resolve, reject) => {
    const payload = sanitizeGeminiBody(body, model);
    const gbody = JSON.stringify(payload);
    const opts = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${model}:generateContent?key=${encodeURIComponent(KEY)}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(gbody),
      },
    };
    const gr = https.request(opts, (gres) => {
      let out = '';
      gres.on('data', (c) => (out += c));
      gres.on('end', () => resolve({ statusCode: gres.statusCode, body: out, model }));
    });
    gr.on('error', reject);
    gr.write(gbody);
    gr.end();
  });
}

function parseGeminiErrorPayload(raw) {
  try {
    const data = JSON.parse(raw);
    return data?.error || null;
  } catch {
    return null;
  }
}

function isRetryableGeminiFailure(statusCode, errorObj) {
  if (statusCode === 429 || statusCode === 503 || statusCode === 500) return true;
  if (!errorObj) return false;
  if (errorObj.code === 429 || errorObj.code === 503) return true;
  if (errorObj.status === 'UNAVAILABLE' || errorObj.status === 'RESOURCE_EXHAUSTED') return true;
  const msg = String(errorObj.message || '').toLowerCase();
  return msg.includes('high demand') || msg.includes('overloaded') || msg.includes('try again');
}

function shouldTryNextGeminiModel(statusCode, errorObj) {
  if (isRetryableGeminiFailure(statusCode, errorObj)) return true;
  if (statusCode === 404 || errorObj?.code === 404) return true;
  const msg = String(errorObj?.message || '').toLowerCase();
  return msg.includes('no longer available') || msg.includes('not found');
}

function isCapacityExhausted(statusCode, errorObj) {
  if (statusCode === 503 || errorObj?.code === 503) return true;
  if (errorObj?.status === 'UNAVAILABLE') return true;
  const msg = String(errorObj?.message || '').toLowerCase();
  return msg.includes('high demand') || msg.includes('overloaded');
}

async function geminiGenerateWithRetry(body) {
  const models = geminiModelChain();
  let last = null;
  for (let mi = 0; mi < models.length; mi++) {
    const model = models[mi];
    const maxRetries = mi === 0 ? GEMINI_MAX_RETRIES : 1;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = GEMINI_RETRY_DELAYS_MS[attempt - 1] || 4000;
        console.warn(`[chat] Gemini retry ${attempt}/${maxRetries} in ${delay}ms (model=${model})`);
        await sleep(delay);
      }
      const result = await geminiGenerateContent(body, model);
      const err = parseGeminiErrorPayload(result.body);
      if (!shouldTryNextGeminiModel(result.statusCode, err)) {
        if (result.statusCode >= 200 && result.statusCode < 300 && mi > 0) {
          console.warn(`[chat] primary model busy; served via fallback ${model}`);
        }
        return result;
      }
      last = result;
      console.warn(`[chat] Gemini error on ${model} (${result.statusCode}): ${err?.message || 'unknown'}`);
      if (isCapacityExhausted(result.statusCode, err) && mi < models.length - 1) {
        console.warn(`[chat] ${model} capacity exhausted, trying fallback immediately`);
        break;
      }
      if (attempt >= maxRetries) break;
    }
    if (mi < models.length - 1) {
      console.warn(`[chat] switching model ${model} -> ${models[mi + 1]}`);
    }
  }
  return last;
}

function getGoogleClientId() {
  return envStr('GOOGLE_CLIENT_ID');
}

warnProductionConfig();

const app = express();

// 本機以靜態伺服器（Live Server / http-server）開啟時，前端與 Node API 不同埠，需允許跨域
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-secret');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

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
    dbMode: hasDatabaseConfig() ? 'postgresql' : 'file',
    jwtConfigured: !!(envStr('JWT_SECRET') || envStr('NEXTAUTH_SECRET')),
  });
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    dbMode: hasDatabaseConfig() ? 'postgresql' : 'file',
    jwtConfigured: !!(envStr('JWT_SECRET') || envStr('NEXTAUTH_SECRET')),
  });
});

app.use('/api/auth', authRouter);
app.use('/api/photos', require('./routes/photos'));
app.use('/api/admin', require('./routes/admin'));

// Gemini 代理端點（含指數退避重試）
app.post('/api/chat', async (req, res) => {
  if (!KEY) {
    return res.status(500).json({
      error: { message: '後端尚未設定 GEMINI_API_KEY，請在 .env 填入金鑰後重啟伺服器。' },
    });
  }
  try {
    const result = await geminiGenerateWithRetry(req.body || {});
    res.status(result.statusCode).type('application/json').send(result.body);
  } catch (e) {
    console.error('[chat] Gemini request failed:', e.message);
    res.status(502).json({ error: { message: e.message || 'Gemini 連線失敗' } });
  }
});

// 靜態檔
app.use(express.static(__dirname, { index: 'index.html' }));

app.use((req, res) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    return res.sendFile(path.join(__dirname, 'index.html'));
  }
  if (req.path.startsWith('/api/')) {
    return res.status(405).set('Allow', 'GET, POST, OPTIONS').json({
      error: { message: `此 API 不支援 ${req.method}，請確認已用 node server.js 啟動後端` },
    });
  }
  res.status(404).json({ error: 'Not found' });
});

http.createServer(app).listen(PORT, async () => {
  const googleClientId = getGoogleClientId();
  const jwtSecret = envStr('JWT_SECRET');
  const dbMode = hasDatabaseConfig() ? 'PostgreSQL' : 'local JSON file';
  const dbInfo = describeDatabaseConfig();
  if (dbInfo.configured) {
    console.log(
      `[db] 連線候選：${dbInfo.candidates.map((c) => `${c.label}→${c.host}`).join(' | ')}`
    );
  }
  try {
    await db.logDbReady();
  } catch (err) {
    console.error('[db] 無法初始化使用者資料庫:', err.message);
    if (err.dbHint) console.error(`[db] ${err.dbHint}`);
    if (hasDatabaseConfig()) process.exit(1);
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

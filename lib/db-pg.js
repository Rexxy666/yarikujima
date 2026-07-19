const { Pool } = require('pg');
const {
  buildConnectionCandidates,
  shouldUseSsl,
  parseDbHost,
} = require('./database-url');

let pool = null;
let activeLabel = '';

function createPool(url) {
  return new Pool({
    connectionString: url,
    ssl: shouldUseSsl(url) ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000,
  });
}

async function connectPool() {
  const candidates = buildConnectionCandidates();
  if (!candidates.length) {
    throw new Error('未設定 DATABASE_URL');
  }

  let lastErr = null;
  for (const { label, url } of candidates) {
    const host = parseDbHost(url);
    const candidatePool = createPool(url);
    try {
      await candidatePool.query('SELECT 1');
      if (pool && pool !== candidatePool) {
        await pool.end().catch(() => {});
      }
      pool = candidatePool;
      activeLabel = label;
      console.log(`[db] PostgreSQL connected (${label}, host=${host})`);
      return pool;
    } catch (err) {
      lastErr = err;
      console.warn(`[db] ${label} failed (host=${host}): ${err.message}`);
      await candidatePool.end().catch(() => {});
    }
  }

  const hint =
    '請至 Render Dashboard 確認 Web Service 仍已連結 PostgreSQL，並檢查 DATABASE_URL 是否完整' +
    '（hostname 應為 dpg-xxx-a.region-postgres.render.com，或內網短名 dpg-xxx-a）。' +
    ' 新增 GEMINI_MODEL 等變數不應影響資料庫；若同時編輯 DATABASE_URL，請重新從資料庫頁複製連線字串。';
  const err = lastErr || new Error('PostgreSQL 連線失敗');
  err.dbHint = hint;
  throw err;
}

function getPool() {
  if (!pool) throw new Error('PostgreSQL 尚未初始化，請先呼叫 logDbReady()');
  return pool;
}

async function ensureSchema() {
  const p = getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS users (
      email TEXT PRIMARY KEY,
      google_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      picture TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      zodiac_type TEXT,
      spine_skin_id TEXT,
      spine_decos JSONB NOT NULL DEFAULT '[]'::jsonb,
      wallet JSONB NOT NULL DEFAULT '{"coins":50000,"gems":50}'::jsonb,
      kline_history JSONB,
      game_state JSONB
    )
  `);
  await p.query(`
    CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS feed_posts (
      id TEXT PRIMARY KEY,
      author_email TEXT NOT NULL,
      author_name TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'user',
      body TEXT NOT NULL,
      like_emails JSONB NOT NULL DEFAULT '[]'::jsonb,
      replies JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await p.query(`
    CREATE INDEX IF NOT EXISTS idx_feed_posts_created ON feed_posts (created_at DESC)
  `);
  await p.query(`
    CREATE INDEX IF NOT EXISTS idx_feed_posts_author ON feed_posts (author_email)
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS split_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      owner_email TEXT,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await p.query(`
    CREATE INDEX IF NOT EXISTS idx_split_groups_owner ON split_groups (owner_email)
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS friends_state (
      id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS pet_ledger_entries (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      item TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      pet_name TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await p.query(`
    CREATE INDEX IF NOT EXISTS idx_pet_ledger_email_created
    ON pet_ledger_entries (email, created_at DESC)
  `);
}

function rowToUser(row) {
  if (!row) return null;
  return {
    googleId: row.google_id,
    email: row.email,
    name: row.name || '',
    picture: row.picture || '',
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    lastLoginAt: row.last_login_at instanceof Date ? row.last_login_at.toISOString() : row.last_login_at,
    zodiacType: row.zodiac_type,
    spineSkinId: row.spine_skin_id,
    spineDecos: row.spine_decos || [],
    wallet: row.wallet || { coins: 50000, gems: 50 },
    klineHistory: row.kline_history,
    gameState: row.game_state,
  };
}

async function findByEmail(email) {
  if (!email) return null;
  const { rows } = await getPool().query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  return rowToUser(rows[0]);
}

async function findByGoogleId(id) {
  if (!id) return null;
  const { rows } = await getPool().query('SELECT * FROM users WHERE google_id = $1', [id]);
  return rowToUser(rows[0]);
}

async function saveUser(email, user) {
  const normalizedEmail = email.toLowerCase();
  await getPool().query(
    `INSERT INTO users (
      email, google_id, name, picture, created_at, last_login_at,
      zodiac_type, spine_skin_id, spine_decos, wallet, kline_history, game_state
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (email) DO UPDATE SET
      google_id = EXCLUDED.google_id,
      name = EXCLUDED.name,
      picture = EXCLUDED.picture,
      last_login_at = EXCLUDED.last_login_at,
      zodiac_type = EXCLUDED.zodiac_type,
      spine_skin_id = EXCLUDED.spine_skin_id,
      spine_decos = EXCLUDED.spine_decos,
      wallet = EXCLUDED.wallet,
      kline_history = EXCLUDED.kline_history,
      game_state = EXCLUDED.game_state`,
    [
      normalizedEmail,
      user.googleId,
      user.name || '',
      user.picture || '',
      user.createdAt || new Date().toISOString(),
      user.lastLoginAt || new Date().toISOString(),
      user.zodiacType || null,
      user.spineSkinId ?? null,
      JSON.stringify(user.spineDecos || []),
      JSON.stringify(user.wallet || { coins: 50000, gems: 50 }),
      user.klineHistory != null ? JSON.stringify(user.klineHistory) : null,
      user.gameState != null ? JSON.stringify(user.gameState) : null,
    ]
  );
  return user;
}

async function listAllUsers() {
  const { rows } = await getPool().query('SELECT * FROM users ORDER BY email');
  return rows.map(rowToUser);
}

function mapFeedRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    authorEmail: row.author_email,
    author: row.author_name,
    kind: row.kind || 'user',
    text: row.body,
    likeEmails: Array.isArray(row.like_emails) ? row.like_emails : [],
    replies: Array.isArray(row.replies) ? row.replies : [],
    ts: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

async function listFeedPostsByAuthors(emails, { limit = 80 } = {}) {
  const authors = (emails || []).map((e) => String(e || '').toLowerCase()).filter(Boolean);
  if (!authors.length) return [];
  const { rows } = await getPool().query(
    `SELECT * FROM feed_posts
     WHERE author_email = ANY($1::text[])
     ORDER BY created_at DESC
     LIMIT $2`,
    [authors, Math.min(200, Math.max(1, limit))]
  );
  return rows.map(mapFeedRow);
}

async function createFeedPost(post) {
  const id = String(post.id || Date.now());
  const email = String(post.authorEmail || '').toLowerCase();
  await getPool().query(
    `INSERT INTO feed_posts (id, author_email, author_name, kind, body, like_emails, replies, created_at)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)
     ON CONFLICT (id) DO NOTHING`,
    [
      id,
      email,
      post.author || '',
      post.kind || 'user',
      post.text || '',
      JSON.stringify(post.likeEmails || []),
      JSON.stringify(post.replies || []),
      post.ts || new Date().toISOString(),
    ]
  );
  const { rows } = await getPool().query('SELECT * FROM feed_posts WHERE id = $1', [id]);
  return mapFeedRow(rows[0]);
}

async function getFeedPost(id) {
  const { rows } = await getPool().query('SELECT * FROM feed_posts WHERE id = $1', [String(id)]);
  return mapFeedRow(rows[0]);
}

async function saveFeedPost(post) {
  await getPool().query(
    `UPDATE feed_posts SET
      author_name = $2,
      kind = $3,
      body = $4,
      like_emails = $5::jsonb,
      replies = $6::jsonb
     WHERE id = $1`,
    [
      String(post.id),
      post.author || '',
      post.kind || 'user',
      post.text || '',
      JSON.stringify(post.likeEmails || []),
      JSON.stringify(post.replies || []),
    ]
  );
  return getFeedPost(post.id);
}

async function deleteFeedPost(id, authorEmail) {
  const { rowCount } = await getPool().query(
    'DELETE FROM feed_posts WHERE id = $1 AND author_email = $2',
    [String(id), String(authorEmail || '').toLowerCase()]
  );
  return rowCount > 0;
}

async function logDbReady() {
  await connectPool();
  await ensureSchema();
  const { rows } = await getPool().query('SELECT COUNT(*)::int AS n FROM users');
  console.log(`[db] PostgreSQL ready (${rows[0].n} users, via ${activeLabel})`);
}

module.exports = {
  findByEmail,
  findByGoogleId,
  saveUser,
  listAllUsers,
  logDbReady,
  getPool,
  listFeedPostsByAuthors,
  createFeedPost,
  getFeedPost,
  saveFeedPost,
  deleteFeedPost,
};

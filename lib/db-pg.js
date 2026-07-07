const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: shouldUseSsl(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : false,
});

function shouldUseSsl(url) {
  if (!url) return false;
  if (/localhost|127\.0\.0\.1/.test(url)) return false;
  return true;
}

async function ensureSchema() {
  await pool.query(`
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
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)
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
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  return rowToUser(rows[0]);
}

async function findByGoogleId(id) {
  if (!id) return null;
  const { rows } = await pool.query('SELECT * FROM users WHERE google_id = $1', [id]);
  return rowToUser(rows[0]);
}

async function saveUser(email, user) {
  const normalizedEmail = email.toLowerCase();
  await pool.query(
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

async function logDbReady() {
  await ensureSchema();
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM users');
  console.log(`[db] PostgreSQL ready (${rows[0].n} users)`);
}

module.exports = { findByEmail, findByGoogleId, saveUser, logDbReady };

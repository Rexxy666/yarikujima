'use strict';

/**
 * friends.store-pg.js — 好友資料寫入 PostgreSQL（單一 JSON 文件列）
 */

const db = require('../db');

const ROW_ID = 'default';
let schemaReady = false;

async function ensureFriendsSchema() {
  if (schemaReady) return;
  const p = db.getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS friends_state (
      id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  schemaReady = true;
}

function empty() {
  return { users: {}, friendships: [] };
}

async function readDb() {
  await ensureFriendsSchema();
  const { rows } = await db.getPool().query(
    'SELECT payload FROM friends_state WHERE id = $1',
    [ROW_ID]
  );
  const data = rows[0]?.payload;
  if (!data || typeof data !== 'object') return empty();
  if (!data.users) data.users = {};
  if (!Array.isArray(data.friendships)) data.friendships = [];
  return data;
}

async function writeDb(data) {
  await ensureFriendsSchema();
  const payload = {
    users: data?.users || {},
    friendships: Array.isArray(data?.friendships) ? data.friendships : [],
  };
  await db.getPool().query(
    `INSERT INTO friends_state (id, payload, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
    [ROW_ID, JSON.stringify(payload)]
  );
  return payload;
}

module.exports = { readDb, writeDb };

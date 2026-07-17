'use strict';

/**
 * splitBill.store-pg.js — PostgreSQL 持久化（Render 正式環境）
 */

const db = require('../db');

let schemaReady = false;

async function ensureSplitSchema() {
  if (schemaReady) return;
  const p = db.getPool();
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
  schemaReady = true;
}

function summaryFromGroup(g) {
  return {
    id: g.id,
    name: g.name,
    memberCount: Array.isArray(g.members) ? g.members.length : 0,
    expenseCount: Array.isArray(g.expenses) ? g.expenses.length : 0,
    createdAt: g.createdAt,
    ownerEmail: g.ownerEmail || null,
    sharedWith: Array.isArray(g.sharedWith) ? g.sharedWith : [],
  };
}

async function listGroups() {
  await ensureSplitSchema();
  const { rows } = await db.getPool().query(
    'SELECT payload FROM split_groups ORDER BY updated_at DESC'
  );
  return rows.map((r) => summaryFromGroup(r.payload || {}));
}

async function getGroup(groupId) {
  await ensureSplitSchema();
  const { rows } = await db.getPool().query(
    'SELECT payload FROM split_groups WHERE id = $1',
    [String(groupId)]
  );
  return rows[0]?.payload || null;
}

async function saveGroup(group) {
  await ensureSplitSchema();
  const id = String(group.id);
  const name = group.name || '';
  const owner = group.ownerEmail || null;
  const createdAt = group.createdAt || new Date().toISOString();
  await db.getPool().query(
    `INSERT INTO split_groups (id, name, owner_email, payload, created_at, updated_at)
     VALUES ($1,$2,$3,$4::jsonb,$5,NOW())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       owner_email = EXCLUDED.owner_email,
       payload = EXCLUDED.payload,
       updated_at = NOW()`,
    [id, name, owner, JSON.stringify(group), createdAt]
  );
  return group;
}

async function deleteGroup(groupId) {
  await ensureSplitSchema();
  await db.getPool().query('DELETE FROM split_groups WHERE id = $1', [String(groupId)]);
}

module.exports = { listGroups, getGroup, saveGroup, deleteGroup, ensureSplitSchema };

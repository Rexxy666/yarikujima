'use strict';

/**
 * petLedger.store-pg.js — 記帳寫入 PostgreSQL
 */

const crypto = require('crypto');
const db = require('../db');

let schemaReady = false;

async function ensurePetLedgerSchema() {
  if (schemaReady) return;
  const p = db.getPool();
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
  schemaReady = true;
}

function rowToEntry(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    item: row.item,
    amount: Number(row.amount),
    petName: row.pet_name || '',
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
  };
}

async function createEntry({ email, item, amount, petName = '' }) {
  await ensurePetLedgerSchema();
  const id = crypto.randomUUID().replace(/-/g, '');
  const { rows } = await db.getPool().query(
    `INSERT INTO pet_ledger_entries (id, email, item, amount, pet_name, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING *`,
    [id, email, item, amount, petName || '']
  );
  return rowToEntry(rows[0]);
}

async function listEntries(email, { limit: lim = 20 } = {}) {
  await ensurePetLedgerSchema();
  const { rows } = await db.getPool().query(
    `SELECT * FROM pet_ledger_entries
     WHERE email = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [email, lim]
  );
  return rows.map(rowToEntry);
}

async function getEntry(email, id) {
  await ensurePetLedgerSchema();
  const { rows } = await db.getPool().query(
    `SELECT * FROM pet_ledger_entries WHERE id = $1 AND email = $2`,
    [id, email]
  );
  return rowToEntry(rows[0]);
}

module.exports = {
  createEntry,
  listEntries,
  getEntry,
  ensurePetLedgerSchema,
};

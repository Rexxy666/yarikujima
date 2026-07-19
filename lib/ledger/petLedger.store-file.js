'use strict';

/**
 * petLedger.store-file.js — 本機無 DATABASE_URL 時的 JSON 後備
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH =
  process.env.PET_LEDGER_DB_PATH ||
  path.join(__dirname, '..', '..', 'data', 'pet-ledger-db.json');

function ensureDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readDb() {
  ensureDir();
  if (!fs.existsSync(DB_PATH)) return { entries: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    return { entries: Array.isArray(raw.entries) ? raw.entries : [] };
  } catch {
    return { entries: [] };
  }
}

function writeDb(data) {
  ensureDir();
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

async function createEntry({ email, item, amount, petName = '' }) {
  const db = readDb();
  const entry = {
    id: crypto.randomUUID().replace(/-/g, ''),
    email,
    item,
    amount: Number(amount),
    petName: petName || '',
    createdAt: new Date().toISOString(),
  };
  db.entries.unshift(entry);
  writeDb(db);
  return entry;
}

async function listEntries(email, { limit: lim = 20 } = {}) {
  const db = readDb();
  return db.entries.filter((e) => e.email === email).slice(0, lim);
}

async function getEntry(email, id) {
  const db = readDb();
  return db.entries.find((e) => e.id === id && e.email === email) || null;
}

module.exports = {
  createEntry,
  listEntries,
  getEntry,
};

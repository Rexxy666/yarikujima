const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '{}', 'utf8');
}

function readAll() {
  ensureDb();
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeAll(obj) {
  ensureDb();
  const tmp = USERS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, USERS_FILE);
}

function findByEmail(email) {
  if (!email) return null;
  const all = readAll();
  return all[email.toLowerCase()] || null;
}

function findByGoogleId(id) {
  if (!id) return null;
  const all = readAll();
  return Object.values(all).find((u) => u.googleId === id) || null;
}

function saveUser(email, user) {
  const all = readAll();
  all[email.toLowerCase()] = user;
  writeAll(all);
  return user;
}

module.exports = { findByEmail, findByGoogleId, saveUser };

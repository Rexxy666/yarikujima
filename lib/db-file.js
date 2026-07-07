const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '{}', 'utf8');
}

async function logDbReady() {
  ensureDb();
  const count = Object.keys(readAll()).length;
  console.log(`[db] local file ready → ${USERS_FILE} (${count} users)`);
  console.warn('[db] 本機 JSON 模式：僅供開發。Render 生產環境請設定 DATABASE_URL 連 PostgreSQL。');
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

async function findByEmail(email) {
  if (!email) return null;
  const all = readAll();
  return all[email.toLowerCase()] || null;
}

async function findByGoogleId(id) {
  if (!id) return null;
  const all = readAll();
  return Object.values(all).find((u) => u.googleId === id) || null;
}

async function saveUser(email, user) {
  const all = readAll();
  all[email.toLowerCase()] = user;
  writeAll(all);
  return user;
}

async function listAllUsers() {
  const all = readAll();
  return Object.keys(all).map((email) => all[email]).filter(Boolean);
}

module.exports = { findByEmail, findByGoogleId, saveUser, listAllUsers, logDbReady };

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

function ensureDb() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '{}', 'utf8');
  } catch (err) {
    console.error('[db] init failed:', DATA_DIR, err.message);
    throw err;
  }
}

function logDbReady() {
  ensureDb();
  const count = Object.keys(readAll()).length;
  console.log(`[db] users file ready → ${USERS_FILE} (${count} users)`);
  console.warn('[db] Render 免費方案磁碟為暫存式：重新部署後 data/users.json 會清空，請備份或改用持久化磁碟');
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
  try {
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
    fs.renameSync(tmp, USERS_FILE);
  } catch (err) {
    console.error('[db] write failed:', USERS_FILE, err.message);
    throw err;
  }
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

module.exports = { findByEmail, findByGoogleId, saveUser, logDbReady };

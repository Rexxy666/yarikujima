const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const FEED_FILE = path.join(DATA_DIR, 'feed-db.json');

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '{}', 'utf8');
  if (!fs.existsSync(FEED_FILE)) fs.writeFileSync(FEED_FILE, JSON.stringify({ posts: [] }, null, 2), 'utf8');
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

function readFeed() {
  ensureDb();
  try {
    const data = JSON.parse(fs.readFileSync(FEED_FILE, 'utf8'));
    if (!Array.isArray(data.posts)) data.posts = [];
    return data;
  } catch {
    return { posts: [] };
  }
}

function writeFeed(data) {
  ensureDb();
  const tmp = FEED_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, FEED_FILE);
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

async function listFeedPostsByAuthors(emails, { limit = 80 } = {}) {
  const authors = new Set((emails || []).map((e) => String(e || '').toLowerCase()).filter(Boolean));
  if (!authors.size) return [];
  return readFeed().posts
    .filter((p) => authors.has(String(p.authorEmail || '').toLowerCase()))
    .sort((a, b) => new Date(b.ts) - new Date(a.ts))
    .slice(0, Math.min(200, Math.max(1, limit)));
}

async function createFeedPost(post) {
  const data = readFeed();
  const row = {
    id: String(post.id || Date.now()),
    authorEmail: String(post.authorEmail || '').toLowerCase(),
    author: post.author || '',
    kind: post.kind || 'user',
    text: post.text || '',
    likeEmails: Array.isArray(post.likeEmails) ? post.likeEmails : [],
    replies: Array.isArray(post.replies) ? post.replies : [],
    ts: post.ts || new Date().toISOString(),
  };
  data.posts.unshift(row);
  writeFeed(data);
  return row;
}

async function getFeedPost(id) {
  return readFeed().posts.find((p) => String(p.id) === String(id)) || null;
}

async function saveFeedPost(post) {
  const data = readFeed();
  const i = data.posts.findIndex((p) => String(p.id) === String(post.id));
  if (i < 0) return null;
  data.posts[i] = {
    ...data.posts[i],
    author: post.author || data.posts[i].author,
    kind: post.kind || data.posts[i].kind,
    text: post.text || '',
    likeEmails: Array.isArray(post.likeEmails) ? post.likeEmails : [],
    replies: Array.isArray(post.replies) ? post.replies : [],
  };
  writeFeed(data);
  return data.posts[i];
}

async function deleteFeedPost(id, authorEmail) {
  const data = readFeed();
  const before = data.posts.length;
  const email = String(authorEmail || '').toLowerCase();
  data.posts = data.posts.filter(
    (p) => !(String(p.id) === String(id) && String(p.authorEmail || '').toLowerCase() === email)
  );
  if (data.posts.length === before) return false;
  writeFeed(data);
  return true;
}

module.exports = {
  findByEmail,
  findByGoogleId,
  saveUser,
  listAllUsers,
  logDbReady,
  listFeedPostsByAuthors,
  createFeedPost,
  getFeedPost,
  saveFeedPost,
  deleteFeedPost,
};

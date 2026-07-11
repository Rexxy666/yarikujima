'use strict';

/**
 * friends.service.js
 * -----------------------------------------------------------
 * 好友系統業務邏輯（純函式，操作傳入的 db 物件）。
 * db 結構：
 * {
 *   users: { [email]: { email, friendCode, displayName, petAnimal, createdAt } },
 *   friendships: [ { id, requester, addressee, status, createdAt, respondedAt } ]
 * }
 * status: 'pending' | 'accepted'
 * -----------------------------------------------------------
 */

const { randomUUID } = require('crypto');

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode || 400;
  }
}

const norm = (e) => String(e || '').trim().toLowerCase();

function _genCode(db) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆字元
  const taken = new Set(Object.values(db.users).map((u) => u.friendCode));
  for (let tries = 0; tries < 50; tries++) {
    let s = '';
    for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    const code = 'PET-' + s;
    if (!taken.has(code)) return code;
  }
  return 'PET-' + randomUUID().slice(0, 6).toUpperCase();
}

/** 取得或建立我的公開檔；可順帶更新暱稱/生肖。 */
function ensureProfile(db, email, opts = {}) {
  email = norm(email);
  if (!email) throw new AppError('缺少使用者身分', 401);
  let u = db.users[email];
  if (!u) {
    u = {
      email,
      friendCode: _genCode(db),
      displayName: opts.displayName || email.split('@')[0],
      petAnimal: opts.petAnimal || null,
      createdAt: new Date().toISOString(),
    };
    db.users[email] = u;
  }
  if (opts.displayName != null && String(opts.displayName).trim()) {
    u.displayName = String(opts.displayName).trim().slice(0, 20);
  }
  if (opts.petAnimal != null) u.petAnimal = opts.petAnimal;
  return u;
}

function publicProfile(u) {
  if (!u) return null;
  return { email: u.email, friendCode: u.friendCode, displayName: u.displayName, petAnimal: u.petAnimal };
}

function findByCode(db, code) {
  const c = String(code || '').trim().toUpperCase();
  return Object.values(db.users).find((u) => u.friendCode.toUpperCase() === c) || null;
}

function _between(db, a, b) {
  a = norm(a); b = norm(b);
  return db.friendships.find(
    (f) =>
      (f.requester === a && f.addressee === b) ||
      (f.requester === b && f.addressee === a)
  );
}

/** 送出好友邀請（用 friendCode 或 email）。若對方已邀我 → 直接成為好友。 */
function sendRequest(db, fromEmail, { friendCode, email }) {
  fromEmail = norm(fromEmail);
  ensureProfile(db, fromEmail);
  let target = null;
  if (friendCode) target = findByCode(db, friendCode);
  else if (email) target = db.users[norm(email)] || null;
  if (!target) throw new AppError('找不到這個好友碼／使用者（對方需先登入過本 App）', 404);
  if (norm(target.email) === fromEmail) throw new AppError('不能加自己為好友', 400);

  const existing = _between(db, fromEmail, target.email);
  if (existing) {
    if (existing.status === 'accepted') throw new AppError('你們已經是好友了', 409);
    // 對方先前已邀請我 → 直接接受
    if (existing.status === 'pending' && existing.addressee === fromEmail) {
      existing.status = 'accepted';
      existing.respondedAt = new Date().toISOString();
      return { friendship: existing, autoAccepted: true };
    }
    throw new AppError('已送出過邀請，等待對方回應中', 409);
  }
  const fr = {
    id: randomUUID(),
    requester: fromEmail,
    addressee: norm(target.email),
    status: 'pending',
    createdAt: new Date().toISOString(),
    respondedAt: null,
  };
  db.friendships.push(fr);
  return { friendship: fr, autoAccepted: false };
}

function incomingRequests(db, email) {
  email = norm(email);
  return db.friendships
    .filter((f) => f.status === 'pending' && f.addressee === email)
    .map((f) => ({ id: f.id, from: publicProfile(db.users[f.requester]), createdAt: f.createdAt }))
    .filter((x) => x.from);
}

function outgoingRequests(db, email) {
  email = norm(email);
  return db.friendships
    .filter((f) => f.status === 'pending' && f.requester === email)
    .map((f) => ({ id: f.id, to: publicProfile(db.users[f.addressee]), createdAt: f.createdAt }))
    .filter((x) => x.to);
}

function respondRequest(db, email, id, accept) {
  email = norm(email);
  const f = db.friendships.find((x) => x.id === id);
  if (!f || f.addressee !== email || f.status !== 'pending') {
    throw new AppError('找不到這筆好友邀請', 404);
  }
  if (accept) {
    f.status = 'accepted';
    f.respondedAt = new Date().toISOString();
  } else {
    db.friendships = db.friendships.filter((x) => x.id !== id);
  }
  return f;
}

function listFriends(db, email) {
  email = norm(email);
  return db.friendships
    .filter((f) => f.status === 'accepted' && (f.requester === email || f.addressee === email))
    .map((f) => {
      const other = f.requester === email ? f.addressee : f.requester;
      return publicProfile(db.users[other]);
    })
    .filter(Boolean);
}

function removeFriend(db, email, otherEmail) {
  email = norm(email);
  otherEmail = norm(otherEmail);
  const before = db.friendships.length;
  db.friendships = db.friendships.filter(
    (f) =>
      !(
        f.status === 'accepted' &&
        ((f.requester === email && f.addressee === otherEmail) ||
          (f.requester === otherEmail && f.addressee === email))
      )
  );
  if (db.friendships.length === before) throw new AppError('你們不是好友', 404);
}

module.exports = {
  AppError,
  ensureProfile,
  publicProfile,
  findByCode,
  sendRequest,
  incomingRequests,
  outgoingRequests,
  respondRequest,
  listFriends,
  removeFriend,
};

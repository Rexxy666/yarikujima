'use strict';

/**
 * friends.store.js
 * -----------------------------------------------------------
 * 最簡持久化：把好友資料存成一個 JSON 檔（跟 split-bill 同樣的做法）。
 * 正式上線建議換成資料庫（見「社群與好友_架構規格.md」的 Postgres schema），
 * 只要維持 readDb / writeDb 介面即可。
 * -----------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');

const DB_PATH =
  process.env.FRIENDS_DB_PATH || path.join(__dirname, '..', '..', 'data', 'friends-db.json');

function _empty() {
  return { users: {}, friendships: [] };
}

function _ensureFile() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify(_empty(), null, 2));
}

async function readDb() {
  _ensureFile();
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    const data = JSON.parse(raw);
    if (!data.users) data.users = {};
    if (!Array.isArray(data.friendships)) data.friendships = [];
    return data;
  } catch {
    return _empty();
  }
}

async function writeDb(data) {
  _ensureFile();
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  return data;
}

module.exports = { readDb, writeDb };

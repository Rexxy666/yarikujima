'use strict';

/**
 * splitBill.store.js
 * -----------------------------------------------------------
 * 最簡單的持久化實作：把所有分帳群組存成一個 JSON 檔案。
 * 目的是讓這個功能「可以馬上跑起來」，不逼你先接資料庫。
 *
 * 正式環境請把這個檔案換成你自己的 DB 實作，只要維持相同的
 * method 介面（getGroup / saveGroup / deleteGroup / listGroups）
 * 上層的 routes.js 完全不需要改。
 * -----------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.SPLIT_BILL_DB_PATH || path.join(__dirname, 'data', 'split-bill-db.json');

function _ensureFile() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({ groups: {} }, null, 2));
}

function _readAll() {
  _ensureFile();
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch {
    return { groups: {} };
  }
}

function _writeAll(data) {
  _ensureFile();
  // 簡單的寫檔（非高併發環境已足夠；高流量情境請換成真正的資料庫）
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

async function listGroups() {
  const data = _readAll();
  return Object.values(data.groups).map(g => ({
    id: g.id,
    name: g.name,
    memberCount: g.members.length,
    expenseCount: g.expenses.length,
    createdAt: g.createdAt,
    ownerEmail: g.ownerEmail || null,
    sharedWith: Array.isArray(g.sharedWith) ? g.sharedWith : [],
  }));
}

async function getGroup(groupId) {
  const data = _readAll();
  return data.groups[groupId] || null;
}

async function saveGroup(group) {
  const data = _readAll();
  data.groups[group.id] = group;
  _writeAll(data);
  return group;
}

async function deleteGroup(groupId) {
  const data = _readAll();
  delete data.groups[groupId];
  _writeAll(data);
}

module.exports = { listGroups, getGroup, saveGroup, deleteGroup };

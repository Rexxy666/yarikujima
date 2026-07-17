'use strict';

/**
 * splitBill.store.js — 依環境選擇持久化後端
 * - 有 DATABASE_URL → PostgreSQL（Render 正式環境）
 * - 否則 → 本機 JSON 檔（開發用）
 */

const { hasDatabaseConfig, normalizeDatabaseEnv } = require('../database-url');

normalizeDatabaseEnv();

module.exports = hasDatabaseConfig()
  ? require('./splitBill.store-pg')
  : require('./splitBill.store-file');

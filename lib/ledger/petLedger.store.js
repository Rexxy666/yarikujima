'use strict';

/**
 * petLedger.store.js — 依環境選擇持久化後端
 * - 有 DATABASE_URL → PostgreSQL
 * - 否則 → 本機 JSON（僅開發）
 */

const { hasDatabaseConfig, normalizeDatabaseEnv } = require('../database-url');

normalizeDatabaseEnv();

module.exports = hasDatabaseConfig()
  ? require('./petLedger.store-pg')
  : require('./petLedger.store-file');

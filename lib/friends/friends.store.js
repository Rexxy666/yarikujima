'use strict';

/**
 * friends.store.js — 依環境選擇持久化後端
 */

const { hasDatabaseConfig, normalizeDatabaseEnv } = require('../database-url');

normalizeDatabaseEnv();

module.exports = hasDatabaseConfig()
  ? require('./friends.store-pg')
  : require('./friends.store-file');

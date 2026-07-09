const { normalizeDatabaseEnv, hasDatabaseConfig } = require('./database-url');

// 必須在選擇後端之前正規化，避免引號或空白導致連線字串損壞
normalizeDatabaseEnv();

const backend = hasDatabaseConfig() ? require('./db-pg') : require('./db-file');

module.exports = backend;

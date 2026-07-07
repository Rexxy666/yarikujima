const DATABASE_URL = (process.env.DATABASE_URL || '').trim();

const backend = DATABASE_URL ? require('./db-pg') : require('./db-file');

module.exports = backend;

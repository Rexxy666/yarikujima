#!/usr/bin/env node
/* 一次性：將本機 data/users.json 匯入 PostgreSQL（需已設定 DATABASE_URL） */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const fs = require('fs');
const db = require('../lib/db');

const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('請先設定 DATABASE_URL');
    process.exit(1);
  }
  if (!fs.existsSync(USERS_FILE)) {
    console.error('找不到 data/users.json');
    process.exit(1);
  }

  const all = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  const emails = Object.keys(all);
  console.log(`匯入 ${emails.length} 位使用者…`);

  for (const email of emails) {
    await db.saveUser(email, all[email]);
    console.log(`  ✓ ${email}`);
  }

  console.log('完成。');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

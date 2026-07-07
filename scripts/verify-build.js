#!/usr/bin/env node
/* 部署前語法檢查（無 bundler，驗證 server 與 index.html script） */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const errors = [];

function checkJs(rel) {
  const file = path.join(root, rel);
  try {
    const code = fs.readFileSync(file, 'utf8');
    new vm.Script(code, { filename: rel });
  } catch (err) {
    errors.push(`${rel}: ${err.message}`);
  }
}

function checkIndexHtml() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const m = html.match(/<script>([\s\S]*)<\/script>/);
  if (!m) {
    errors.push('index.html: 找不到 <script> 區塊');
    return;
  }
  try {
    vm.compileFunction(m[1], [], {});
  } catch (err) {
    errors.push(`index.html script: ${err.message}`);
  }
}

[
  'server.js',
  'lib/auth.js',
  'lib/db.js',
  'lib/db-file.js',
  'lib/db-pg.js',
  'lib/users.js',
  'routes/auth.js',
  'routes/photos.js',
].forEach(checkJs);
checkIndexHtml();

if (errors.length) {
  console.error('Build verification failed:\n' + errors.join('\n'));
  process.exit(1);
}

console.log('Build verification passed.');

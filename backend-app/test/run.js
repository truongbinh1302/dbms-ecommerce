/*
  Chạy test bằng node:test có sẵn trong Node, không cần cài thêm thư viện.
    npm test          → test/unit (không cần DB)
    npm run test:db   → test/integration (cần SQL Server đang chạy, xem README)
  Dùng script này thay cho glob để chạy giống nhau trên Windows, macOS và Linux.
*/
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const suite = process.argv[2] || 'unit';
const dir = path.join(__dirname, suite);
const files = fs.readdirSync(dir)
  .filter((name) => name.endsWith('.test.js'))
  .map((name) => path.join(dir, name));

if (files.length === 0) {
  console.error(`No test files found in ${dir}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status === null ? 1 : result.status);

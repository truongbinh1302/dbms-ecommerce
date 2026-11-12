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

// --test-force-exit: một file dọn dẹp lỗi mà còn mở kết nối DB thì vẫn kết thúc, không treo cả bộ test (từng treo 25 phút trên CI).
// --test-timeout: một test treo (chờ khoá, chờ luồng SSE) sẽ báo lỗi sau 2 phút thay vì chờ mãi.
const result = spawnSync(process.execPath, ['--test', '--test-force-exit', '--test-timeout=120000', ...files], { stdio: 'inherit' });
process.exit(result.status === null ? 1 : result.status);

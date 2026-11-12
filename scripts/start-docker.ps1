# Chạy BinhTinhStore bằng Docker Desktop trên Windows (PowerShell 5 trở lên).
#   powershell -ExecutionPolicy Bypass -File .\scripts\start-docker.ps1
# Lần đầu: tạo .env với mật khẩu/khoá ngẫu nhiên, dựng image, tạo cơ sở dữ liệu, nạp dữ liệu mẫu (10-20 phút).
# Các lần sau: cập nhật cơ sở dữ liệu (migration, dữ liệu mẫu mới nếu có) và khởi động lại, giữ nguyên dữ liệu.
# Không dùng 'Stop': PowerShell 5 coi thông báo tiến trình của docker (ghi ra stderr) là lỗi. Mã thoát được kiểm tra sau mỗi bước.
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path -Parent $PSScriptRoot)

function Step($text) { Write-Host ''; Write-Host "==> $text" -ForegroundColor Cyan }
function Check($what) { if ($LASTEXITCODE -ne 0) { Write-Host "Lỗi khi $what (mã $LASTEXITCODE). Xem thông báo ở trên." -ForegroundColor Red; exit 1 } }
function New-Secret([int]$length) {
  $chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  $bytes = New-Object byte[] $length
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
}

Step 'Kiểm tra Docker Desktop'
docker info *> $null
if ($LASTEXITCODE -ne 0) { Write-Host 'Docker Desktop chưa chạy. Mở Docker Desktop, chờ báo "Engine running" rồi chạy lại.' -ForegroundColor Red; exit 1 }

if (-not (Test-Path .env)) {
  Step 'Tạo file .env với mật khẩu và khoá ngẫu nhiên'
  $values = @{
    'SQL_PASSWORD'       = "Bt$(New-Secret 20)!9"
    'MONGO_PASSWORD'     = New-Secret 24
    'JWT_ACCESS_SECRET'  = New-Secret 64
    'JWT_REFRESH_SECRET' = New-Secret 64
    'SETTINGS_SECRET'    = New-Secret 64
  }
  $lines = Get-Content .env.docker.example -Encoding UTF8 | ForEach-Object {
    $line = $_
    foreach ($key in $values.Keys) { if ($line -match "^$key=") { $line = "$key=$($values[$key])" } }
    $line
  }
  [IO.File]::WriteAllLines((Join-Path (Get-Location) '.env'), [string[]]$lines, (New-Object Text.UTF8Encoding $false))
  Write-Host 'Đã tạo .env (giữ file này, không chia sẻ, không commit).'
} else {
  Write-Host 'Đã có .env, dùng lại.'
}

Step 'Khởi động SQL Server và MongoDB (lần đầu tải image khoảng 3 GB)'
docker compose up -d --wait sqlserver mongodb; Check 'khởi động cơ sở dữ liệu'

Step 'Dựng image API và website'
docker compose build; Check 'dựng image'

Step 'Tạo/cập nhật cơ sở dữ liệu (migration)'
docker compose run --rm backend node run-migration.js; Check 'chạy migration'

# run-seed.js ghi lại file seed đã nạp: lần đầu nạp 50.000 sản phẩm (2-5 phút), các lần sau chỉ nạp file seed mới.
Step 'Nạp dữ liệu mẫu (lần đầu 2-5 phút, các lần sau chỉ nạp phần mới)'
docker compose run --rm backend node run-seed.js; Check 'nạp dữ liệu mẫu'

Step 'Khởi động API và website'
docker compose up -d --wait; Check 'khởi động website'

Write-Host ''
Write-Host 'Xong! Website: http://localhost:8080' -ForegroundColor Green
Write-Host 'Quản trị: admin@btstore.local / password (đổi mật khẩu nếu dùng thật). Khoá OpenAI: Quản trị > Trợ lý AI.'
Write-Host 'Dừng: docker compose stop    Chạy lại: chạy lại script này.'

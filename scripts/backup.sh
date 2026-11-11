#!/usr/bin/env bash
# shellcheck disable=SC2016  # $MONGO_*, $MSSQL_* cố ý để trong nháy đơn: mở rộng bên trong container.
# Sao lưu BinhTinhStore đang chạy bằng docker-compose: SQL Server, MongoDB và ảnh sản phẩm tải lên.
#   ./scripts/backup.sh                 lưu vào backups/<ngày-giờ>/
#   ./scripts/backup.sh /mnt/usb        lưu vào /mnt/usb/<ngày-giờ>/
# Giữ lại KEEP bản mới nhất (mặc định 14), bản cũ hơn tự xoá.
# Chạy hằng ngày bằng cron, ví dụ 2 giờ sáng:
#   0 2 * * * cd /duong/dan/dbms-ecommerce && ./scripts/backup.sh >> backups/backup.log 2>&1
# Mật khẩu lấy từ biến môi trường bên trong container, không truyền trên dòng lệnh của máy chủ.
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE=${COMPOSE:-docker compose}
DB=${SQL_DATABASE:-ecommerce_dbms}
KEEP=${KEEP:-14}
ROOT=${1:-backups}
OUT="$ROOT/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"

echo "[backup] SQL Server: $DB"
$COMPOSE exec -T sqlserver sh -c "mkdir -p /var/opt/mssql/backup && /opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P \"\$MSSQL_SA_PASSWORD\" -b -Q \"BACKUP DATABASE [$DB] TO DISK = N'/var/opt/mssql/backup/$DB.bak' WITH INIT, CHECKSUM\" > /dev/null"
$COMPOSE exec -T sqlserver cat "/var/opt/mssql/backup/$DB.bak" > "$OUT/$DB.bak"

echo "[backup] MongoDB"
$COMPOSE exec -T mongodb sh -c 'mongodump --quiet --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive --gzip' > "$OUT/mongodb.archive.gz"

echo "[backup] Ảnh tải lên"
$COMPOSE run --rm --no-deps -T backend tar -c -C /srv/backend-app/uploads . > "$OUT/uploads.tar"

# Kiểm tra nhanh: file không rỗng và bản SQL đọc lại được.
for file in "$DB.bak" mongodb.archive.gz uploads.tar; do
  [ -s "$OUT/$file" ] || { echo "[backup] LỖI: $file rỗng" >&2; exit 1; }
done
$COMPOSE exec -T sqlserver sh -c "/opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P \"\$MSSQL_SA_PASSWORD\" -b -Q \"RESTORE VERIFYONLY FROM DISK = N'/var/opt/mssql/backup/$DB.bak' WITH CHECKSUM\" > /dev/null"
(cd "$OUT" && sha256sum "$DB.bak" mongodb.archive.gz uploads.tar > SHA256SUMS)

echo "[backup] Xong: $OUT ($(du -sh "$OUT" | cut -f1))"

# Xoá bản cũ, giữ KEEP bản mới nhất (chỉ xoá thư mục dạng ngày-giờ do script này tạo).
mapfile -t old < <(find "$ROOT" -mindepth 1 -maxdepth 1 -type d -name '[0-9]*-[0-9]*' | sort -r | tail -n +$((KEEP + 1)))
for dir in "${old[@]}"; do
  rm -rf -- "$dir"
  echo "[backup] Đã xoá bản cũ $dir"
done

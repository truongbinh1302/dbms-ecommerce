#!/usr/bin/env bash
# shellcheck disable=SC2016  # $MONGO_*, $MSSQL_* cố ý để trong nháy đơn: mở rộng bên trong container.
# Khôi phục BinhTinhStore từ một bản sao lưu của scripts/backup.sh.
#   ./scripts/restore.sh backups/20261111-020000
# GHI ĐÈ toàn bộ dữ liệu hiện tại (SQL Server, MongoDB, ảnh tải lên). Hỏi xác nhận trước,
# trừ khi chạy với --yes. API được dừng trong lúc khôi phục rồi bật lại.
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE=${COMPOSE:-docker compose}
DB=${SQL_DATABASE:-ecommerce_dbms}
DIR=${1:?Cách dùng: ./scripts/restore.sh <thư mục bản sao lưu> [--yes]}
CONFIRM=${2:-}

for file in "$DB.bak" mongodb.archive.gz uploads.tar SHA256SUMS; do
  [ -s "$DIR/$file" ] || { echo "Thiếu $DIR/$file" >&2; exit 1; }
done
(cd "$DIR" && sha256sum --quiet -c SHA256SUMS) || { echo "Bản sao lưu bị hỏng (sai SHA256)" >&2; exit 1; }

if [ "$CONFIRM" != "--yes" ]; then
  read -r -p "Ghi đè toàn bộ dữ liệu hiện tại bằng bản $DIR? Gõ 'khoi phuc' để tiếp tục: " answer
  [ "$answer" = "khoi phuc" ] || { echo "Đã huỷ."; exit 1; }
fi

echo "[restore] Dừng API"
$COMPOSE stop backend > /dev/null

echo "[restore] SQL Server: $DB"
$COMPOSE exec -T sqlserver sh -c 'mkdir -p /var/opt/mssql/backup && cat > /var/opt/mssql/backup/restore.bak' < "$DIR/$DB.bak"
$COMPOSE exec -T sqlserver sh -c "/opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P \"\$MSSQL_SA_PASSWORD\" -b -Q \"
  IF DB_ID(N'$DB') IS NOT NULL ALTER DATABASE [$DB] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
  RESTORE DATABASE [$DB] FROM DISK = N'/var/opt/mssql/backup/restore.bak' WITH REPLACE, CHECKSUM;
  ALTER DATABASE [$DB] SET MULTI_USER;\" > /dev/null && rm -f /var/opt/mssql/backup/restore.bak"

echo "[restore] MongoDB"
$COMPOSE exec -T mongodb sh -c 'mongorestore --quiet --drop --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive --gzip' < "$DIR/mongodb.archive.gz"

echo "[restore] Ảnh tải lên"
$COMPOSE run --rm --no-deps -T backend sh -c 'find /srv/backend-app/uploads -mindepth 1 -delete && tar -x -C /srv/backend-app/uploads' < "$DIR/uploads.tar"

echo "[restore] Bật lại API"
$COMPOSE start backend > /dev/null
echo "[restore] Xong."

@echo off
rem Windows: bam dup de do tro ly AI rap may tren 30 yeu cau mau (goi OpenAI that bang khoa da luu, ton mot it tien).
rem Ket qua: file bao-cao-tro-ly-ai.md o thu muc nay. Can chay CHAY-WEBSITE.bat truoc.
chcp 65001 >nul
cd /d "%~dp0"
echo Dang chay 30 yeu cau mau, mat khoang 3 den 10 phut...
docker compose exec -T backend node scripts/eval-build-agent.js > bao-cao-tro-ly-ai.md
if errorlevel 1 (
  echo Co loi, xem thong bao phia tren. Website da chay chua? Da nhap khoa OpenAI chua?
) else (
  echo Xong: bao-cao-tro-ly-ai.md
)
echo.
pause

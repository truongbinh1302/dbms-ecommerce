@echo off
rem Windows: them anh san pham hang loat. Can chay CHAY-WEBSITE.bat truoc.
rem 1) Lan dau bam dup: tao thu muc anh-san-pham va file danh-sach-ma-san-pham.csv (ma san pham de dat ten file).
rem 2) Bo anh vao thu muc anh-san-pham, ten file = ma san pham, vi du amd-ryzen-7-9700x.jpg (anh phu: ...-2.jpg den ...-6.jpg).
rem 3) Bam dup lai de gan anh. Chi thay anh minh hoa; anh da tai len o trang quan tri duoc giu nguyen.
chcp 65001 >nul
cd /d "%~dp0"
if not exist anh-san-pham mkdir anh-san-pham

docker compose exec -T backend node scripts/import-product-images.js --list > anh-san-pham\danh-sach-ma-san-pham.csv
if errorlevel 1 (
  echo Khong ket noi duoc website. Hay chay CHAY-WEBSITE.bat truoc.
  goto done
)
echo Da cap nhat danh sach ma san pham: anh-san-pham\danh-sach-ma-san-pham.csv

set FOUND=
for %%F in (anh-san-pham\*.jpg anh-san-pham\*.jpeg anh-san-pham\*.png anh-san-pham\*.webp anh-san-pham\*.gif) do set FOUND=1
if not defined FOUND (
  echo.
  echo Thu muc anh-san-pham chua co anh. Bo anh vao, dat ten theo cot ten_file_anh trong file danh sach, roi bam dup lai.
  start "" "%~dp0anh-san-pham"
  goto done
)

echo.
echo Dang gan anh...
docker compose exec -T -u root backend rm -rf /tmp/anh-san-pham
docker compose cp anh-san-pham backend:/tmp/anh-san-pham
docker compose exec -T backend node scripts/import-product-images.js /tmp/anh-san-pham %*
docker compose exec -T -u root backend rm -rf /tmp/anh-san-pham

:done
echo.
pause

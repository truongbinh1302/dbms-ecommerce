@echo off
rem Windows: bam dup file nay de chay BinhTinhStore bang Docker Desktop (xem scripts\start-docker.ps1).
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-docker.ps1"
echo.
pause

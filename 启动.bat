@echo off
chcp 65001 >nul
title 影序馆 本地服务
cd /d "%~dp0"
echo.
echo ========================================
echo   影序馆 正在启动...
echo ========================================
echo.
node server.js
if %errorlevel% neq 0 (
  echo.
  echo [错误] 服务启动失败，请检查是否已安装 Node.js
  echo 下载地址：https://nodejs.org/
  echo.
  pause
)

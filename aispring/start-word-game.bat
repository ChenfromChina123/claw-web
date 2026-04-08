@echo off
setlocal enabledelayedexpansion

:: 设置控制台编码
chcp 65001 >nul

echo.
echo ========================================
echo   启动单词记忆服务
echo ========================================
echo.

cd /d "%~dp0word-game"

:: 启动后端（独立窗口）
echo [1/2] 启动单词记忆后端 (端口 5201)...
start "Word Game Backend" cmd /k "cd server && node index.js && pause"

:: 等待后端启动
timeout /t 3 /nobreak >nul

:: 启动前端
echo [2/2] 启动单词记忆前端 (端口 5200)...
npm run dev

echo.
echo 单词记忆服务已退出
pause

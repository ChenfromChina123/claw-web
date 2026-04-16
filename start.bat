@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ==========================================
echo   Claw-Web Master-Worker Docker Service
echo ==========================================

:: 检查 .env 文件是否存在
if not exist .env (
    echo [INFO] 未找到 .env 文件，从模板创建...
    copy .env.example .env >nul
    echo [OK] 已创建 .env 文件，请根据需要修改配置
)

:: 检查 Docker 是否安装
where docker >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Docker 未安装
    echo 请先安装 Docker: https://docs.docker.com/get-docker/
    pause
    exit /b 1
)

if "%~1"=="" goto start

if "%~1"=="build" goto build
if "%~1"=="start" goto start
if "%~1"=="up" goto start
if "%~1"=="stop" goto stop
if "%~1"=="down" goto stop
if "%~1"=="restart" goto restart
if "%~1"=="logs" goto logs
if "%~1"=="status" goto status
if "%~1"=="clean" goto clean
if "%~1"=="shell-master" goto shell_master
if "%~1"=="shell-worker" goto shell_worker
if "%~1"=="shell-mysql" goto shell_mysql
if "%~1"=="backup" goto backup
goto usage

:build
echo [BUILD] 构建 Docker 镜像...
docker compose build --no-cache
echo [OK] 构建完成
goto end

:start
echo [START] 启动 Claw-Web 服务...

:: 创建必要目录
if not exist docker mkdir docker
if not exist server\workspaces\users mkdir server\workspaces\users

:: 启动服务
docker compose up -d

echo.
echo ==========================================
echo   ✅ Claw-Web 服务已启动！
echo ==========================================
echo.
echo 服务访问地址：
echo   🌐 前端界面: http://localhost:80
echo   🔧 Master API: http://localhost:3000
echo   🗄️  MySQL: localhost:3306
echo.
echo 常用命令：
echo   查看日志: %0 logs
echo   查看状态: %0 status
echo   停止服务: %0 stop
echo.
echo ⚠️  首次启动可能需要 1-2 分钟初始化数据库
goto end

:stop
echo [STOP] 停止 Claw-Web 服务...
docker compose down
echo [OK] 服务已停止
goto end

:restart
echo [RESTART] 重启 Claw-Web 服务...
docker compose restart
echo [OK] 服务已重启
goto end

:logs
echo [LOGS] 查看日志（Ctrl+C 退出）...
docker compose logs -f --tail=100
goto end

:status
echo [STATUS] 服务状态：
docker compose ps
echo.
echo 资源使用情况：
docker stats --no-stream
goto end

:clean
echo [WARN] 清理所有容器、镜像和数据卷...
set /p confirm="确定要删除所有数据吗？(y/N) "
if "%confirm%"=="y" (
    if "%confirm%"=="Y" (
        docker compose down -v --rmi all
        echo [OK] 清理完成
    )
) else (
    echo 已取消
)
goto end

:shell_master
echo [SHELL] 进入 Master 容器 Shell...
docker compose exec master /bin/sh
goto end

:shell_worker
echo [SHELL] 进入 Worker 容器 Shell...
docker compose exec worker-template /bin/sh
goto end

:shell_mysql
echo [SHELL] 进入 MySQL Shell...
docker compose exec mysql mysql -u clawuser -pclawpass2024 claw_web
goto end

:backup
echo [BACKUP] 备份数据库...
for /f "tokens=2 delims== " %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set BACKUP_FILE=backup_%datetime:~0,8%_%datetime:~8,6%.sql
docker compose exec mysql mysqldump -u clawuser -pclawpass2024 claw_web > %BACKUP_FILE%
echo [OK] 已备份到 %BACKUP_FILE%
goto end

:usage
echo 用法: %0 {build^|start^|stop^|restart^|logs^|status^|clean^|shell-*^|backup}
echo.
echo 命令说明:
echo   build         构建 Docker 镜像
echo   start/up      启动所有服务（默认）
echo   stop/down     停止所有服务
echo   restart       重启服务
echo   logs          查看所有服务日志
echo   status        查看服务和资源状态
echo   clean         清理所有容器和卷
echo   shell-master  进入 Master 容器
echo   shell-worker  进入 Worker 容器
echo   shell-mysql   进入 MySQL Shell
echo   backup        备份数据库
goto end

:end
pause

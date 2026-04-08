@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: ============================================================
:: 多用户 Docker 隔离部署管理脚本 (Windows 版本)
:: 功能：为每个用户创建独立的容器实例，实现完全隔离
::
:: 使用方法：
::   docker-manager.bat create-user <user_id>     创建新用户实例
::   docker-manager.bat start-user <user_id>      启动用户实例
::   docker-manager.bat stop-user <user_id>       停止用户实例
::   docker-manager.bat delete-user <user_id>     删除用户实例
::   docker-manager.bat list-users                列出所有用户
::   docker-manager.bat show-ports <user_id>      显示用户端口映射
:: ============================================================

set BASE_PORT_BACKEND=5000
set BASE_PORT_FRONTEND=3000
set BASE_PORT_MYSQL=3306
set BASE_PORT_REDIS=6379
set PORT_INCREMENT=1000
set DATA_BASE_DIR=D:\aispring-users

:: ==================== 主逻辑 ====================

if "%1"=="" goto :show_help
if "%1"=="create-user" goto :create_user
if "%1"=="start-user" goto :start_user
if "%1"=="stop-user" goto :stop_user
if "%1"=="delete-user" goto :delete_user
if "%1"=="list-users" goto :list_users
if "%1"=="show-ports" goto :show_ports
goto :show_help

:: ==================== 创建用户 ====================
:create_user
if "%2"=="" (
    echo ❌ 错误: 请提供用户ID
    echo 用法: %0 create-user ^<user_id^>
    goto :eof
)

set USER_ID=%2
call :calc_ports %USER_ID%

echo 正在创建用户 %USER_ID% 的独立环境...

:: 创建目录结构
set USER_DIR=%DATA_BASE_DIR%\%USER_ID%
if not exist "%USER_DIR%" mkdir "%USER_DIR%"
if not exist "%USER_DIR%\data" mkdir "%USER_DIR%\data"
if not exist "%USER_DIR%\logs" mkdir "%USER_DIR%\logs"

:: 生成 docker-compose.yml
(
echo # 用户 %USER_ID% 的独立 Docker Compose 配置
echo version: '3.8'
echo.
echo services:
echo   mysql-%USER_ID%:
echo     image: mysql:8.0
echo     container_name: mysql-%USER_ID%
echo     restart: unless-stopped
echo     environment:
echo       MYSQL_ROOT_PASSWORD: root_%USER_ID%_secure
echo       MYSQL_DATABASE: aispring_%USER_ID%
echo       MYSQL_USER: user_%USER_ID%
echo       MYSQL_PASSWORD: db_%USER_ID%_secure
echo       TZ: Asia/Shanghai
echo     ports:
echo       - "%MYSQL_PORT%:3306"
echo     volumes:
echo       - mysql_%USER_ID%_data:/var/lib/mysql
echo     command:
echo       - --character-set-server=utf8mb4
echo       - --collation-server=utf8mb4_unicode_ci
echo     networks:
echo       - network-%USER_ID%
echo.
echo   redis-%USER_ID%:
echo     image: redis:7-alpine
echo     container_name: redis-%USER_ID%
echo     restart: unless-stopped
echo     ports:
echo       - "%REDIS_PORT%:6379"
echo     volumes:
echo       - redis_%USER_ID%_data:/data
echo     command: redis-server --maxmemory 128mb --maxmemory-policy allkeys-lru
echo     networks:
echo       - network-%USER_ID%
echo.
echo   backend-%USER_ID%:
echo     build:
echo       context: ..\aispring
echo       dockerfile: Dockerfile
echo     container_name: backend-%USER_ID%
echo     restart: unless-stopped
echo     ports:
echo       - "%BACKEND_PORT%:5000"
echo     environment:
echo       DB_HOST: mysql-%USER_ID%
echo       DB_PORT: 3306
echo       DB_NAME: aispring_%USER_ID%
echo       REDIS_HOST: redis-%USER_ID%
echo       APP_STORAGE_ROOT: /app/data
echo       SPRING_PROFILES_ACTIVE: prod
echo     volumes:
echo       - backend_%USER_ID%_data:/app/data
echo     depends_on:
echo       mysql-%USER_ID%:
echo         condition: service_healthy
echo     networks:
echo       - network-%USER_ID%
echo.
echo   web-%USER_ID%:
echo     build:
echo       context: ..\claude-code-haha
echo       dockerfile: Dockerfile
echo     container_name: web-%USER_ID%
echo     restart: unless-stopped
echo     ports:
echo       - "%FRONTEND_PORT%:3000"
echo     environment:
echo       NODE_ENV: production
echo       DB_HOST: mysql-%USER_ID%
echo       WORKSPACE_BASE_DIR: /app/data/workspaces
echo     volumes:
echo       - web_%USER_ID%_data:/app/data
echo     depends_on:
echo       mysql-%USER_ID%:
echo         condition: service_healthy
echo     networks:
echo       - network-%USER_ID%
echo.
echo networks:
echo   network-%USER_ID%:
echo     driver: bridge
echo.
echo volumes:
echo   mysql_%USER_ID%_data:
echo   redis_%USER_ID%_data:
echo   backend_%USER_ID%_data:
echo   web_%USER_ID%_data:
) > "%USER_DIR%\docker-compose.yml"

echo ✅ 用户 %USER_ID% 已创建成功！
echo    📁 配置目录: %USER_DIR%
echo    🔗 后端端口: %BACKEND_PORT%
echo    🌐 前端端口: %FRONTEND_PORT%
echo    💾 MySQL 端口: %MYSQL_PORT%
echo    ⚡ Redis 端口: %REDIS_PORT%
goto :eof

:: ==================== 启动用户 ====================
:start_user
if "%2"=="" (
    echo ❌ 错误: 请提供用户ID
    goto :eof
)

set USER_DIR=%DATA_BASE_DIR%\%2
if not exist "%USER_DIR%" (
    echo ❌ 错误: 用户 %2 不存在
    goto :eof
)

cd /d "%USER_DIR%"
docker-compose up -d
echo ✅ 用户 %2 的服务已启动
goto :eof

:: ==================== 停止用户 ====================
:stop_user
if "%2"=="" (
    echo ❌ 错误: 请提供用户ID
    goto :eof
)

set USER_DIR=%DATA_BASE_DIR%\%2
if not exist "%USER_DIR%" (
    echo ❌ 错误: 用户 %2 不存在
    goto :eof
)

cd /d "%USER_DIR%"
docker-compose down
echo ✅ 用户 %2 的服务已停止
goto :eof

:: ==================== 删除用户 ====================
:delete_user
if "%2"=="" (
    echo ❌ 错误: 请提供用户ID
    goto :eof
)

set USER_DIR=%DATA_BASE_DIR%\%2
if not exist "%USER_DIR%" (
    echo ❌ 错误: 用户 %2 不存在
    goto :eof
)

echo ⚠️  警告: 此操作将删除用户 %2 的所有数据和容器！
set /p CONFIRM=确定要继续吗？(y/N):
if /i not "%CONFIRM%"=="y" (
    echo ❌ 操作已取消
    goto :eof
)

cd /d "%USER_DIR%"
docker-compose down -v
cd /d "%DATA_BASE_DIR%"
rmdir /s /q "%USER_DIR%"
echo ✅ 用户 %2 已完全删除
goto :eof

:: ==================== 列出用户 ====================
:list-users
echo 📋 当前已创建的用户列表:
echo ================================================
if exist "%DATA_BASE_DIR%" (
    for /d %%D in ("%DATA_BASE_DIR%\*") do (
        set UNAME=%%~nxD
        call :calc_ports !UNAME!
        echo    !UNAME!   后端:!BACKEND_PORT!   前端:!FRONTEND_PORT!
    )
) else (
    echo    (暂无用户)
)
echo ================================================
goto :eof

:: ==================== 显示端口 ====================
:show_ports
if "%2"=="" (
    echo ❌ 错误: 请提供用户ID
    goto :eof
)

call :calc_ports %2
echo 🔗 用户 %2 的端口映射:
echo ================================================
echo    后端 API:      %BACKEND_PORT%
echo    前端 Web:      %FRONTEND_PORT%
echo    MySQL 数据库:  %MYSQL_PORT%
echo    Redis 缓存:    %REDIS_PORT%
echo ================================================
goto :eof

:: ==================== 计算端口 ====================
:calc_ports
:: 使用简单的哈希算法生成端口偏移
set HASH=0
set INPUT=%1
set LEN=0

:calc_len
if not "%INPUT%"=="" (
    set /a LEN+=1
    set INPUT=%INPUT:~1%
    goto :calc_len
)

set INPUT=%1
for /l %%i in (1,1,%LEN%) do (
    set CHAR=!INPUT:~0,1!
    set /a HASH+=(!CHAR! * %%i)
    set INPUT=!INPUT:~1!
)

set /a PORT_OFFSET=(HASH %% 100) * %PORT_INCREMENT%
set /a BACKEND_PORT=%BASE_PORT_BACKEND%+%PORT_OFFSET%
set /a FRONTEND_PORT=%BASE_PORT_FRONTEND%+%PORT_OFFSET%
set /a MYSQL_PORT=%BASE_PORT_MYSQL%+%PORT_OFFSET%
set /a REDIS_PORT=%BASE_PORT_REDIS%+%PORT_OFFSET%
goto :eof

:: ==================== 帮助信息 ====================
:show_help.
echo AI Study Project - 多用户 Docker 管理工具 ^(Windows 版^)
echo.
echo 使用方法:
echo   %0 create-user ^<user_id^>     创建新的用户实例
echo   %0 start-user ^<user_id^>      启动用户服务
echo   %0 stop-user ^<user_id^>       停止用户服务
echo   %0 delete-user ^<user_id^>     删除用户及数据
echo   %0 list-users                列出所有用户
echo   %0 show-ports ^<user_id^>      显示用户端口
echo.
echo 示例:
echo   %0 create-user zhangsan
echo   %0 start-user zhangsan
echo.

endlocal

@echo off
chcp 65001 >nul
echo ========================================
echo   ECDICT 词典库下载脚本
echo ========================================
echo.
echo 即将下载 ECDICT 词典库（约 60MB）
echo 下载地址：https://github.com/skywind3000/ECDICT
echo.
echo 请选择下载方式：
echo   1. 使用 PowerShell 下载（推荐）
echo   2. 使用浏览器手动下载
echo   3. 跳过下载，直接导入已有文件
echo.

set /p choice=请输入选项 (1/2/3):

if "%choice%"=="1" (
    echo.
    echo 正在使用 PowerShell 下载...
    echo 如果下载失败，请尝试选项 2 手动下载
    echo.

    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/skywind3000/ECDICT/releases/download/1.0.26/ecdict.csv.xz' -OutFile 'ecdict.csv.xz'"
    echo.
    echo 下载完成，正在解压...
    powershell -Command "Expand-Archive -Path 'ecdict.csv.xz' -DestinationPath '.' -Force"
    echo.
    echo 解压完成！
    echo 文件位置：%cd%\ecdict.csv
    echo.
    echo 请将此文件路径复制给 aispring 服务进行导入
    goto end
)

if "%choice%"=="2" (
    echo.
    echo 请按以下步骤操作：
    echo   1. 打开浏览器访问：https:\/\/github.com\/skywind3000\/ECDICT
    echo   2. 点击右侧 Release 按钮
    echo   3. 下载 ecdict.csv.xz 或 ecdict.csv 文件
    echo   4. 解压（如果是.xz格式）
    echo   5. 将文件放到 aispring 目录下
    echo   6. 重启 aispring 服务
    echo.
    echo 文件路径示例：d:\Users\Administrator\AistudyProject\new_pro\ai-tutor-system\aispring\ecdict.csv
    goto end
)

if "%choice%"=="3" (
    echo.
    echo 请确保 ecdict.csv 文件已在 aispring 目录下
    echo 然后重启服务即可自动导入
    goto end
)

:end
echo.
echo 按任意键退出...
pause >nul

#
# 前端构建脚本 (PowerShell)
# 在 Master 容器内手动构建前端
#
# 使用方法：
#   docker exec claude-backend-master pwsh /app/scripts/build-frontend.ps1
#

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  前端构建脚本" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

# 检查是否在容器内运行
if (-not (Test-Path "/app/package.json")) {
    Write-Host "❌ 错误：请在 Master 容器内运行此脚本" -ForegroundColor Red
    Write-Host "用法：docker exec claude-backend-master pwsh /app/scripts/build-frontend.ps1"
    exit 1
}

# 检查前端源代码是否存在
if (-not (Test-Path "/app/web-src")) {
    Write-Host "❌ 错误：前端源代码目录 /app/web-src 不存在" -ForegroundColor Red
    Write-Host "请将前端源代码挂载到容器的 /app/web-src 目录"
    exit 1
}

Set-Location /app/web-src

Write-Host ""
Write-Host "[1/3] 安装前端依赖..." -ForegroundColor Yellow
npm install --registry=https://registry.npmmirror.com --legacy-peer-deps

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 依赖安装失败" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[2/3] 构建前端..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 构建失败" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[3/3] 复制构建产物到 public 目录..." -ForegroundColor Yellow
if (Test-Path "dist") {
    Remove-Item -Path "/app/public/*" -Recurse -Force -ErrorAction SilentlyContinue
    Copy-Item -Path "dist/*" -Destination "/app/public/" -Recurse -Force
    Write-Host "✅ 前端构建完成！" -ForegroundColor Green
} else {
    Write-Host "❌ 错误：构建产物 dist 目录不存在" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  构建完成" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "前端文件已部署到 /app/public 目录"

# ============================================================
# Claude Code HAHA - 前端直连 Docker 后端 启动脚本
#
# 用途：前端本地开发 (npm run dev)，后端使用 Docker
#
# 使用方法：
# 1. 右键此脚本 -> 使用 PowerShell 运行
# 2. 或在 PowerShell 中执行：.\start-dev-local.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Claude Code HAHA - 前端直连 Docker 后端开发模式" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# 检查 Docker 是否运行
Write-Host "[1/4] 检查 Docker 状态..." -ForegroundColor Yellow
try {
    $dockerStatus = docker info 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Docker 未运行"
    }
    Write-Host "  Docker 运行正常" -ForegroundColor Green
} catch {
    Write-Host "  错误：Docker 未运行���未安装" -ForegroundColor Red
    Write-Host "  请先启动 Docker Desktop" -ForegroundColor Red
    exit 1
}

# 启动 Docker 服务（后端 + 数据库）
Write-Host ""
Write-Host "[2/4] 启动 Docker 服务（后端 + 数据库）..." -ForegroundColor Yellow
Set-Location $ProjectRoot

$composeFile = "docker-compose.dev-local.yml"
if (-not (Test-Path $composeFile)) {
    Write-Host "  错误：找不到 $composeFile" -ForegroundColor Red
    exit 1
}

# 检查容器是否已在运行
$backendContainer = "claude-backend-dev-local"
$mysqlContainer = "claude-mysql-dev-local"
$existingBackend = docker ps -a --filter "name=$backendContainer" --format "{{.Names}}" 2>$null
$existingMysql = docker ps -a --filter "name=$mysqlContainer" --format "{{.Names}}" 2>$null

if ($existingBackend -eq $backendContainer) {
    Write-Host "  检测到后端容器已存在，尝试启动..." -ForegroundColor Yellow
    docker compose -f $composeFile start backend 2>&1 | Out-Null
} else {
    Write-Host "  构建并启动 Docker 服务..." -ForegroundColor Yellow
    docker compose -f $composeFile up -d --build 2>&1 | ForEach-Object { Write-Host "    $_" }
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "  错误：Docker 服务启动失败" -ForegroundColor Red
    exit 1
}

# 等待后端服务就绪
Write-Host ""
Write-Host "[3/4] 等待后端服务就绪..." -ForegroundColor Yellow
$maxWaitSeconds = 60
$waitedSeconds = 0
$backendReady = $false

while ($waitedSeconds -lt $maxWaitSeconds) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $backendReady = $true
            break
        }
    } catch {
        # 继续等待
    }
    
    Write-Host "  等待中... ($waitedSeconds/$maxWaitSeconds 秒)" -ForegroundColor Gray
    Start-Sleep -Seconds 3
    $waitedSeconds += 3
}

if (-not $backendReady) {
    Write-Host "  警告：后端服务可能未就绪，但继续启动前端" -ForegroundColor Yellow
} else {
    Write-Host "  后端服务已就绪" -ForegroundColor Green
}

# 启动前端
Write-Host ""
Write-Host "[4/4] 启动前端开发服务器..." -ForegroundColor Yellow
$frontendDir = Join-Path $ProjectRoot "web"

if (-not (Test-Path $frontendDir)) {
    Write-Host "  错误：找不到 web 目录" -ForegroundColor Red
    exit 1
}

Set-Location $frontendDir

# 检查依赖是否安装
if (-not (Test-Path "node_modules")) {
    Write-Host "  安装前端依赖..." -ForegroundColor Yellow
    npm install 2>&1 | ForEach-Object { Write-Host "    $_" }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  服务已启动！" -ForegroundColor Green
Write-Host ""
Write-Host "  - 前端地址: http://localhost:5173" -ForegroundColor White
Write-Host "  - 后端地址: http://localhost:3000 (Docker)" -ForegroundColor White
Write-Host ""
Write-Host "  停止服务：" -ForegroundColor White
Write-Host "    docker compose -f docker-compose.dev-local.yml down" -ForegroundColor Gray
Write-Host ""
Write-Host "  重新启动：" -ForegroundColor White
Write-Host "    docker compose -f docker-compose.dev-local.yml restart" -ForegroundColor Gray
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# 启动 Vite 开发服务器
npm run dev

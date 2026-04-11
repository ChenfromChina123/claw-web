# Docker 国内镜像加速器自动配置脚本
# 用于 Windows PowerShell
#
# 使用方法：
# 1. 以管理员身份运行 PowerShell
# 2. 执行：.\configure-docker-mirror.ps1
# 3. 重启 Docker Desktop

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Docker 国内镜像加速器配置工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检测 Docker Desktop 是否安装
try {
    $dockerVersion = docker --version
    Write-Host "✓ 检测到 Docker: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ 未检测到 Docker，请先安装 Docker Desktop" -ForegroundColor Red
    exit 1
}

# Docker Desktop 配置文件路径
$dockerConfigPath = "$env:USERPROFILE\.docker\daemon.json"
$backupPath = "$env:USERPROFILE\.docker\daemon.json.backup"

# 镜像加速器地址列表（2026 年更新，使用最新可用地址）
$mirrors = @(
    "https://docker.m.daocloud.io",           # DaoCloud - 推荐
    "https://docker.1panel.live",             # 1Panel - 推荐
    "https://hub-mirror.c.163.com",           # 网易云
    "https://mirror.ccs.tencentyun.com"      # 腾讯云
)

Write-Host ""
Write-Host "可用的镜像加速器地址：" -ForegroundColor Yellow
for ($i = 0; $i -lt $mirrors.Count; $i++) {
    Write-Host "  [$($i + 1)] $($mirrors[$i])" -ForegroundColor Gray
}
Write-Host ""

# 检查是否已存在配置文件
if (Test-Path $dockerConfigPath) {
    Write-Host "✓ 发现现有 Docker 配置文件" -ForegroundColor Green
    
    # 备份现有配置
    Copy-Item $dockerConfigPath $backupPath -Force
    Write-Host "✓ 已备份现有配置到：$backupPath" -ForegroundColor Green
    
    # 读取现有配置
    try {
        $existingConfig = Get-Content $dockerConfigPath -Raw | ConvertFrom-Json
        Write-Host "✓ 成功读取现有配置" -ForegroundColor Green
    } catch {
        Write-Host "⚠ 读取现有配置失败，将创建新配置" -ForegroundColor Yellow
        $existingConfig = @{}
    }
} else {
    Write-Host "ℹ 未找到现有配置文件，将创建新配置" -ForegroundColor Cyan
    $existingConfig = @{}
    
    # 创建配置目录
    $configDir = Split-Path -Parent $dockerConfigPath
    if (!(Test-Path $configDir)) {
        New-Item -ItemType Directory -Force -Path $configDir | Out-Null
        Write-Host "✓ 已创建配置目录：$configDir" -ForegroundColor Green
    }
}

# 更新镜像加速器配置
$existingConfig."registry-mirrors" = $mirrors

# 确保其他必要配置存在
if (!$existingConfig.builder) {
    $existingConfig.builder = @{
        gc = @{
            defaultKeepStorage = "20GB"
            enabled = $true
        }
    }
}

if (!$existingConfig.experimental) {
    $existingConfig.experimental = $false
}

# 保存新配置
try {
    $existingConfig | ConvertTo-Json -Depth 10 | Set-Content $dockerConfigPath -Encoding UTF8
    Write-Host "✓ 配置已保存到：$dockerConfigPath" -ForegroundColor Green
} catch {
    Write-Host "✗ 保存配置失败：$_" -ForegroundColor Red
    Write-Host "请确保以管理员身份运行此脚本" -ForegroundColor Yellow
    exit 1
}

# 显示配置内容
Write-Host ""
Write-Host "配置内容：" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Get-Content $dockerConfigPath | Write-Host
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 提示重启 Docker
Write-Host "✓ 配置完成！" -ForegroundColor Green
Write-Host ""
Write-Host "下一步操作：" -ForegroundColor Yellow
Write-Host "1. 重启 Docker Desktop 以应用配置" -ForegroundColor White
Write-Host "2. 验证配置是否生效：docker info | Select-String 'Registry Mirrors'" -ForegroundColor White
Write-Host "3. 重新构建项目：docker compose -f docker-compose.cn-fast.yml up -d --build" -ForegroundColor White
Write-Host ""

# 询问是否立即重启 Docker
$restart = Read-Host "是否现在重启 Docker Desktop? (y/n)"
if ($restart -eq 'y' -or $restart -eq 'Y') {
    Write-Host "正在重启 Docker Desktop..." -ForegroundColor Cyan
    
    # 停止 Docker 服务
    Stop-Process -Name "Docker Desktop" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    
    # 启动 Docker 服务
    $dockerPath = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerPath) {
        Start-Process $dockerPath
        Write-Host "✓ Docker Desktop 已启动" -ForegroundColor Green
    } else {
        Write-Host "⚠ 未找到 Docker Desktop 启动路径，请手动重启" -ForegroundColor Yellow
    }
} else {
    Write-Host "ℹ 请手动重启 Docker Desktop 以应用配置" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "配置完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan

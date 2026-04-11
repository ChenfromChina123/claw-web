# ===========================================
# Claude Code HAHA - Windows Docker 部署脚本
# ===========================================
#
# 使用方法：
# .\deploy.ps1 [命令]
#
# 命令：
#   Start     - 启动所有服务
#   Stop      - 停止所有服务
#   Restart   - 重启所有服务
#   Build     - 重新构建镜像
#   Logs      - 查看日志
#   Status    - 查看服务状态
#   Clean     - 清理数据和容器
#   Help      - 显示帮助信息

param(
    [Parameter(Mandatory=$false)]
    [string]$Command = "Help",
    
    [Parameter(Mandatory=$false)]
    [string]$Service = ""
)

# 颜色函数
function Write-Info($message) {
    Write-Host "[INFO] $message" -ForegroundColor Cyan
}

function Write-Success($message) {
    Write-Host "[SUCCESS] $message" -ForegroundColor Green
}

function Write-Warning($message) {
    Write-Host "[WARNING] $message" -ForegroundColor Yellow
}

function Write-Error-Custom($message) {
    Write-Host "[ERROR] $message" -ForegroundColor Red
}

# 检查 Docker 是否安装
function Test-Docker {
    try {
        $dockerVersion = docker --version
        $composeVersion = docker compose version
        
        if ($dockerVersion -and $composeVersion) {
            Write-Success "Docker 环境检查通过"
            return $true
        }
        
        Write-Error-Custom "Docker 或 Docker Compose 未正确安装！"
        return $false
    }
    catch {
        Write-Error-Custom "Docker 未安装！请先安装 Docker Desktop: https://www.docker.com/products/docker-desktop/"
        return $false
    }
}

# 检查 .env 文件
function Test-EnvFile {
    if (-not (Test-Path ".env")) {
        Write-Warning ".env 文件不存在，正在从模板创建..."
        
        if (Test-Path ".env.docker.example") {
            Copy-Item ".env.docker.example" ".env"
            Write-Success ".env 文件已创建，请编辑并填写配置"
            Write-Info "使用记事本编辑: notepad .env"
            
            $editNow = Read-Host "是否现在编辑？(y/n)"
            if ($editNow -eq 'y' -or $editNow -eq 'Y') {
                notepad .env
            }
        }
        else {
            Write-Error-Custom ".env.docker.example 模板文件不存在！"
            return $false
        }
    }
    else {
        Write-Success ".env 文件已存在"
    }
    return $true
}

# 创建必要的目录
function New-Directories {
    Write-Info "创建数据目录..."
    
    New-Item -ItemType Directory -Force -Path "docker-data\user-workspaces" | Out-Null
    New-Item -ItemType Directory -Force -Path "docker-data\session-workspaces" | Out-Null
    New-Item -ItemType Directory -Force -Path "docker-data\logs" | Out-Null
    New-Item -ItemType Directory -Force -Path "docker\nginx\ssl" | Out-Null
    
    Write-Success "目录创建完成"
}

# 启动服务
function Start-Services {
    Write-Info "正在启动 Claude Code HAHA 服务..."
    
    if (-not (Test-Docker)) { return }
    if (-not (Test-EnvFile)) { return }
    New-Directories
    
    docker compose up -d
    
    Write-Host ""
    Write-Success "=========================================="
    Write-Success "  Claude Code HAHA 启动成功！"
    Write-Success "=========================================="
    Write-Host ""
    Write-Info "访问地址："
    $frontendPort = if ($env:FRONTEND_PORT) { $env:FRONTEND_PORT } else { "80" }
    $backendPort = if ($env:PORT) { $env:PORT } else { "3000" }
    Write-Host "  前端: http://localhost:$frontendPort"
    Write-Host "  API:  http://localhost:$backendPort/api"
    Write-Host ""
    Write-Info "常用命令："
    Write-Host "  查看日志: .\deploy.ps1 Logs"
    Write-Host "  查看状态: .\deploy.ps1 Status"
    Write-Host "  停止服务: .\deploy.ps1 Stop"
    Write-Host ""
}

# 停止服务
function Stop-Services {
    Write-Info "正在停止服务..."
    docker compose down
    Write-Success "所有服务已停止"
}

# 重启服务
function Restart-Services {
    Stop-Services
    Start-Sleep -Seconds 2
    Start-Services
}

# 重新构建镜像
function Build-Images {
    Write-Info "正在重新构建 Docker 镜像..."
    docker compose build --no-cache
    Write-Success "镜像构建完成"
}

# 查看日志
function Show-Logs {
    if ($Service) {
        docker compose logs -f $Service
    }
    else {
        docker compose logs -f --tail=100
    }
}

# 查看服务状态
function Show-Status {
    Write-Info "Claude Code HAHA 服务状态："
    Write-Host ""
    docker compose ps
    Write-Host ""
    Write-Info "资源使用情况："
    docker stats --no-stream --format "table {{.Name}}`t{{.CPUPerc}}`t{{.MemUsage}}`t{{.NetIO}}"
}

# 清理数据和容器
function Clean-All {
    Write-Warning "⚠️  此操作将删除所有数据、容器和镜像！"
    $confirm = Read-Host "确定要继续吗？(yes/no)"
    
    if ($confirm -eq 'yes') {
        Write-Info "正在清理..."
        docker compose down -v --rmi all
        Remove-Item -Recurse -Force -Path "docker-data" -ErrorAction SilentlyContinue
        Write-Success "清理完成"
    }
    else {
        Write-Info "操作已取消"
    }
}

# 显示帮助信息
function Show-Help {
    Write-Host @"
Claude Code HAHA - Windows Docker 部署工具

用法: .\deploy.ps1 [命令]

命令:
  Start     启动所有服务
  Stop      停止所有服务
  Restart   重启所有服务
  Build     重新构建镜像
  Logs      查看日志（可加 -Service 参数指定服务名）
  Status    查看服务状态和资源使用
  Clean     清理所有数据和容器
  Help      显示此帮助信息

示例:
  .\deploy.ps1 Start           # 启动服务
  .\deploy.ps1 Logs -Service backend  # 查看后端日志
  .\deploy.ps1 Status          # 查看状态
"@
}

# 主程序
switch ($Command.ToUpper()) {
    "START" { Start-Services }
    "STOP" { Stop-Services }
    "RESTART" { Restart-Services }
    "BUILD" { Build-Images }
    "LOGS" { Show-Logs }
    "STATUS" { Show-Status }
    "CLEAN" { Clean-All }
    {"HELP", "-H", "--HELP", "/?" -contains $_} { Show-Help }
    Default {
        Write-Error-Custom "未知命令: $Command"
        Show-Help
    }
}

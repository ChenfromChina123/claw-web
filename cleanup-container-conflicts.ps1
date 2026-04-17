# 容器命名冲突解决脚本
# 用途：清理所有冲突的用户容器，解决 "container name already in use" 问题

$ErrorActionPreference = "Stop"

Write-Host "=== 容器命名冲突清理脚本 ===" -ForegroundColor Yellow

# 1. 列出所有 claude-user 容器
Write-Host "`n1. 扫描所有 Claude 用户容器..." -ForegroundColor Cyan
$containers = docker ps -a --filter "name=claude-user-" --format "{{.ID}}|{{.Names}}|{{.Status}}" 2>$null

if (-not $containers) {
    Write-Host "未发现任何 claude-user 容器" -ForegroundColor Green
} else {
    Write-Host "发现以下容器：" -ForegroundColor Yellow
    $containers -split "`n" | ForEach-Object {
        $parts = $_ -split "\|"
        if ($parts.Count -ge 3) {
            Write-Host "  ID: $($parts[0]) | 名称: $($parts[1]) | 状态: $($parts[2])" -ForegroundColor White
        }
    }

    # 2. 询问是否清理
    Write-Host "`n2. 是否清理所有已停止的 claude-user 容器？(Y/N)" -ForegroundColor Yellow
    $response = Read-Host

    if ($response -eq 'Y' -or $response -eq 'y') {
        Write-Host "`n正在清理已停止的容器..." -ForegroundColor Cyan

        # 停止并删除所有已停止的 claude-user 容器
        $stoppedContainers = docker ps -a --filter "name=claude-user-" --filter "status=exited" --format "{{.ID}}" 2>$null
        if ($stoppedContainers) {
            $stoppedContainers -split "`n" | ForEach-Object {
                if ($_ -and $_.Trim()) {
                    Write-Host "  删除容器: $_" -ForegroundColor Gray
                    docker rm $_ 2>$null | Out-Null
                }
            }
            Write-Host "已清理 $($stoppedContainers -split "`n" | Where-Object { $_.Trim() }).Count 个已停止容器" -ForegroundColor Green
        } else {
            Write-Host "没有发现已停止的容器" -ForegroundColor Gray
        }
    } else {
        Write-Host "跳过清理步骤" -ForegroundColor Gray
    }

    # 3. 检查是否仍有运行中的用户容器
    Write-Host "`n3. 检查运行中的用户容器..." -ForegroundColor Cyan
    $runningContainers = docker ps --filter "name=claude-user-" --format "{{.ID}}|{{.Names}}|{{.Ports}}" 2>$null

    if ($runningContainers) {
        Write-Host "当前运行中的用户容器：" -ForegroundColor Yellow
        $runningContainers -split "`n" | ForEach-Object {
            $parts = $_ -split "\|"
            if ($parts.Count -ge 3) {
                Write-Host "  ID: $($parts[0]) | 名称: $($parts[1]) | 端口: $($parts[2])" -ForegroundColor White
            }
        }
        Write-Host "`n注意：这些容器正在运行中，请不要随意停止它们" -ForegroundColor Red
    }
}

# 4. 检查热备容器状态
Write-Host "`n4. 检查热备容器（warm pool）状态..." -ForegroundColor Cyan
$warmContainers = docker ps --filter "name=claude-worker-warm-" --format "{{.ID}}|{{.Names}}|{{.Status}}" 2>$null

if (-not $warmContainers) {
    Write-Host "未发现热备容器" -ForegroundColor Yellow
} else {
    Write-Host "热备容器列表：" -ForegroundColor Green
    $warmContainers -split "`n" | ForEach-Object {
        $parts = $_ -split "\|"
        if ($parts.Count -ge 3) {
            Write-Host "  ID: $($parts[0]) | 名称: $($parts[1]) | 状态: $($parts[2])" -ForegroundColor White
        }
    }
}

# 5. 重启 Master 服务（重新初始化热池）
Write-Host "`n5. 是否重启 Master 服务以重新初始化热池？(Y/N)" -ForegroundColor Yellow
$response2 = Read-Host

if ($response2 -eq 'Y' -or $response2 -eq 'y') {
    Write-Host "正在重启 Master 服务..." -ForegroundColor Cyan
    docker-compose restart master

    Write-Host "`n等待 Master 启动中..." -ForegroundColor Gray
    Start-Sleep -Seconds 5

    # 检查 Master 日志
    Write-Host "`nMaster 启动日志（最新20行）：" -ForegroundColor Cyan
    docker logs --tail 20 claw-web-master 2>&1 | Select-String -Pattern "ContainerOrchestrator|WarmPool|初始化|热池" -Context 0,2

    Write-Host "`n=== 清理完成 ===" -ForegroundColor Green
    Write-Host "现在应该可以正常创建用户容器了。" -ForegroundColor White
} else {
    Write-Host "`n=== 清理完成 ===" -ForegroundColor Green
    Write-Host "请手动重启 Master 服务以应用更改：docker-compose restart master" -ForegroundColor White
}

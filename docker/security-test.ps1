# Docker 安全配置测试脚本（PowerShell 版本）
# 用于验证生产环境的安全配置是否正确应用

param(
    [string]$ContainerName = "claude-backend-prod"
)

$COLOR_GREEN = "Green"
$COLOR_RED = "Red"
$COLOR_YELLOW = "Yellow"

function Write-TestResult {
    param(
        [string]$Status,
        [string]$Message
    )
    
    switch ($Status) {
        "Pass" { Write-Host "✓ 通过" -ForegroundColor $COLOR_GREEN -NoNewline }
        "Fail" { Write-Host "✗ 失败" -ForegroundColor $COLOR_RED -NoNewline }
        "Warn" { Write-Host "⚠ 警告" -ForegroundColor $COLOR_YELLOW -NoNewline }
    }
    
    Write-Host "：$Message"
}

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Docker 安全配置测试" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# 测试 1：验证容器是否以非 root 用户运行
Write-Host "测试 1：检查用户身份..." -ForegroundColor Cyan
try {
    $userName = docker exec $ContainerName whoami 2>$null
    if ($userName -eq "bun") {
        Write-TestResult -Status "Pass" -Message "容器以非 root 用户（bun）运行"
    } else {
        Write-TestResult -Status "Fail" -Message "容器用户是：$userName（应该是 bun）"
    }
} catch {
    Write-TestResult -Status "Fail" -Message "无法获取容器用户信息"
}
Write-Host ""

# 测试 2：验证无法提权
Write-Host "测试 2：测试提权..." -ForegroundColor Cyan
try {
    $sudoResult = docker exec $ContainerName sudo whoami 2>&1
    if ($sudoResult -like "*command not found*") {
        Write-TestResult -Status "Pass" -Message "sudo 命令不存在，无法提权"
    } else {
        Write-TestResult -Status "Warn" -Message "sudo 命令存在，请检查配置"
    }
} catch {
    Write-TestResult -Status "Pass" -Message "无法执行 sudo 命令"
}
Write-Host ""

# 测试 3：验证只读文件系统
Write-Host "测试 3：测试根文件系统..." -ForegroundColor Cyan
try {
    $touchResult = docker exec $ContainerName touch /test-file 2>&1
    if ($touchResult -like "*Read-only file system*") {
        Write-TestResult -Status "Pass" -Message "根文件系统为只读"
    } else {
        Write-TestResult -Status "Fail" -Message "根文件系统可写（应该启用 read_only: true）"
    }
} catch {
    Write-TestResult -Status "Fail" -Message "无法测试文件系统"
}
Write-Host ""

# 测试 4：验证临时文件系统
Write-Host "测试 4：测试临时文件系统..." -ForegroundColor Cyan
try {
    docker exec $ContainerName touch /tmp/test-file 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-TestResult -Status "Pass" -Message "可以写入 /tmp（tmpfs 配置正确）"
        docker exec $ContainerName rm -f /tmp/test-file 2>$null
    } else {
        Write-TestResult -Status "Fail" -Message "无法写入 /tmp（tmpfs 配置可能有问题）"
    }
} catch {
    Write-TestResult -Status "Fail" -Message "无法测试临时文件系统"
}
Write-Host ""

# 测试 5：验证 noexec 挂载
Write-Host "测试 5：测试 noexec 挂载..." -ForegroundColor Cyan
try {
    $execResult = docker exec $ContainerName sh -c "echo '#!/bin/sh' > /tmp/test.sh && chmod +x /tmp/test.sh && /tmp/test.sh" 2>&1
    if ($execResult -like "*Permission denied*" -or $execResult -like "*Exec format error*") {
        Write-TestResult -Status "Pass" -Message "/tmp 禁止执行（noexec 生效）"
    } else {
        Write-TestResult -Status "Warn" -Message "/tmp 可能未启用 noexec"
    }
    docker exec $ContainerName rm -f /tmp/test.sh 2>$null
} catch {
    Write-TestResult -Status "Warn" -Message "无法测试 noexec 挂载"
}
Write-Host ""

# 测试 6：验证能力配置
Write-Host "测试 6：检查 Docker 能力配置..." -ForegroundColor Cyan
try {
    $inspect = docker inspect $ContainerName 2>$null | ConvertFrom-Json
    $capDrop = $inspect[0].HostConfig.CapDrop -join ", "
    $capAdd = $inspect[0].HostConfig.CapAdd -join ", "
    
    if ($capDrop -like "*ALL*") {
        Write-TestResult -Status "Pass" -Message "CapDrop 包含 ALL"
    } else {
        Write-TestResult -Status "Fail" -Message "CapDrop 应该是 ALL（当前：$capDrop）"
    }
    
    if ($capAdd -like "*CHOWN*" -and $capAdd -like "*SETUID*") {
        Write-TestResult -Status "Pass" -Message "CapAdd 包含必需的能力"
    } else {
        Write-TestResult -Status "Warn" -Message "CapAdd 可能不完整（当前：$capAdd）"
    }
} catch {
    Write-TestResult -Status "Fail" -Message "无法获取 Docker 配置信息"
}
Write-Host ""

# 测试 7：验证 Seccomp 配置
Write-Host "测试 7：检查 Seccomp 配置..." -ForegroundColor Cyan
try {
    $inspect = docker inspect $ContainerName 2>$null | ConvertFrom-Json
    $securityOpt = $inspect[0].HostConfig.SecurityOpt -join ", "
    
    if ($securityOpt -like "*seccomp*") {
        Write-TestResult -Status "Pass" -Message "Seccomp 配置文件已应用"
    } else {
        Write-TestResult -Status "Warn" -Message "未检测到 Seccomp 配置文件"
    }
} catch {
    Write-TestResult -Status "Warn" -Message "无法获取 Seccomp 配置"
}
Write-Host ""

# 测试 8：验证资源限制
Write-Host "测试 8：检查资源限制..." -ForegroundColor Cyan
try {
    $inspect = docker inspect $ContainerName 2>$null | ConvertFrom-Json
    $memoryLimit = $inspect[0].HostConfig.Memory
    
    if ($memoryLimit -gt 0) {
        $memoryMB = [math]::Round($memoryLimit / 1MB, 2)
        Write-TestResult -Status "Pass" -Message "内存限制为 ${memoryMB}MB"
    } else {
        Write-TestResult -Status "Fail" -Message "未设置内存限制"
    }
    
    $cpuLimit = $inspect[0].HostConfig.NanoCpus
    if ($cpuLimit -gt 0) {
        $cpuCores = [math]::Round($cpuLimit / 1000000000, 2)
        Write-TestResult -Status "Pass" -Message "CPU 限制为 ${cpuCores} 核"
    } else {
        Write-TestResult -Status "Warn" -Message "未设置 CPU 限制"
    }
} catch {
    Write-TestResult -Status "Warn" -Message "无法获取资源限制配置"
}
Write-Host ""

# 测试 9：验证 PTY 功能
Write-Host "测试 9：测试 PTY 功能..." -ForegroundColor Cyan
try {
    $ptyResult = docker exec -it $ContainerName echo "PTY test" 2>$null
    if ($ptyResult -eq "PTY test") {
        Write-TestResult -Status "Pass" -Message "PTY 功能正常"
    } else {
        Write-TestResult -Status "Warn" -Message "PTY 功能可能有问题"
    }
} catch {
    Write-TestResult -Status "Warn" -Message "无法测试 PTY 功能"
}
Write-Host ""

# 测试 10：验证健康检查
Write-Host "测试 10：检查健康状态..." -ForegroundColor Cyan
try {
    $inspect = docker inspect $ContainerName 2>$null | ConvertFrom-Json
    $healthStatus = $inspect[0].State.Health.Status
    
    if ($healthStatus -eq "healthy") {
        Write-TestResult -Status "Pass" -Message "容器健康状态正常"
    } elseif ($healthStatus -eq "starting") {
        Write-TestResult -Status "Warn" -Message "容器正在启动中"
    } else {
        Write-TestResult -Status "Fail" -Message "容器健康状态：$healthStatus"
    }
} catch {
    Write-TestResult -Status "Fail" -Message "无法获取健康状态"
}
Write-Host ""

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "测试完成" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "说明：" -ForegroundColor White
Write-Host "  ✓ 通过 - 安全配置正确应用" -ForegroundColor $COLOR_GREEN
Write-Host "  ⚠ 警告 - 配置可能不完整，但不影响安全" -ForegroundColor $COLOR_YELLOW
Write-Host "  ✗ 失败 - 需要修复的安全配置问题" -ForegroundColor $COLOR_RED
Write-Host ""

# 测试 Worker 分配修复效果
# 验证一个用户只对应一个 Worker 容器

Write-Host "====================================="
Write-Host "  测试 Worker 分配修复效果"
Write-Host "=====================================`n"

# 模拟用户多次请求
$testUserId = "test-user-$(Get-Random)"
Write-Host "测试用户 ID: $testUserId`n"

# 第一次请求
Write-Host "1. 第一次请求（创建容器）..."
$token = "internal-master-worker-token-2024"
$body = @{
    type = "assign"
    userId = $testUserId
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/internal/assign" -Method POST -Body $body -ContentType "application/json" -Headers @{ "X-Master-Token" = $token } -UseBasicParsing
    Write-Host "   成功：分配容器"
    $result = $response.Content | ConvertFrom-Json
    $containerName = $result.data.container.containerName
    Write-Host "   容器：$containerName`n"
} catch {
    Write-Host "   失败：$($_.Exception.Message)`n"
}

# 等待容器启动
Start-Sleep -Seconds 3

# 第二次请求
Write-Host "2. 第二次请求（应该复用已有容器）..."
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/internal/assign" -Method POST -Body $body -ContentType "application/json" -Headers @{ "X-Master-Token" = $token } -UseBasicParsing
    Write-Host "   成功：分配容器"
    $result = $response.Content | ConvertFrom-Json
    $containerName2 = $result.data.container.containerName
    Write-Host "   容器：$containerName2"
    
    if ($containerName -eq $containerName2) {
        Write-Host "   ✅ 正确：复用了同一个容器`n"
    } else {
        Write-Host "   ❌ 错误：创建了新的容器！`n"
    }
} catch {
    Write-Host "   失败：$($_.Exception.Message)`n"
}

# 第三次请求
Write-Host "3. 第三次请求（应该继续复用）..."
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/internal/assign" -Method POST -Body $body -ContentType "application/json" -Headers @{ "X-Master-Token" = $token } -UseBasicParsing
    Write-Host "   成功：分配容器"
    $result = $response.Content | ConvertFrom-Json
    $containerName3 = $result.data.container.containerName
    Write-Host "   容器：$containerName3"
    
    if ($containerName -eq $containerName3) {
        Write-Host "   ✅ 正确：复用了同一个容器`n"
    } else {
        Write-Host "   ❌ 错误：创建了新的容器！`n"
    }
} catch {
    Write-Host "   失败：$($_.Exception.Message)`n"
}

# 检查 Docker 中该用户的容器数量
Write-Host "4. 检查 Docker 中的容器数量..."
$containers = docker ps --filter "name=$testUserId" --format "{{.Names}}"
$containerCount = ($containers | Measure-Object).Count
Write-Host "   容器数量：$containerCount"

if ($containerCount -eq 1) {
    Write-Host "   ✅ 正确：只有一个容器`n"
} else {
    Write-Host "   ❌ 错误：有 $containerCount 个容器`n"
}

Write-Host "====================================="
Write-Host "  测试完成"
Write-Host "====================================="

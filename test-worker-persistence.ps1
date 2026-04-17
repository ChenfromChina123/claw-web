# 测试 Docker 重启后 Worker 分配持久化
# 验证数据库持久化功能正常工作

Write-Host "====================================="
Write-Host "  测试 Worker 分配持久化功能"
Write-Host "=====================================`n"

# 设置变量
$userId = "test-persist-$(Get-Random)"
$apiUrl = "http://localhost:13000"
$authToken = "Bearer test-token"

Write-Host "测试用户 ID: $userId`n"

# 步骤 1: 创建会话（分配容器）
Write-Host "1. 创建会话（分配 Worker 容器）..."
try {
    $body = @{
        userId = $userId
        title = "持久化测试"
    } | ConvertTo-Json
    
    $response = Invoke-WebRequest -Uri "$apiUrl/api/sessions" -Method POST -Body $body -ContentType "application/json" -Headers @{ "Authorization" = $authToken } -UseBasicParsing
    $session = $response.Content | ConvertFrom-Json
    Write-Host "   成功：创建会话 $($session.data.id)"
    Write-Host "   容器：$($session.data.workerInfo.containerId)`n"
    $containerId = $session.data.workerInfo.containerId
} catch {
    Write-Host "   失败：$($_.Exception.Message)"
    Write-Host "   跳过后续测试`n"
    exit 1
}

# 步骤 2: 检查数据库
Write-Host "2. 检查数据库中的映射记录..."
try {
    $result = mysql -h 127.0.0.1 -P 23306 -u clawuser -pclawpass2024 claw_web -N -e "SELECT COUNT(*) FROM user_worker_mappings WHERE user_id = '$userId'"
    $count = [int]$result.Trim()
    Write-Host "   数据库记录数：$count"
    
    if ($count -eq 1) {
        Write-Host "   ✅ 正确：数据库中有映射记录`n"
    } else {
        Write-Host "   ❌ 错误：数据库中没有映射记录`n"
    }
} catch {
    Write-Host "   无法检查数据库：$($_.Exception.Message)`n"
}

# 步骤 3: 重启 Master
Write-Host "3. 重启 Master 容器..."
docker restart claw-web-master
Start-Sleep -Seconds 10
Write-Host "   Master 已重启`n"

# 步骤 4: 再次创建会话（应该复用已有容器）
Write-Host "4. 再次创建会话（测试数据库恢复）..."
try {
    $body = @{
        userId = $userId
        title = "持久化测试 2"
    } | ConvertTo-Json
    
    $response = Invoke-WebRequest -Uri "$apiUrl/api/sessions" -Method POST -Body $body -ContentType "application/json" -Headers @{ "Authorization" = $authToken } -UseBasicParsing
    $session2 = $response.Content | ConvertFrom-Json
    Write-Host "   成功：创建会话 $($session2.data.id)"
    Write-Host "   容器：$($session2.data.workerInfo.containerId)"
    
    if ($session2.data.workerInfo.containerId -eq $containerId) {
        Write-Host "   ✅ 正确：复用了同一个容器（持久化成功）`n"
    } else {
        Write-Host "   ❌ 错误：创建了新的容器（持久化失败）`n"
    }
} catch {
    Write-Host "   失败：$($_.Exception.Message)`n"
}

# 步骤 5: 检查数据库记录数
Write-Host "5. 检查数据库中的总记录数..."
try {
    $result = mysql -h 127.0.0.1 -P 23306 -u clawuser -pclawpass2024 claw_web -N -e "SELECT COUNT(*) FROM user_worker_mappings"
    $totalCount = [int]$result.Trim()
    Write-Host "   总记录数：$totalCount"
    
    if ($totalCount -eq 1) {
        Write-Host "   ✅ 正确：只有一个映射记录`n"
    } else {
        Write-Host "   ⚠️  注意：有 $totalCount 个记录`n"
    }
} catch {
    Write-Host "   无法检查数据库：$($_.Exception.Message)`n"
}

Write-Host "====================================="
Write-Host "  测试完成"
Write-Host "====================================="

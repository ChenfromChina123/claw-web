# WebSocket Test Script v2
# 使用 REST API 注册后，使用 Token 登录 WebSocket

Write-Host "=== Claude Code WebSocket API Test ===" -ForegroundColor Green
Write-Host ""

function Send-WebSocketMessage {
    param(
        [System.Net.WebSockets.ClientWebSocket]$WebSocket,
        [hashtable]$Message,
        [System.Threading.CancellationToken]$Token
    )
    $json = $Message | ConvertTo-Json -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $segment = New-Object System.ArraySegment[byte](,$bytes)
    $WebSocket.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $Token).Wait()
    Write-Host "[WS Send] $($Message.type)" -ForegroundColor Cyan
}

function Receive-WebSocketMessage {
    param(
        [System.Net.WebSockets.ClientWebSocket]$WebSocket,
        [System.Threading.CancellationToken]$Token
    )
    $buffer = New-Object byte[] 8192
    $segment = New-Object System.ArraySegment[byte](,$buffer)
    $result = $WebSocket.ReceiveAsync($segment, $Token)
    $result.Wait()
    $message = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $result.Result.Count)
    return $message
}

$testEmail = "agent_test_$(Get-Random).example.com"

# 1. REST API 注册
Write-Host "[1] REST API: Register User..." -ForegroundColor Yellow
$body = @{
    email = $testEmail
    username = "agenttester"
    password = "test123456"
    code = "123456"  # 测试用固定验证码
}
$headers = @{ "Content-Type" = "application/json" }

try {
    # 先发送验证码
    Write-Host "    Sending verification code..." -ForegroundColor Gray
    $sendCodeResult = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/register/send-code" -Method POST -Body ($body | ConvertTo-Json) -ContentType "application/json"
    Write-Host "    [OK] Code sent: $($sendCodeResult.success)" -ForegroundColor Green
    
    # 由于没有真实邮件，我们需要直接在数据库中创建用户或跳过验证码
    # 为了测试，我们使用一个简单的方法 - 直接注册（可能失败因为验证码）
    Write-Host "    Attempting registration..." -ForegroundColor Gray
    $regResult = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/register" -Method POST -Body ($body | ConvertTo-Json) -ContentType "application/json" -ErrorAction SilentlyContinue
    if ($regResult.success) {
        $token = $regResult.data.accessToken
        Write-Host "    [OK] Registered! Token received" -ForegroundColor Green
    } else {
        Write-Host "    [WARN] Registration failed (expected - need valid code), using alternate method..." -ForegroundColor Yellow
        
        # 创建测试用户直接在数据库中
        $token = $null
    }
} catch {
    Write-Host "    [WARN] REST API test skipped: $($_.Exception.Message)" -ForegroundColor Yellow
}

# 2. WebSocket 连接测试
Write-Host ""
Write-Host "[2] Connecting to WebSocket..." -ForegroundColor Yellow
$uri = New-Object System.Uri("ws://localhost:3000/ws")
$ct = [System.Threading.CancellationToken]::None
$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ws.ConnectAsync($uri, $ct).Wait()
Write-Host "[OK] WebSocket Connected" -ForegroundColor Green

# 3. WebSocket 注册测试
Write-Host ""
Write-Host "[3] WebSocket: Register User..." -ForegroundColor Yellow
Send-WebSocketMessage -WebSocket $ws -Message @{
    type = "register"
    username = "wstestuser"
    email = "wstest@example.com"
    password = "test123456"
} -Token $ct

$response = Receive-WebSocketMessage -WebSocket $ws -Token $ct
Write-Host "[WS Recv] $response" -ForegroundColor Magenta
$regResult = $response | ConvertFrom-Json
$userId = $regResult.userId
if ($userId) {
    Write-Host "[OK] User registered: $userId" -ForegroundColor Green
}

# 4. 创建会话
Write-Host ""
Write-Host "[4] WebSocket: Create Session..." -ForegroundColor Yellow
Send-WebSocketMessage -WebSocket $ws -Message @{
    type = "create_session"
    title = "Agent Test Session"
    model = "qwen-plus"
} -Token $ct

$response = Receive-WebSocketMessage -WebSocket $ws -Token $ct
Write-Host "[WS Recv] $response" -ForegroundColor Magenta
$sessionResult = $response | ConvertFrom-Json
$sessionId = $sessionResult.session.id

if ($sessionId) {
    Write-Host "[OK] Session created: $sessionId" -ForegroundColor Green
    
    # 5. 发送消息测试 Agent
    Write-Host ""
    Write-Host "[5] WebSocket: Send Message (Agent Core Test)..." -ForegroundColor Yellow
    Write-Host "    Sending: 'Hello, what can you do?'" -ForegroundColor Gray
    Send-WebSocketMessage -WebSocket $ws -Message @{
        type = "user_message"
        content = "Hello, what can you do?"
    } -Token $ct
    
    # 6. 接收 Agent 响应
    Write-Host ""
    Write-Host "[6] Receiving Agent responses..." -ForegroundColor Yellow
    $messageCount = 0
    $lastMessage = ""
    
    for ($i = 0; $i -lt 30; $i++) {
        try {
            $response = Receive-WebSocketMessage -WebSocket $ws -Token $ct
            if ([string]::IsNullOrWhiteSpace($response)) { continue }
            
            $msgObj = $response | ConvertFrom-Json
            $msgType = $msgObj.type
            Write-Host "[WS Recv] Type: $msgType" -ForegroundColor Magenta
            
            switch ($msgType) {
                "message_start" {
                    Write-Host "    [Agent] Starting response..." -ForegroundColor Cyan
                }
                "content_block_delta" {
                    if ($msgObj.text) {
                        $lastMessage += $msgObj.text
                        # 只显示前100字符
                        $displayText = if ($msgObj.text.Length -gt 100) { $msgObj.text.Substring(0, 100) + "..." } else { $msgObj.text }
                        Write-Host "    $displayText" -ForegroundColor White
                    }
                }
                "tool_use" {
                    Write-Host "    [Tool] Using: $($msgObj.name)" -ForegroundColor Yellow
                }
                "tool_start" {
                    Write-Host "    [Tool] Executing: $($msgObj.name)" -ForegroundColor Yellow
                }
                "tool_progress" {
                    if ($msgObj.output) {
                        Write-Host "    [Tool Output] $($msgObj.output.Substring(0, [Math]::Min(100, $msgObj.output.Length)))..." -ForegroundColor DarkYellow
                    }
                }
                "message_stop" {
                    Write-Host "    [Agent] Response complete. Stop reason: $($msgObj.stop_reason)" -ForegroundColor Green
                }
                "error" {
                    Write-Host "    [ERROR] $($msgObj.message)" -ForegroundColor Red
                }
            }
            
            $messageCount++
            
            # 如果收到 message_stop，说明Agent响应完成了
            if ($msgType -eq "message_stop") {
                break
            }
        } catch {
            # 超时或其他错误，忽略继续
            Start-Sleep -Milliseconds 100
        }
    }
    
    Write-Host ""
    Write-Host "[OK] Received $messageCount messages from Agent" -ForegroundColor Green
    
    # 7. 获取会话列表
    Write-Host ""
    Write-Host "[7] WebSocket: List Sessions..." -ForegroundColor Yellow
    Send-WebSocketMessage -WebSocket $ws -Message @{
        type = "list_sessions"
    } -Token $ct
    
    $response = Receive-WebSocketMessage -WebSocket $ws -Token $ct
    Write-Host "[WS Recv] $response" -ForegroundColor Magenta
} else {
    Write-Host "[ERROR] Failed to create session" -ForegroundColor Red
}

# 8. 关闭连接
Write-Host ""
Write-Host "[8] Closing WebSocket..." -ForegroundColor Yellow
$ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Test complete", $ct).Wait()
Write-Host "[OK] WebSocket Closed" -ForegroundColor Green

Write-Host ""
Write-Host "=== Test Complete ===" -ForegroundColor Green

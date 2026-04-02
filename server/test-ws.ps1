# WebSocket Test Script
# 使用方法: 保存为 test-ws.ps1 并运行

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

Write-Host "=== Claude Code WebSocket API Test ===" -ForegroundColor Green
Write-Host ""

$uri = New-Object System.Uri("ws://localhost:3000/ws")
$ct = [System.Threading.CancellationToken]::None

try {
    # 连接 WebSocket
    Write-Host "[1] Connecting to WebSocket..." -ForegroundColor Yellow
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ws.ConnectAsync($uri, $ct).Wait()
    Write-Host "[OK] WebSocket Connected" -ForegroundColor Green
    
    # 测试 1: 注册新用户
    Write-Host ""
    Write-Host "[2] Testing User Registration..." -ForegroundColor Yellow
    Send-WebSocketMessage -WebSocket $ws -Message @{
        type = "register"
        username = "testuser"
        email = "testuser@example.com"
        password = "test123456"
    } -Token $ct
    
    $response = Receive-WebSocketMessage -WebSocket $ws -Token $ct
    Write-Host "[WS Recv] $response" -ForegroundColor Magenta
    
    # 测试 2: 登录
    Write-Host ""
    Write-Host "[3] Testing User Login..." -ForegroundColor Yellow
    Send-WebSocketMessage -WebSocket $ws -Message @{
        type = "login"
        email = "testuser@example.com"
        password = "test123456"
    } -Token $ct
    
    $response = Receive-WebSocketMessage -WebSocket $ws -Token $ct
    Write-Host "[WS Recv] $response" -ForegroundColor Magenta
    
    # 提取 userId
    $loginResult = $response | ConvertFrom-Json
    $userId = $loginResult.userId
    if ($userId) {
        Write-Host "[OK] Logged in as userId: $userId" -ForegroundColor Green
        
        # 测试 3: 创建会话
        Write-Host ""
        Write-Host "[4] Testing Create Session..." -ForegroundColor Yellow
        Send-WebSocketMessage -WebSocket $ws -Message @{
            type = "create_session"
            title = "Test Session"
            model = "qwen-plus"
        } -Token $ct
        
        $response = Receive-WebSocketMessage -WebSocket $ws -Token $ct
        Write-Host "[WS Recv] $response" -ForegroundColor Magenta
        
        $sessionResult = $response | ConvertFrom-Json
        $sessionId = $sessionResult.session.id
        
        if ($sessionId) {
            Write-Host "[OK] Session created: $sessionId" -ForegroundColor Green
            
            # 测试 4: 发送消息
            Write-Host ""
            Write-Host "[5] Testing Send Message (Agent Test)..." -ForegroundColor Yellow
            Send-WebSocketMessage -WebSocket $ws -Message @{
                type = "message"
                content = "Hello, this is a test message"
            } -Token $ct
            
            # 接收多个响应
            for ($i = 0; $i -lt 10; $i++) {
                $response = Receive-WebSocketMessage -WebSocket $ws -Token $ct
                $msgObj = $response | ConvertFrom-Json
                Write-Host "[WS Recv] Type: $($msgObj.type)" -ForegroundColor Magenta
                
                # 打印关键信息
                if ($msgObj.type -eq "content_block_delta" -and $msgObj.text) {
                    Write-Host "    Text: $($msgObj.text)" -ForegroundColor White
                }
                if ($msgObj.type -eq "message_stop") {
                    Write-Host "[OK] Message completed, stop_reason: $($msgObj.stop_reason)" -ForegroundColor Green
                    break
                }
            }
            
            # 测试 5: 获取会话列表
            Write-Host ""
            Write-Host "[6] Testing List Sessions..." -ForegroundColor Yellow
            Send-WebSocketMessage -WebSocket $ws -Message @{
                type = "list_sessions"
            } -Token $ct
            
            $response = Receive-WebSocketMessage -WebSocket $ws -Token $ct
            Write-Host "[WS Recv] $response" -ForegroundColor Magenta
        }
    }
    
    # 关闭连接
    Write-Host ""
    Write-Host "[7] Closing WebSocket..." -ForegroundColor Yellow
    $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Test complete", $ct).Wait()
    Write-Host "[OK] WebSocket Closed" -ForegroundColor Green
    
} catch {
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Test Complete ===" -ForegroundColor Green

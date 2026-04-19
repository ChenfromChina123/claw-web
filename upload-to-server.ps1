# Claw-Web Docker 镜像上传脚本
# 使用方法：.\upload-to-server.ps1

$serverHost = "8.163.46.149"
$serverUser = "root"
$serverPath = "/opt"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Claw-Web Docker 镜像上传工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查文件是否存在
$zipFile = "claw-web-images.zip"
$tarFile = "claw-web-images.tar"

if (-not (Test-Path $zipFile)) {
    Write-Host "错误：找不到 $zipFile" -ForegroundColor Red
    Write-Host "正在创建镜像备份..." -ForegroundColor Yellow
    
    docker save claw-web-master:latest claw-web-frontend:latest claw-web-backend-worker:latest -o $tarFile
    
    if (Test-Path $tarFile) {
        Write-Host "正在压缩镜像..." -ForegroundColor Yellow
        Compress-Archive -Path $tarFile -DestinationPath $zipFile -Force
    }
}

if (-not (Test-Path $zipFile)) {
    Write-Host "错误：无法创建镜像文件" -ForegroundColor Red
    exit 1
}

$fileSize = (Get-Item $zipFile).Length / 1MB
Write-Host "✓ 镜像文件：$zipFile ($([math]::Round($fileSize, 2)) MB)" -ForegroundColor Green
Write-Host ""

# 上传文件
Write-Host "开始上传到 $serverUser@$serverHost:$serverPath" -ForegroundColor Yellow
Write-Host ""

try {
    scp $zipFile "$serverUser@$serverHost`:$serverPath/"
    
    Write-Host ""
    Write-Host "✓ 镜像上传成功！" -ForegroundColor Green
    Write-Host ""
    Write-Host "下一步操作：" -ForegroundColor Cyan
    Write-Host "1. SSH 登录服务器：ssh $serverUser@$serverHost" -ForegroundColor White
    Write-Host "2. 解压镜像：cd $serverPath && unzip $zipFile" -ForegroundColor White
    Write-Host "3. 加载镜像：docker load -i claw-web-images.tar" -ForegroundColor White
    Write-Host "4. 启动服务：cd /opt/claw-web && docker-compose up -d" -ForegroundColor White
    Write-Host ""
} catch {
    Write-Host "错误：上传失败" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

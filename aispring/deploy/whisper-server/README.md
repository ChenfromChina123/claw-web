# Whisper Server Linux 部署指南

本文档提供了在 Linux 服务器上部署 Whisper 语音识别服务的多种方式。

## 方式一：一键部署脚本

```bash
# 下载并执行部署脚本
curl -fsSL https://your-server/deploy-whisper-linux.sh | bash

# 或者手动下载后执行
wget https://your-server/deploy-whisper-linux.sh
chmod +x deploy-whisper-linux.sh
sudo ./deploy-whisper-linux.sh
```

部署完成后，服务将自动启动并监听 `http://0.0.0.0:8090/inference`

## 方式二：手动部署

### 1. 安装依赖

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y wget curl

# CentOS/RHEL
sudo yum install -y wget curl
```

### 2. 下载 Whisper.cpp

```bash
# 创建目录
sudo mkdir -p /opt/whisper-server/models
cd /opt/whisper-server

# 下载预编译版本 (x86_64)
sudo wget https://github.com/ggerganov/whisper.cpp/releases/download/v1.7.4/whisper-linux-x64.tar.gz
sudo tar -xzf whisper-linux-x64.tar.gz
sudo mv whisper-linux-x64/* .
sudo rm -rf whisper-linux-x64 whisper-linux-x64.tar.gz

# 添加执行权限
sudo chmod +x whisper-server
```

### 3. 下载模型

```bash
# 下载 base.en 模型 (推荐，平衡速度和准确度)
sudo wget -O models/ggml-base.en.bin \
    https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin

# 其他可选模型:
# tiny.en    - 最快，准确度较低 (~75MB)
# small.en   - 较快，准确度中等 (~466MB)
# medium.en  - 较慢，准确度较高 (~1.5GB)
# large-v3   - 最慢，准确度最高 (~3GB)
```

### 4. 创建 systemd 服务

```bash
# 复制服务文件
sudo cp whisper-server.service /etc/systemd/system/

# 创建日志目录
sudo mkdir -p /var/log/whisper-server

# 创建专用用户
sudo useradd -r -s /bin/false whisper
sudo chown -R whisper:whisper /opt/whisper-server
sudo chown -R whisper:whisper /var/log/whisper-server

# 启用并启动服务
sudo systemctl daemon-reload
sudo systemctl enable whisper-server
sudo systemctl start whisper-server
```

### 5. 验证服务

```bash
# 检查服务状态
sudo systemctl status whisper-server

# 测试 API
curl -X POST -F "file=@test.wav" http://localhost:8090/inference
```

## 方式三：Docker 部署

### 使用 Docker Compose (推荐)

```bash
# 进入部署目录
cd deploy/whisper-server

# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 使用 Docker 命令

```bash
# 构建镜像
docker build -t whisper-server:latest .

# 运行容器
docker run -d \
    --name whisper-server \
    --restart unless-stopped \
    -p 8090:8090 \
    -e WHISPER_MODEL=base.en \
    -e WHISPER_THREADS=4 \
    whisper-server:latest

# 查看日志
docker logs -f whisper-server
```

## 配置说明

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `WHISPER_PORT` | 8090 | 服务监听端口 |
| `WHISPER_MODEL` | base.en | 使用的模型 |
| `WHISPER_THREADS` | 4 | 处理线程数 |
| `WHISPER_HOST` | 0.0.0.0 | 监听地址 |

### 命令行参数

```bash
./whisper-server [options]

常用选项:
  -m FNAME, --model FNAME     模型路径 (默认: models/ggml-base.en.bin)
  --port PORT                 服务端口 (默认: 8080)
  --host HOST                 监听地址 (默认: 127.0.0.1)
  -t N, --threads N           线程数 (默认: 4)
  -l LANG, --language LANG    语言代码 (默认: en, 可选: zh, auto)
  --no-gpu                    禁用 GPU 加速
```

## 防火墙配置

```bash
# Ubuntu (UFW)
sudo ufw allow 8090/tcp

# CentOS (firewalld)
sudo firewall-cmd --permanent --add-port=8090/tcp
sudo firewall-cmd --reload
```

## API 使用示例

### Python

```python
import requests

url = "http://localhost:8090/inference"
files = {"file": open("audio.wav", "rb")}

response = requests.post(url, files=files)
result = response.json()
print(result["text"])
```

### cURL

```bash
curl -X POST -F "file=@audio.wav" http://localhost:8090/inference
```

### Java (Spring Boot)

```java
RestTemplate restTemplate = new RestTemplate();
MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
body.add("file", new ByteArrayResource(Files.readAllBytes(audioPath)) {
    @Override
    public String getFilename() {
        return "audio.wav";
    }
});

HttpHeaders headers = new HttpHeaders();
headers.setContentType(MediaType.MULTIPART_FORM_DATA);

ResponseEntity<String> response = restTemplate.postForEntity(
    "http://localhost:8090/inference",
    new HttpEntity<>(body, headers),
    String.class
);
```

## 故障排除

### 服务无法启动

```bash
# 检查日志
journalctl -u whisper-server -n 50

# 检查端口占用
netstat -tlnp | grep 8090

# 检查模型文件
ls -la /opt/whisper-server/models/
```

### 识别结果为空

1. 检查音频格式 (推荐 WAV, 16kHz, 单声道)
2. 尝试使用更大的模型
3. 检查音频是否有有效内容

### 性能优化

1. 使用 GPU 加速 (需要 CUDA)
2. 增加线程数
3. 使用更小的模型 (tiny/small)

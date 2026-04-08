# Whisper.cpp Server Dockerfile
# 用于构建 Whisper 语音识别服务的 Docker 镜像

FROM ubuntu:22.04

LABEL maintainer="AI Tutor System"
LABEL description="Whisper.cpp Speech Recognition Server"

# 设置环境变量
ENV DEBIAN_FRONTEND=noninteractive
ENV WHISPER_PORT=8090
ENV WHISPER_MODEL=base.en
ENV WHISPER_THREADS=4

# 安装依赖
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 创建工作目录
WORKDIR /app

# 下载预编译的 whisper.cpp (x86_64)
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then \
        WHISPER_ARCH="x64"; \
    elif [ "$ARCH" = "aarch64" ]; then \
        WHISPER_ARCH="arm64"; \
    fi && \
    wget -q https://github.com/ggerganov/whisper.cpp/releases/download/v1.7.4/whisper-linux-${WHISPER_ARCH}.tar.gz -O whisper.tar.gz && \
    tar -xzf whisper.tar.gz && \
    mv whisper-linux-${WHISPER_ARCH}/* /app/ && \
    rm -rf whisper.tar.gz whisper-linux-${WHISPER_ARCH} && \
    chmod +x /app/whisper-server

# 创建模型目录
RUN mkdir -p /app/models

# 下载默认模型
RUN wget -q https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin \
    -O /app/models/ggml-base.en.bin

# 创建启动脚本
RUN echo '#!/bin/bash\n\
exec /app/whisper-server \\\n\
    -m /app/models/ggml-${WHISPER_MODEL}.bin \\\n\
    --port ${WHISPER_PORT} \\\n\
    --host 0.0.0.0 \\\n\
    -t ${WHISPER_THREADS}\n\
' > /app/start.sh && chmod +x /app/start.sh

# 暴露端口
EXPOSE ${WHISPER_PORT}

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:${WHISPER_PORT}/ || exit 1

# 启动服务
CMD ["/app/start.sh"]

# 多阶段构建 - Spring Boot 应用 Dockerfile
# 阶段1: 构建应用
FROM maven:3.9-eclipse-temurin-17-alpine AS builder

WORKDIR /app

# 先复制 pom.xml 以利用 Docker 缓存
COPY pom.xml .
# 下载依赖（利用层缓存）
RUN mvn dependency:go-offline -B

# 复制源代码并构建
COPY src ./src
RUN mvn clean package -DskipTests -B

# 阶段2: 生产镜像（最小化镜像体积）
FROM eclipse-temurin:17-jre-alpine

LABEL maintainer="AI Study Project"
LABEL description="AI Smart Tutor - Spring Boot Application"

# 安装必要工具
RUN apk add --no-cache tzdata curl

# 设置时区
ENV TZ=Asia/Shanghai

WORKDIR /app

# 从构建阶段复制 JAR 包
COPY --from=builder /app/target/*.jar app.jar

# 创建数据目录
RUN mkdir -p /app/data/logs /app/data/cloud_disk /app/data/avatars

# 暴露端口
EXPOSE 5000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

# JVM 优化参数（针对容器环境）
ENV JAVA_OPTS="-Xms256m -Xmx512m -XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0"

# 启动命令
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]

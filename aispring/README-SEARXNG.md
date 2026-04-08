# SearXNG 本地部署指南

## 为什么需要本地 SearXNG？

公共 SearXNG 实例有严格的速率限制，从中国访问也可能被限制。为了保证联网搜索功能的稳定性，建议部署本地 SearXNG 实例。

## 快速部署（Docker）

### 前置要求

- Docker Desktop for Windows（已安装并运行）
- Docker Compose（Docker Desktop 自带）

### 部署步骤

1. **启动 Docker Desktop**
   - 在 Windows 上启动 Docker Desktop 应用程序
   - 等待 Docker Desktop 完全启动（系统托盘图标变为绿色）

2. **启动 SearXNG 服务**
   ```bash
   cd d:\Users\Administrator\AistudyProject\new_pro\ai-tutor-system\aispring
   docker-compose up -d
   ```

3. **验证部署**
   - 打开浏览器访问：http://localhost:8080
   - 测试搜索：http://localhost:8080/search?q=test&format=json

4. **查看日志**
   ```bash
   docker logs -f searxng
   ```

5. **停止服务**
   ```bash
   docker-compose down
   ```

## 配置文件说明

### docker-compose.yml

- 使用官方 SearXNG 镜像
- 映射端口 8080:8080
- 挂载配置文件到容器

### searxng-config/settings.yml

- **use_default_settings**: true - 使用默认设置
- **server.limiter**: false - 禁用速率限制（本地使用）
- **engines**: 启用了多个搜索引擎
  - Bing
  - Google
  - DuckDuckGo
  - Brave

## 后端配置

后端代码已配置为优先使用本地 SearXNG 实例（http://localhost:8080/search），如果本地实例不可用，会自动尝试公共实例。

## 故障排查

### 1. Docker Desktop 无法启动

**问题**: Docker Desktop 启动失败或卡在启动界面

**解决**:
- 确保 Windows Hyper-V 功能已启用
- 重启 Docker Desktop
- 检查 Windows 事件查看器中的错误日志

### 2. 端口 8080 被占用

**问题**: 启动时提示端口 8080 已被占用

**解决**:
```bash
# 查看占用端口的进程
netstat -ano | findstr :8080

# 停止占用端口的进程，或修改 docker-compose.yml 使用其他端口
```

### 3. SearXNG 容器不断重启

**问题**: 容器启动后立即退出或不断重启

**解决**:
```bash
# 查看详细日志
docker logs searxng

# 检查配置文件语法
docker-compose down
docker-compose up
```

### 4. 搜索返回空结果

**问题**: SearXNG 返回空结果或 429 错误

**解决**:
- 检查网络连接
- 等待几分钟后重试（可能被搜索引擎限流）
- 查看日志确认具体错误

## 性能优化建议

1. **增加内存限制**（可选）
   在 docker-compose.yml 中添加：
   ```yaml
   services:
     searxng:
       deploy:
         resources:
           limits:
             memory: 2G
   ```

2. **持久化缓存**（可选）
   添加缓存卷以提高性能：
   ```yaml
   volumes:
     - searxng-cache:/var/cache/searxng
   volumes:
     searxng-cache:
   ```

3. **启用 Redis 缓存**（高级）
   参考 SearXNG 官方文档配置 Redis 缓存

## 安全建议

1. **修改 SECRET_KEY**
   - 修改 docker-compose.yml 中的 `SEARXNG_SECRET_KEY`
   - 使用强随机字符串

2. **限制访问**（生产环境）
   - 使用防火墙限制访问 IP
   - 配置 Nginx 反向代理
   - 启用 HTTPS

## 参考链接

- [SearXNG 官方文档](https://docs.searxng.org/)
- [SearXNG GitHub](https://github.com/searxng/searxng)
- [Docker Hub](https://hub.docker.com/r/searxng/searxng)

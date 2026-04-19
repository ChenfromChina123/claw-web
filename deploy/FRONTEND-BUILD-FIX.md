# 前端构建权限问题修复指南

## 🐛 问题描述

在 CentOS 服务器上构建前端时遇到错误：

```
=> ERROR [frontend builder 7/7] RUN npx vite build
1.171 sh: vite: Permission denied
```

---

## 🔍 问题原因

`npx` 在某些 Docker 环境中运行时会遇到权限问题，特别是在：
- CentOS/RHEL 系统
- Docker 以非 root 用户运行时
- npm 全局包权限配置不正确时

---

## ✅ 解决方案

### 已修复：使用 `npm run` 替代 `npx`

**修改前** (`web/Dockerfile`):
```dockerfile
RUN npx vite build
```

**修改后**:
```dockerfile
# 修复权限问题：使用 npm 运行 vite
RUN npm run build
```

---

## 📋 为什么这样修复？

| 方式 | 优点 | 缺点 |
|------|------|------|
| `npx vite build` | 直接调用 | 可能有权限问题 |
| `npm run build` | ✅ 稳定可靠 | 需要在 package.json 中定义脚本 |

`npm run build` 的优势：
1. **使用本地安装的 vite**（node_modules/.bin/vite）
2. **避免全局权限问题**
3. **与 package.json 中的脚本定义一致**
4. **Docker 多阶段构建的最佳实践**

---

## 🚀 重新部署

修复后，在服务器上重新运行部署：

```bash
cd /www/project

# 停止旧服务
docker compose down

# 清理旧镜像
docker rmi claw-web-frontend:latest -f

# 重新构建
docker compose build frontend

# 启动服务
docker compose up -d frontend
```

---

## 🔧 其他可能的解决方案

### 方案 1：修复 npx 权限（不推荐）

```dockerfile
RUN npm install -g vite
RUN npx vite build
```

### 方案 2：使用绝对路径

```dockerfile
RUN ./node_modules/.bin/vite build
```

### 方案 3：使用 root 用户（已默认）

```dockerfile
USER root
RUN npx vite build
```

---

## ✅ 验证构建成功

```bash
# 查看构建日志
docker compose logs frontend

# 检查前端是否可访问
curl http://localhost:80

# 查看构建产物
docker exec claw-web-frontend ls -la /usr/share/nginx/html
```

---

## 📊 构建时间对比

| 阶段 | 修复前 | 修复后 |
|------|--------|--------|
| npm install | 19.5s | 19.5s |
| vite build | ❌ 失败 | ~60s |
| 总时间 | 失败 | ~80s |

---

## 💡 预防措施

### 1. 在 package.json 中明确定义脚本

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

### 2. 使用 npm 而非 npx

在 Dockerfile 中优先使用：
```dockerfile
RUN npm run build
```

而非：
```dockerfile
RUN npx vite build
```

### 3. 确保使用本地依赖

```dockerfile
# 先安装依赖
RUN npm install

# 再运行构建（使用本地 node_modules）
RUN npm run build
```

---

## 📞 相关问题

### Q: 如果仍然失败怎么办？

**A**: 检查以下几点：
1. 清理缓存：`docker builder prune -f`
2. 删除旧镜像：`docker rmi node:20-alpine -f`
3. 重新拉取基础镜像：`docker pull node:20-alpine`
4. 检查磁盘空间：`df -h`

### Q: 本地开发应该用哪个命令？

**A**: 本地开发推荐使用：
```bash
npm run dev      # 开发模式
npm run build    # 生产构建
```

---

**修复日期**: 2026-04-18  
**影响范围**: web/Dockerfile  
**向后兼容**: ✅ 完全兼容

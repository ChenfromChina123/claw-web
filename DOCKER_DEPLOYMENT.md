# AI Study Project - Docker 完整部署指南

## 📋 目录
- [架构概览](#架构概览)
- [快速开始](#快速开始)
- [单用户部署](#单用户部署)
- [多用户隔离部署](#多用户隔离部署)
- [管理命令](#管理命令)
- [端口映射规则](#端口映射规则)
- [数据持久化](#数据持久化)
- [常见问题](#常见问题)

---

## 🏗️ 架构概览

### 整体架构图
```
┌─────────────────────────────────────────────────────────────┐
│                        Nginx (反向代理)                       │
│                     :80 / :443                              │
└─────────────┬───────────────────────┬───────────────────────┘
              │                       │
              ▼                       ▼
┌─────────────────────┐    ┌─────────────────────┐
│  aispring-backend   │    │  claude-code-web    │
│  (Spring Boot)      │    │  (Vue + Node.js)    │
│  :5000              │    │  :3000              │
└──────────┬──────────┘    └──────────┬──────────┘
           │                         │
           ▼                         ▼
    ┌──────────────┐          ┌──────────────┐
    │    MySQL     │          │    Redis     │
    │    :3306     │          │    :6379     │
    └──────────────┘          └──────────────┘
```

### 多用户隔离架构（每个用户独立环境）
```
用户 A (zhangsan)                    用户 B (lisi)
┌──────────────────────┐           ┌──────────────────────┐
│ backend-zhangsan     │           │ backend-lisi         │
│ :6000                │           │ :7000                │
│ mysql-zhangsan       │           │ mysql-lisi           │
│ :4306                │           │ :5306                │
│ redis-zhangsan       │           │ redis-lisi           │
│ :7379                │           │ :8379                │
│ web-zhangsan         │           │ web-lisi             │
│ :4000                │           │ :5000                │
└──────────────────────┘           └──────────────────────┘
        │                                   │
        └───────────┬───────────────────────┘
                    ▼
            ┌──────────────┐
            │    Nginx     │
            │  (可选统一入口)│
            └──────────────┘
```

---

## 🚀 快速开始

### 前置要求
- Docker Engine 20.10+
- Docker Compose 2.0+
- Git
- 至少 4GB 可用内存（推荐 8GB+）

### 1️⃣ 克隆项目
```bash
git clone <your-repo-url>
cd HAHA
```

### 2️⃣ 配置环境变量
```bash
# 复制环境变量模板
cp .env.template .env

# 编辑配置文件，填入实际值
nano .env
```

**必须配置的关键项：**
```env
# 数据库密码（请使用强密码）
DB_ROOT_PASSWORD=YourSecureRootPassword123!
DB_PASSWORD=YourSecureDBPassword456!

# JWT 密钥（至少32个字符）
JWT_SECRET_KEY=YourSuperSecretKeyAtLeast32CharactersLong!!

# DeepSeek API 密钥
DEEPSEEK_API_KEY=sk-your_actual_api_key_here

# Anthropic API 密钥（Claude Code 使用）
ANTHROPIC_API_KEY=sk-ant-your_anthropic_key
```

### 3️⃣ 构建并启动所有服务
```bash
# 构建所有镜像
docker-compose build

# 启动所有服务（后台运行）
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

### 4️⃣ 验证部署
```bash
# 检查健康状态
curl http://localhost:5000/api/health
curl http://localhost:3000/api/health

# 访问 Web 界面
# 前端: http://localhost:3000
# 后端API: http://localhost:5000
```

---

## 🎯 单用户部署

适用于个人开发或小型团队。

### 启动命令
```bash
# 在项目根目录执行
docker-compose up -d
```

### 服务访问地址
| 服务 | 本地访问地址 | 说明 |
|------|-------------|------|
| **前端界面** | http://localhost:3000 | Claude Code Web |
| **后端 API** | http://localhost:5000 | Spring Boot REST API |
| **MySQL** | localhost:3306 | 数据库管理 |
| **Redis** | localhost:6379 | 缓存服务 |

---

## 👥 多用户隔离部署

为每个用户创建完全独立的容器实例，实现资源隔离。

### 方案特点
✅ **完全隔离**: 每个用户拥有独立的数据库、缓存、应用实例  
✅ **独立端口**: 避免端口冲突  
✅ **独立存储**: 用户数据互不影响  
✅ **独立网络**: 容器间网络隔离  
✅ **弹性扩展**: 支持动态添加/删除用户  

### Linux/Mac 使用方法

#### 创建新用户
```bash
# 赋予脚本执行权限
chmod +x docker-manager.sh

# 创建用户 zhangsan
./docker-manager.sh create-user zhangsan

# 输出示例：
# ✅ 已生成用户 zhangsan 的配置文件
#    📁 配置目录: /opt/aispring-users/zhangsan
#    🔗 后端端口: 6000
#    🌐 前端端口: 4000
#    💾 MySQL 端口: 4306
#    ⚡ Redis 端口: 7379
```

#### 启动/停止用户服务
```bash
# 启动用户服务
./docker-manager.sh start-user zhangsan

# 停止用户服务
./docker-manager.sh stop-user zhangsan
```

#### 管理多个用户
```bash
# 列出所有已创建的用户
./docker-manager.sh list-users

# 输出示例：
# 📋 当前已创建的用户列表:
# ================================================
# zhangsan      后端:6000    前端:4000    状态: running ✅
# lisi          后端:7000    前端:5000    状态: stopped
# ================================================

# 查看特定用户的端口映射
./docker-manager.sh show-ports zhangsan

# 删除用户及其所有数据（谨慎操作！）
./docker-manager.sh delete-user zhangsan
```

### Windows 使用方法

#### 创建新用户
```cmd
:: 创建用户 zhangsan
docker-manager.bat create-user zhangsan

:: 输出：
:: ✅ 用户 zhangsan 已创建成功！
::    📁 配置目录: D:\aispring-users\zhangsan
::    🔗 后端端口: 6000
::    🌐 前端端口: 4000
::    💾 MySQL 端口: 4306
::    ⚡ Redis 端口: 7379
```

#### 启动/停止用户服务
```cmd
:: 启动
docker-manager.bat start-user zhangsan

:: 停止
docker-manager.bat stop-user zhangsan
```

#### 管理用户
```cmd
:: 列出所有用户
docker-manager.bat list-users

:: 查看端口
docker-manager.bat show-ports zhangsan

:: 删除用户
docker-manager.bat delete-user zhangsan
```

---

## 🔢 端口映射规则

系统使用**哈希算法**自动分配端口，避免冲突：

### 基础端口
| 服务类型 | 基础端口 | 说明 |
|---------|---------|------|
| 后端 API | 5000 | Spring Boot |
| 前端 Web | 3000 | Vue 应用 |
| MySQL | 3306 | 数据库 |
| Redis | 6379 | 缓存 |

### 自动偏移计算
```
用户实际端口 = 基础端口 + (hash(user_id) % 100) × 1000
```

**示例：**
| 用户 ID | 后端端口 | 前端端口 | MySQL | Redis |
|--------|---------|---------|-------|-------|
| zhangsan | 6000 | 4000 | 4306 | 7379 |
| lisi | 7000 | 5000 | 5306 | 8379 |
| wangwu | 8000 | 6000 | 6306 | 9379 |

> 💡 **提示**: 可以通过 `show-ports` 命令查看任意用户的实际端口。

---

## 💾 数据持久化

### 存储结构
```
/opt/aispring-users/                          # Linux
D:\aispring-users\                            # Windows
├── zhangsan/                                  # 用户 A 的数据
│   ├── docker-compose.yml                     # 用户专属配置
│   ├── .env                                   # 用户环境变量
│   ├── data/                                  # 应用数据卷挂载点
│   ├── logs/                                  # 日志文件
│   └── (Docker volumes)                       # Docker 管理的卷
│       ├── mysql_zhangsan_data               # MySQL 数据
│       ├── redis_zhangsan_data               # Redis 数据
│       ├── backend_zhangsan_data             # 后端应用数据
│       └── web_zhangsan_data                 # 前端应用数据
│
└── lisi/                                      # 用户 B 的数据
    └── ...
```

### 数据备份
```bash
# 备份单个用户的所有数据
tar -czvf backup_zhangsan_$(date +%Y%m%d).tar.gz \
    /opt/aispring-users/zhangsan/

# 恢复数据
tar -xzvf backup_zhangsan_20260409.tar.gz \
    -C /opt/aispring-users/
```

---

## 🛠️ 管理命令速查

### Docker Compose 常用命令
```bash
# 查看所有容器状态
docker ps -a --filter "name=aispring"

# 查看某个用户的容器
docker ps -a --filter "name=zhangsan"

# 查看实时日志
docker logs -f backend-zhangsan

# 进入容器调试
docker exec -it backend-zhangsan sh

# 重启某个用户的所有服务
cd /opt/aispring-users/zhangsan && docker-compose restart

# 更新某个用户的镜像并重启
cd /opt/aispring-users/zhangsan && docker-compose up -d --build
```

### 资源监控
```bash
# 查看所有用户容器的资源占用
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"

# 查看磁盘使用情况
docker system df -v
```

---

## ❓ 常见问题

### Q1: 端口被占用怎么办？
**A:** 系统会自动计算不冲突的端口。如果仍然冲突：
```bash
# 手动指定端口（编辑用户的 docker-compose.yml）
# 或删除用户重新创建
./docker-manager.sh delete-user user_id
./docker-manager.sh create-user user_id
```

### Q2: 如何更新应用代码？
**A:** 
```bash
# 方法1: 重建所有镜像
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# 方法2: 仅更新单个用户
cd /opt/aispring-users/zhangsan
docker-compose pull
docker-compose up -d --build
```

### Q3: 内存不足怎么办？
**A:** 调整 JVM 参数或限制并发用户数：
```yaml
# 编辑 docker-compose.yml
environment:
  JAVA_OPTS: "-Xms128m -Xmx256m"  # 减少内存分配
```

### Q4: 如何备份数据库？
**A:**
```bash
# 导出单个用户的数据库
docker exec mysql-zhangsan mysqldump -u root -p aispring_zhangsan > backup.sql

# 导入数据库
docker exec -i mysql-zhangsan mysql -u root -p aispring_zhangsan < backup.sql
```

### Q5: 如何查看容器内部日志？
**A:**
```bash
# 查看后端日志
docker logs -f --tail 100 backend-zhangsan

# 查看 MySQL 日志
docker logs -f mysql-zhangsan

# 查看前端日志
docker logs -f web-zhangsan
```

---

## 🔒 安全建议

### 生产环境必做项
1. ✅ **修改所有默认密码**
2. ✅ **启用 HTTPS**（配置 SSL 证书）
3. ✅ **设置防火墙规则**（仅开放必要端口）
4. ✅ **定期更新基础镜像**
5. ✅ **启用 Redis 密码认证**
6. ✅ **限制数据库外部访问**

### 安全加固示例
```bash
# 仅允许本地访问数据库
# 在 docker-compose.yml 中注释掉 ports 映射:
# ports:
#   - "3306:3306"  # 删除此行

# 启用 Redis 密码
# 编辑 docker/redis/redis.conf:
# requirepass your_strong_redis_password
```

---

## 📞 技术支持

如遇到问题，请检查：
1. Docker 版本是否符合要求
2. 端口是否被占用：`netstat -tlnp`
3. 内存是否充足：`free -h`
4. 查看详细错误日志：`docker-compose logs`

---

**最后更新时间**: 2026-04-09  
**适用版本**: v1.0.0

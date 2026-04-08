# ===========================================
# Claude Code HAHA - Docker 内存配置指南
# ===========================================
#
# 本文档提供针对不同服务器规模的内存配置方案
# 目标：在保证性能的前提下，实现多租户环境的高效资源利用

## 📋 目录
- [内存配置总览](#内存配置总览)
- [不同规模配置方案](#不同规模配置方案)
- [各服务详细配置](#各服务详细配置)
- [Node.js/Bun 内存优化](#nodejsbun-内存优化)
- [MySQL 内存调优](#mysql-内存调优)
- [Redis 内存配置](#redis-内存配置)
- [监控与告警](#监控与告警)

---

## 🎯 内存配置总览

### 推荐的内存分配比例（生产环境）

| 服务 | 最小配置 | 标准配置 | 高配配置 | 说明 |
|------|---------|---------|---------|------|
| **后端 (Bun)** | 512MB | 1GB - 2GB | 4GB | AI 应用，需要较多内存处理请求 |
| **MySQL** | 256MB | 512MB - 1GB | 2GB | InnoDB 缓冲池是关键 |
| **Redis** | 64MB | 128MB - 256MB | 512MB | 缓存层，可适当压缩 |
| **前端 (Nginx)** | 32MB | 64MB | 128MB | 静态文件服务，内存占用低 |
| **系统预留** | 256MB | 512MB | 1GB | 操作系统和 Docker 开销 |
| **总计** | **~1.1GB** | **~2.5GB - 4GB** | **~7.7GB** | |

### 多租户隔离内存分配策略

```
┌─────────────────────────────────────────────────────────────┐
│                    总可用内存 (例如: 4GB)                    │
├─────────────────────────────────────────────────────────────┤
│  系统预留 (12%):     ~512MB                                  │
│  ├─ 操作系统内核                                              │
│  └─ Docker 运行时                                            │
├─────────────────────────────────────────────────────────────┤
│  基础服务 (25%):      ~1GB                                   │
│  ├─ MySQL:        512MB (InnoDB buffer pool: 384MB)         │
│  ├─ Redis:        128MB                                     │
│  └─ Nginx:        64MB                                      │
├─────────────────────────────────────────────────────────────┤
│  后端应用 (50%):      ~2GB                                   │
│  ├─ Bun Runtime:  1536MB                                    │
│  ├─ V8 堆内存:    1024MB                                    │
│  └─ 工作线程/缓冲: 512MB                                     │
├─────────────────────────────────────────────────────────────┤
│  用户数据缓存 (13%):   ~512MB                                │
│  ├─ 会话数据                                                  │
│  ├─ Workspace 缓存                                           │
│  └─ 租户上下文缓存                                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 💻 不同规模配置方案

### 方案一：开发/测试环境（2GB RAM）

适用于：
- 本地开发测试
- 功能验证
- 小团队内部使用（<10 用户）

```yaml
# docker-compose.memory-dev.yml
services:
  mysql:
    deploy:
      resources:
        limits:
          memory: 256M
        reservations:
          memory: 128M
    environment:
      - innodb_buffer_pool_size=134217728  # 128MB

  redis:
    command: redis-server --maxmemory 64mb --maxmemory-policy allkeys-lru
    deploy:
      resources:
        limits:
          memory: 96M
        reservations:
          memory: 48M

  backend:
    environment:
      - NODE_OPTIONS=--max-old-space-size=384
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M

  frontend:
    deploy:
      resources:
        limits:
          memory: 64M
        reservations:
          memory: 32M
```

**预期表现：**
- 支持并发用户数：5-10 人
- 响应时间：< 500ms（简单查询）
- 适用场景：开发、测试、演示

---

### 方案二：标准生产环境（4GB RAM）⭐ 推荐

适用于：
- 中小型生产部署
- 20-50 并发用户
- 标准 SaaS 服务

```yaml
# docker-compose.memory-standard.yml
services:
  mysql:
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M
    command:
      - --innodb_buffer_pool_size=268435456  # 256MB
      - --key_buffer_size=16777216           # 16MB
      - --sort_buffer_size=2097152           # 2MB
      - --read_buffer_size=131072            # 128KB
      - --read_rnd_buffer_size=262144        # 256KB
      - --tmp_table_size=16777216            # 16MB
      - --max_heap_table_size=16777216       # 16MB
      - --table_open_cache=400
      - --thread_cache_size=8
      - --query_cache_type=0                 # MySQL 8.0 已移除，保留兼容性

  redis:
    command: redis-server --maxmemory 128mb --maxmemory-policy volatile-lru
    deploy:
      resources:
        limits:
          memory: 160M
        reservations:
          memory: 96M

  backend:
    environment:
      - NODE_OPTIONS=--max-old-space-size=1024
      - UV_THREADPOOL_SIZE=4                # Bun 线程池大小
    deploy:
      resources:
        limits:
          memory: 1536M                     # 1.5GB
        reservations:
          memory: 768M                      # 768MB

  frontend:
    deploy:
      resources:
        limits:
          memory: 96M
        reservations:
          memory: 48M
```

**预期表现：**
- 支持并发用户数：20-50 人
- 响应时间：< 200ms（简单查询）
- 可用性：99.9%（需配合健康检查）

---

### 方案三：高性能生产环境（8GB+ RAM）

适用于：
- 大型部署
- 100+ 并发用户
- 企业级 SaaS 平台

```yaml
# docker-compose.memory-highperf.yml
services:
  mysql:
    deploy:
      resources:
        limits:
          memory: 2048M                     # 2GB
        reservations:
          memory: 1024M                     # 1GB
    command:
      - --innodb_buffer_pool_size=1073741824 # 1GB
      - --innodb_log_file_size=268435456    # 256MB
      - --innodb_flush_log_at_trx_commit=2  # 性能与安全平衡
      - --innodb_flush_method=O_DIRECT      # 避免双重缓冲
      - --key_buffer_size=67108864          # 64MB
      - --sort_buffer_size=8388608          # 8MB
      - --read_buffer_size=524288           # 512KB
      - --read_rnd_buffer_size=1048576      # 1MB
      - --tmp_table_size=67108864           # 64MB
      - --max_heap_table_size=67108864      # 64MB
      - --table_open_cache=2000
      - --thread_cache_size=16
      - --max_connections=200
      - --innodb_io_capacity=1000           # SSD 优化
      - --innodb_read_ahead_threshold=32    # 预读优化

  redis:
    command: redis-server --maxmemory 512mb --maxmemory-policy volatile-lru
    deploy:
      resources:
        limits:
          memory: 640M
        reservations:
          memory: 320M

  backend:
    environment:
      - NODE_OPTIONS=--max-old-space-size=3072  # 3GB
      - UV_THREADPOOL_SIZE=8                     # 更多 I/O 线程
    deploy:
      resources:
        limits:
          memory: 4096M                          # 4GB
        reservations:
          memory: 2048M                          # 2GB

  frontend:
    deploy:
      resources:
        limits:
          memory: 128M
        reservations:
          memory: 64M
```

**预期表现：**
- 支持并发用户数：100-300 人
- 响应时间：< 100ms（简单查询）
- 吞吐量：> 1000 QPS

---

## ⚙️ 各服务详细配置

### 后端服务 (Bun/Node.js) 内存参数

#### 环境变量配置

```bash
# Node.js/Bun V8 引擎内存限制
NODE_OPTIONS="--max-old-space-size=1024"  # 设置最大堆内存为 1GB

# Bun 特定优化
UV_THREADPOOL_SIZE=4                       # libuv 线程池大小（I/O 密集型任务）
BUN_CONFIG_NO_CLEAR_TERMINAL_ON_RELOAD=true

# HTTP 服务器缓冲区
HTTP_MAX_REQUEST_SIZE=10485760             # 最大请求体 10MB
WEBSOCKET_MESSAGE_LIMIT=1048576            # WebSocket 消息限制 1MB
```

#### Dockerfile 中的内存优化

```dockerfile
ENV NODE_ENV=production \
    # 内存配置
    NODE_OPTIONS="--max-old-space-size=1024 \
                 --optimize-for-size \
                 --gc-interval=100" \
    # 线程配置
    UV_THREADPOOL_SIZE=4 \
    # 多租户配置
    TENANT_ISOLATION_ENABLED=true \
    MAX_USERS=100 \
    USER_STORAGE_QUOTA_MB=500
```

#### 运行时内存监控

在代码中添加内存监控：

```typescript
// server/src/utils/memoryMonitor.ts

/**
 * 内存使用监控工具
 */
export class MemoryMonitor {
  private static instance: MemoryMonitor
  private intervalId?: ReturnType<typeof setInterval>

  /**
   * 获取当前内存使用情况
   */
  getMemoryUsage(): NodeJS.MemoryUsage {
    return process.memoryUsage()
  }

  /**
   * 格式化内存使用信息
   */
  formatMemoryUsage(usage: NodeJs.MemoryUsage): string {
    const format = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`

    return `
📊 内存使用情况：
  RSS (常驻内存): ${format(usage.rss)}
  Heap Total:      ${format(usage.heapTotal)}
  Heap Used:       ${format(usage.heapUsed)}
  External:        ${format(usage.external)}
  ArrayBuffers:    ${format(usage.arrayBuffers)}
  使用率:          ${(usage.heapUsed / usage.heapTotal * 100).toFixed(1)}%
`.trim()
  }

  /**
   * 开始定期监控（每 30 秒输出一次）
   */
  startMonitoring(intervalMs: number = 30000): void {
    if (this.intervalId) return

    this.intervalId = setInterval(() => {
      const usage = this.getMemoryUsage()
      const usagePercent = (usage.heapUsed / usage.heapTotal) * 100

      console.log(`[MemoryMonitor] ${new Date().toISOString()}`)
      console.log(this.formatMemoryUsage(usage))

      // 内存使用超过 80% 时发出警告
      if (usagePercent > 80) {
        console.warn(`[MemoryMonitor] ⚠️ 内存使用率过高: ${usagePercent.toFixed(1)}%`)
      }

      // 内存使用超过 95% 时触发垃圾回收建议
      if (usagePercent > 95) {
        console.error(`[MemoryMonitor] 🔴 内存严重不足: ${usagePercent.toFixed(1)}%，建议增加内存或优化代码`)
      }
    }, intervalMs)

    console.log('[MemoryMonitor] 内存监控已启动')
  }

  /**
   * 停止监控
   */
  stopMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = undefined
    }
  }

  static getInstance(): MemoryMonitor {
    if (!MemoryMonitor.instance) {
      MemoryMonitor.instance = new MemoryMonitor()
    }
    return MemoryMonitor.instance
  }
}
```

---

## 🗄️ MySQL 内存调优详解

### 关键参数说明

| 参数名 | 默认值 | 推荐值 (4GB RAM) | 说明 |
|--------|-------|------------------|------|
| `innodb_buffer_pool_size` | 128MB | 256MB - 512MB | **最重要参数！** InnoDB 数据和索引缓存 |
| `innodb_log_file_size` | 48MB | 128MB - 256MB | 日志文件大小，影响写入性能 |
| `key_buffer_size` | 8MB | 16MB - 64MB | MyISAM 索引缓存（如使用 MyISAM） |
| `sort_buffer_size` | 256KB | 2MB - 4MB | 排序操作缓冲区 |
| `read_buffer_size` | 128KB | 128KB - 512KB | 顺序读缓冲区 |
| `read_rnd_buffer_size` | 256KB | 256KB - 1MB | 随机读缓冲区 |
| `tmp_table_size` | 16MB | 16MB - 64MB | 临时表（内存）最大大小 |
| `table_open_cache` | 400 | 400 - 2000 | 表描述符缓存数量 |
| `thread_cache_size` | 9 | 8 - 16 | 线程缓存（减少连接开销） |
| `max_connections` | 151 | 100 - 200 | 最大连接数 |
| `query_cache_size` | 1MB | 0 (MySQL 8.0+) | 查询缓存（8.0 已移除） |

### 计算公式

```
InnoDB Buffer Pool 大小 ≈ 总内存 × 60% - 70%（专用于数据库时）
                        或 总内存 × 15% - 25%（共享服务器时）

示例（4GB 服务器）：
  专用数据库：4GB × 65% = 2.6GB
  共享服务器：4GB × 20% = 800MB → 推荐 512MB
```

---

## 📦 Redis 内存配置

### 内存策略选项

```bash
# 淘汰策略选择（当达到 maxmemory 时）
--maxmemory-policy <policy>

可选策略：
  noeviction          # 不淘汰，内存满时报错（默认）
  allkeys-lru         # 对所有键采用 LRU 淘汰
  allkeys-random      # 对所有键随机淘汰
  volatile-lru        # 对有过期时间的键采用 LRU 淘汰 ⭐ 推荐
  volatile-random     # 对有过期时间的键随机淘汰
  volatile-ttl        # 淘汰即将过期的键
  volatile-lfu        # 对有过期时间的键采用 LFU 淘汰（Redis 4.0+）
  allkeys-lfu         # 对所有键采用 LFU 淘汰（Redis 4.0+）
```

### Redis 内存分配建议

| 场景 | maxmemory | policy | 说明 |
|------|-----------|--------|------|
| 纯缓存 | 128MB | allkeys-lru | 可以丢失数据 |
| 会话存储 | 256MB | volatile-lru | 优先保留活跃会话 |
| 混合用途 | 512MB | volatile-lru | 兼顾性能和数据持久化 |
| 高性能 | 1GB+ | volatile-lfu | 利用频率信息优化 |

---

## 📈 监控与告警

### Docker 容器内存监控命令

```bash
# 查看所有容器实时内存使用
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.CPUPerc}}"

# 持续监控（每 2 秒刷新）
docker stats --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}" 

# 单个容器详情
docker inspect <container_name> | grep -A 20 "MemoryStats"
```

### 内存告警阈值建议

| 指标 | 警告阈值 | 严重阈值 | 处理措施 |
|------|---------|---------|---------|
| 容器内存使用率 | > 75% | > 90% | 扩容或优化 |
| 堆内存使用率 | > 80% | > 95% | 触发 GC 或重启 |
| OOM Kill 次数 | > 0/小时 | > 3/小时 | 紧急扩容 |
| Swap 使用率 | > 10% | > 50% | 增加物理内存 |

### 自动扩容脚本示例

```bash
#!/bin/bash
# memory-alert.sh - 内存使用率告警脚本

THRESHOLD_WARNING=75
THRESHOLD_CRITICAL=90

check_memory() {
    local container=$1
    local mem_percent=$(docker stats --no-stream --format "{{.MemPerc}}" $container | sed 's/%//')

    if [ "$mem_percent" -gt "$THRESHOLD_CRITICAL" ]; then
        echo "[CRITICAL] $container 内存使用率: ${mem_percent}%"
        # 发送告警通知（邮件/Webhook/DingTalk等）
        send_alert "critical" "$container" "$mem_percent"
    elif [ "$mem_percent" -gt "$THRESHOLD_WARNING" ]; then
        echo "[WARNING] $container 内存使用率: ${mem_percent}%"
        send_alert "warning" "$container" "$mem_percent"
    fi
}

send_alert() {
    local level=$1
    local container=$2
    local percent=$3
    
    # TODO: 实现实际的告警发送逻辑
    echo "[$level] Alert: Container $container at ${percent}% memory usage"
}

# 主循环
while true; do
    for container in claude-backend claude-mysql claude-redis; do
        check_memory $container
    done
    sleep 60
done
```

---

## 🚀 快速启动配置模板

### 一键应用内存配置

```bash
# 方法 1: 直接编辑 docker-compose.yml（推荐）

# 方法 2: 使用环境变量覆盖
cat > .env.memory << 'EOF'
# 内存配置（根据你的服务器调整）
BACKEND_MEMORY_LIMIT=1536M
BACKEND_MEMORY_RESERVATION=768M
MYSQL_MEMORY_LIMIT=512M
MYSQL_BUFFER_POOL_SIZE=256M
REDIS_MEMORY_LIMIT=160M
REDIS_MAXMEMORY=128mb
FRONTEND_MEMORY_LIMIT=96M
EOF

# 方法 3: 使用不同的 compose 文件
cp docker-compose.memory-standard.yml docker-compose.override.yml
docker compose up -d
```

---

## 📝 最佳实践清单

- [ ] ✅ 根据实际服务器内存选择合适的配置方案
- [ ] ✅ 设置合理的内存限制（limits），防止 OOM 影响其他服务
- [ ] ✅ 配置内存预留（reservations），保证基本性能
- [ ] ✅ 定期监控内存使用情况（docker stats）
- [ ] ✅ 配置告警机制（>80% 警告，>95% 严重）
- [ ] ✅ MySQL 的 innodb_buffer_pool_size 是最关键的参数
- [ ] ✅ Redis 选择合适的淘汰策略（推荐 volatile-lru）
- [ ] ✅ 后端服务的堆内存不要超过物理内存的 50%
- [ ] ✅ 在生产环境中进行压力测试验证配置
- [ ] ✅ 定期检查并清理不必要的数据和缓存

---

## 🆘 故障排查

### 问题 1: 容器频繁被 OOM Kill

**症状：**
```
docker logs <container> | grep "OOMKilled"
# 输出: ... OOMKilled: true ...
```

**解决方案：**
1. 增加 `deploy.resources.limits.memory`
2. 检查是否有内存泄漏
3. 优化代码或拆分服务

### 问题 2: MySQL 查询变慢

**检查步骤：**
```sql
SHOW STATUS LIKE 'Innodb_buffer_pool_reads';
SHOW VARIABLES LIKE 'innodb_buffer_pool_size';
```

如果 `Innodb_buffer_pool_reads` 很高，说明缓冲池太小。

### 问题 3: Redis 内存持续增长

**原因：**
- 未设置 maxmemory
- 淘汰策略不当
- 存储了大型对象

**解决：**
```bash
redis-cli INFO memory
redis-cli CONFIG SET maxmemory 128mb
redis-cli CONFIG SET maxmemory-policy volatile-lru
```

---

**文档版本**: v1.0
**更新日期**: 2024年
**适用版本**: Docker Compose v2+, MySQL 8.0, Redis 7.x

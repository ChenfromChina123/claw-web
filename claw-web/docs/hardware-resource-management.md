# 硬件资源限制配置模块

## 概述

本模块为不同身份的用户提供不同的硬件资源配额，实现多租户环境下的公平资源分配。

## 功能特性

- ✅ **用户等级管理**：支持5种用户等级（free、basic、pro、enterprise、admin）
- ✅ **硬件资源限制**：CPU、内存、存储、会话数、PTY进程数、文件数等
- ✅ **动态配额调整**：支持管理员动态调整用户等级和配额
- ✅ **自定义配额**：支持为特定用户设置自定义硬件配额
- ✅ **资源使用统计**：实时监控用户的资源使用情况
- ✅ **Docker集成**：自动为容器应用硬件资源限制

## 用户等级说明

### 1. 免费用户 (free)
- **CPU限制**: 0.5核
- **内存限制**: 256MB
- **存储配额**: 200MB
- **最大会话数**: 3个
- **最大PTY进程数**: 2个
- **最大文件数**: 500个
- **单文件大小**: 5MB
- **适用场景**: 轻度使用、体验用户

### 2. 基础会员 (basic)
- **CPU限制**: 1.0核
- **内存限制**: 512MB
- **存储配额**: 500MB
- **最大会话数**: 5个
- **最大PTY进程数**: 3个
- **最大文件数**: 1000个
- **单文件大小**: 10MB
- **适用场景**: 个人开发者

### 3. 专业会员 (pro)
- **CPU限制**: 2.0核
- **内存限制**: 1024MB
- **存储配额**: 2000MB
- **最大会话数**: 10个
- **最大PTY进程数**: 5个
- **最大文件数**: 3000个
- **单文件大小**: 20MB
- **适用场景**: 专业开发者

### 4. 企业会员 (enterprise)
- **CPU限制**: 4.0核
- **内存限制**: 2048MB
- **存储配额**: 10000MB
- **最大会话数**: 20个
- **最大PTY进程数**: 10个
- **最大文件数**: 10000个
- **单文件大小**: 50MB
- **适用场景**: 团队协作

### 5. 管理员 (admin)
- **CPU限制**: 8.0核
- **内存限制**: 4096MB
- **存储配额**: 50000MB
- **最大会话数**: 50个
- **最大PTY进程数**: 20个
- **最大文件数**: 50000个
- **单文件大小**: 100MB
- **适用场景**: 系统管理员

## 安装与配置

### 1. 数据库迁移

运行以下SQL文件添加用户等级相关字段：

```bash
mysql -u root -p claude_code_haha < server/src/db/add_user_tier.sql
```

### 2. 环境变量配置

在 `docker-compose.yml` 或 `.env` 文件中配置以下环境变量：

```yaml
environment:
  # 用户等级相关配置
  - DEFAULT_USER_TIER=free              # 默认用户等级
  - ENABLE_CUSTOM_QUOTA=true            # 是否启用自定义配额
  - QUOTA_ENFORCEMENT_ENABLED=true      # 是否强制执行配额限制
```

### 3. Docker资源限制

系统会自动为每个用户的容器应用硬件资源限制。Docker命令示例：

```bash
docker run -d \
  --name claude-user-{userId} \
  --memory=256m \                    # 内存限制
  --memory-reservation=128m \        # 内存预留
  --cpus=0.5 \                       # CPU限制
  --cpu-quota=50000 \                # CPU配额
  --cpu-period=100000 \              # CPU周期
  --blkio-weight=200 \               # 磁盘IO权重
  -e USER_STORAGE_QUOTA_MB=200 \     # 存储配额
  -e USER_SESSION_LIMIT=3 \          # 会话限制
  -e USER_PTY_LIMIT=2 \              # PTY限制
  claw-web-backend-worker:latest
```

## API接口

### 1. 获取所有用户等级配额

```http
GET /api/tier/quotas
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "free": {
      "tierName": "free",
      "displayName": "免费用户",
      "cpuLimit": 0.5,
      "memoryLimitMB": 256,
      "storageQuotaMB": 200,
      "maxSessions": 3,
      "maxPtyProcesses": 2,
      "maxFiles": 500,
      "maxFileSizeMB": 5
    },
    ...
  }
}
```

### 2. 获取当前用户的配额信息

```http
GET /api/tier/my-quota
Authorization: Bearer {token}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "userId": "user-uuid",
    "username": "john_doe",
    "tier": "pro",
    "quota": {
      "cpuLimit": 2.0,
      "memoryLimitMB": 1024,
      "storageQuotaMB": 2000,
      "maxSessions": 10,
      "maxPtyProcesses": 5,
      "maxFiles": 3000,
      "maxFileSizeMB": 20
    },
    "hasCustomQuota": false
  }
}
```

### 3. 更新用户等级（管理员权限）

```http
PUT /api/tier/update/{userId}
Authorization: Bearer {admin-token}
Content-Type: application/json

{
  "tier": "pro",
  "subscriptionExpiresAt": "2025-12-31T23:59:59Z"
}
```

**响应示例**:
```json
{
  "success": true,
  "message": "用户等级更新成功"
}
```

### 4. 设置自定义配额（管理员权限）

```http
PUT /api/tier/custom-quota/{userId}
Authorization: Bearer {admin-token}
Content-Type: application/json

{
  "cpuLimit": 3.0,
  "memoryLimitMB": 1536,
  "storageQuotaMB": 3000,
  "maxSessions": 15
}
```

**响应示例**:
```json
{
  "success": true,
  "message": "自定义配额设置成功"
}
```

### 5. 获取用户资源使用统计

```http
GET /api/tier/usage-stats/{userId}
Authorization: Bearer {token}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "quota": {
      "cpuLimit": 2.0,
      "memoryLimitMB": 1024,
      "storageQuotaMB": 2000
    },
    "usage": {
      "cpu": {
        "used": 0.25,
        "limit": 2.0,
        "percent": 12.5
      },
      "memory": {
        "used": 128,
        "limit": 1024,
        "percent": 12.5
      },
      "storage": {
        "used": 50,
        "limit": 2000,
        "percent": 2.5
      }
    },
    "overallUsagePercent": 9.17
  }
}
```

### 6. 获取所有用户列表（管理员权限）

```http
GET /api/tier/users
Authorization: Bearer {admin-token}
```

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "id": "user-uuid-1",
      "username": "john_doe",
      "email": "john@example.com",
      "tier": "pro",
      "subscriptionExpiresAt": "2025-12-31T23:59:59Z",
      "createdAt": "2024-01-01T00:00:00Z",
      "lastLogin": "2024-12-01T10:30:00Z"
    }
  ]
}
```

## 使用示例

### 1. 用户注册时设置默认等级

```typescript
import { UserTier } from './models/types'

// 新用户默认为免费用户
const newUser = await userRepository.create({
  username: 'new_user',
  email: 'user@example.com',
  tier: UserTier.FREE
})
```

### 2. 容器创建时应用硬件限制

```typescript
import { getHardwareResourceManager, UserTier } from './config/hardwareResourceConfig'

const hardwareManager = getHardwareResourceManager()
const quota = hardwareManager.getUserQuota(userId, UserTier.PRO)

// 生成Docker资源限制参数
const resourceArgs = hardwareManager.generateDockerResourceArgs(quota)

// 创建容器时应用限制
const dockerCmd = [
  'docker run -d',
  `--name ${containerName}`,
  ...resourceArgs,
  imageName
].join(' ')
```

### 3. 验证资源请求

```typescript
const validation = hardwareManager.validateResourceRequest(
  userId,
  UserTier.BASIC,
  'memory',
  1024  // 请求1024MB内存
)

if (!validation.allowed) {
  console.log(`资源请求被拒绝: ${validation.reason}`)
  console.log(`当前限制: ${validation.limit}MB`)
}
```

### 4. 监控资源使用情况

```typescript
const stats = hardwareManager.getResourceUsageStats(
  userId,
  UserTier.PRO,
  {
    cpuUsage: 0.5,
    memoryUsageMB: 512,
    storageUsageMB: 100,
    sessionCount: 3,
    ptyCount: 2,
    fileCount: 150
  }
)

console.log(`总体使用率: ${stats.overallUsagePercent}%`)
console.log(`内存使用率: ${stats.usage.memory.percent}%`)
```

## 管理员操作指南

### 1. 升级用户等级

```bash
curl -X PUT http://localhost:3000/api/tier/update/{userId} \
  -H "Authorization: Bearer {admin-token}" \
  -H "Content-Type: application/json" \
  -d '{
    "tier": "pro",
    "subscriptionExpiresAt": "2025-12-31T23:59:59Z"
  }'
```

### 2. 为用户设置自定义配额

```bash
curl -X PUT http://localhost:3000/api/tier/custom-quota/{userId} \
  -H "Authorization: Bearer {admin-token}" \
  -H "Content-Type: application/json" \
  -d '{
    "cpuLimit": 3.0,
    "memoryLimitMB": 1536,
    "storageQuotaMB": 3000,
    "maxSessions": 15
  }'
```

### 3. 查看所有用户等级

```bash
curl -X GET http://localhost:3000/api/tier/users \
  -H "Authorization: Bearer {admin-token}"
```

## 注意事项

1. **权限控制**：只有管理员才能修改用户等级和设置自定义配额
2. **配额生效**：用户等级变更后，需要重新创建容器才能应用新的硬件限制
3. **资源监控**：建议定期监控用户的资源使用情况，避免资源滥用
4. **数据备份**：修改配额配置前，建议备份 `user_tier_quotas` 表
5. **容器重建**：升级用户等级后，建议通知用户重新建立会话以应用新配额

## 故障排查

### 1. 容器创建失败

**问题**: 容器创建时提示资源不足

**解决方案**:
- 检查宿主机资源是否充足
- 降低用户等级的配额限制
- 检查Docker是否支持资源限制功能

### 2. 配额不生效

**问题**: 修改用户等级后，容器仍使用旧配额

**解决方案**:
- 销毁旧容器并重新创建
- 检查环境变量是否正确传递
- 验证容器编排器是否正确应用了资源限制

### 3. 数据库迁移失败

**问题**: 执行SQL迁移文件时报错

**解决方案**:
- 检查数据库连接是否正常
- 确认用户是否有足够的权限
- 手动执行SQL语句，逐条排查错误

## 未来规划

- [ ] 支持按时间段自动调整配额（如高峰期降低配额）
- [ ] 支持配额借用和共享机制
- [ ] 集成计费系统，实现自动升级降级
- [ ] 提供Web管理界面，方便管理员操作
- [ ] 支持配额预警和自动通知功能

## 技术支持

如有问题或建议，请联系开发团队或提交Issue。

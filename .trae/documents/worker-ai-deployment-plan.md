# Worker AI 持久化部署与外部访问方案

## 一、现状分析

### 1.1 当前架构

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Frontend   │───▶│   Master    │───▶│    MySQL     │
│  (Nginx:80)  │    │ (Bun:3000)  │    │ (3306)      │
└─────────────┘    └──────┬──────┘    └─────────────┘
                          │
                   ┌──────┴──────┐
                   │   Worker ×N  │
                   │ (Bun:4000)  │
                   └─────────────┘
```

**Worker 容器特点：**
- 每个用户一个 Worker 容器（按用户隔离）
- Worker 容器通过动态端口映射（3100+）暴露到宿主机
- Worker 容器挂载用户工作空间 `/data/claws/workspaces/users/{userId}/`
- Worker 容器无状态，不直接连接数据库

### 1.2 现有部署相关服务

| 服务 | 文件路径 | 功能 |
|------|----------|------|
| ProjectDeploymentService | `server/src/master/services/projectDeploymentService.ts` | 项目部署主服务 |
| TunnelService | `server/src/master/services/tunnelService.ts` | 内网穿透（Cloudflare/cpolar/frp） |
| ReverseProxyService | `server/src/master/services/reverseProxyService.ts` | Nginx 反向代理配置 |
| DomainService | `server/src/master/services/domainService.ts` | 域名管理 |
| SSLService | `server/src/master/services/sslService.ts` | SSL 证书管理 |

### 1.3 现有数据库表

- `project_deployments` - 项目部署信息
- `domains` - 域名管理
- `tunnels` - 内网穿透隧道
- `proxy_configs` - 反向代理配置
- `ssl_certificates` - SSL 证书

---

## 二、目标方案

### 2.1 核心需求

1. **AI 持久化部署**：AI 在 Worker 容器内部署的项目能够持久化运行
2. **外部访问**：通过 `{项目编号}.域名` 的格式从外部访问 Worker 中的项目

### 2.2 技术方案选型

#### 方案对比

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| **Nginx 反向代理**（推荐） | 性能好、稳定、支持 SSL | 需要公网 IP 和域名 | 生产环境 |
| **Cloudflare Tunnel** | 无需公网 IP、自带 CDN | 依赖第三方服务 | 无公网 IP 环境 |
| **frp/cpolar** | 灵活、自建可控 | 需要额外服务器 | 开发测试 |
| **端口直接映射** | 简单直接 | 不安全、端口冲突 | 不推荐 |

#### 推荐方案：Nginx 反向代理 + 子域名

```
用户访问: https://project-123.claw-web.com
                │
                ▼
         [Nginx 反向代理]
                │
                ▼
    [Docker 端口映射检查]
                │
                ▼
        [Worker 容器]
                │
                ▼
          [项目进程]
```

---

## 三、详细实施计划

### 阶段一：Worker 容器增强（第 1-2 天）

#### 3.1.1 创建进程管理器

**文件**: `server/src/master/integration/processManager.ts`

```typescript
// 功能：在 Worker 容器内管理项目进程
// - 支持 PM2 和 Supervisor
// - 端口分配和管理
// - 进程状态监控
```

**任务清单：**
- [ ] 创建 `ProcessManager` 类
- [ ] 实现 `startProject()` 方法
- [ ] 实现 `stopProject()` 方法
- [ ] 实现 `restartProject()` 方法
- [ ] 实现 `getProjectStatus()` 方法
- [ ] 实现端口分配逻辑（避免冲突）

#### 3.1.2 创建 Worker 内部 API 扩展

**文件**: `server/src/worker/routes/deployment.routes.ts`

```typescript
// Worker 内部 API 端点：
// POST /internal/deploy - 部署项目
// POST /internal/deploy/:id/stop - 停止项目
// GET /internal/deploy/:id/status - 获取状态
// GET /internal/deploy/:id/logs - 获取日志
```

**任务清单：**
- [ ] 创建部署路由
- [ ] 实现项目部署逻辑
- [ ] 实现进程管理接口
- [ ] 实现日志收集接口

### 阶段二：部署服务完善（第 3-4 天）

#### 3.2.1 完善 ProjectDeploymentService

**文件**: `server/src/master/services/projectDeploymentService.ts`

**现有功能：**
- ✅ 规划代理（DeploymentPlanningAgent）
- ✅ 执行代理（DeploymentExecutionAgent）
- ✅ 验证代理（DeploymentValidationAgent）

**需要完善：**
- [ ] 数据库持久化（project_deployments 表）
- [ ] 项目状态管理
- [ ] 日志收集和存储
- [ ] 自动重启机制

#### 3.2.2 创建部署路由

**文件**: `server/src/master/routes/deployment.routes.ts`

```typescript
// API 端点：
// POST /api/deployments - 创建部署
// GET /api/deployments - 列出租户部署
// GET /api/deployments/:id - 获取部署详情
// POST /api/deployments/:id/start - 启动项目
// POST /api/deployments/:id/stop - 停止项目
// DELETE /api/deployments/:id - 删除部署
// GET /api/deployments/:id/logs - 获取日志
```

**任务清单：**
- [ ] 创建部署路由文件
- [ ] 实现 CRUD 接口
- [ ] 集成 ProjectDeploymentService
- [ ] 添加认证中间件

### 阶段三：域名与反向代理（第 5-7 天）

#### 3.3.1 完善 DomainService

**文件**: `server/src/master/services/domainService.ts`

**现有功能：**
- ✅ 子域名生成
- ✅ 域名验证

**需要完善：**
- [ ] 数据库持久化（domains 表）
- [ ] 子域名格式：`{项目编号}.{baseDomain}`
- [ ] DNS 记录自动配置（可选）

#### 3.3.2 完善 ReverseProxyService

**文件**: `server/src/master/services/reverseProxyService.ts`

**现有功能：**
- ✅ Nginx 配置生成
- ✅ SSL 配置

**需要完善：**
- [ ] 动态 upstream 配置（指向 Worker 容器端口）
- [ ] 子域名路由规则
- [ ] 配置热重载
- [ ] 数据库持久化（proxy_configs 表）

#### 3.3.3 创建域名解析路由

**文件**: `server/src/master/routes/domain.routes.ts`

```typescript
// API 端点：
// POST /api/domains - 分配域名
// GET /api/domains/:projectId - 获取项目域名
// POST /api/domains/:id/verify - 验证域名
// DELETE /api/domains/:id - 删除域名
```

### 阶段四：外部访问整合（第 8-10 天）

#### 3.4.1 创建统一的外部访问服务

**文件**: `server/src/master/services/externalAccessService.ts`

```typescript
// 整合域名、SSL、反向代理、隧道
// 提供统一的配置接口
```

**任务清单：**
- [ ] 创建 ExternalAccessService 类
- [ ] 实现 `enableExternalAccess()` 方法
- [ ] 实现 `disableExternalAccess()` 方法
- [ ] 实现 `getExternalAccessInfo()` 方法

#### 3.4.2 完善 externalAccess.routes.ts

**文件**: `server/src/master/routes/externalAccess.routes.ts`

**现有功能：**
- ✅ 域名管理路由
- ✅ SSL 证书路由
- ✅ 隧道管理路由
- ✅ 反向代理路由

**需要完善：**
- [ ] 添加部署关联逻辑
- [ ] 实现一键开启外部访问
- [ ] 实现访问统计

### 阶段五：AI Agent 集成（第 11-12 天）

#### 3.5.1 创建部署工具

**文件**: `server/src/master/tools/deploymentTools.ts`

```typescript
// AI 可用的部署工具：
// - deploy_project: 部署项目
// - start_project: 启动项目
// - stop_project: 停止项目
// - enable_external_access: 开启外部访问
// - get_deployment_status: 获取部署状态
// - get_deployment_logs: 获取部署日志
```

#### 3.5.2 更新 Agent 提示词

**文件**: `server/src/master/prompts/systemPromptCore.ts`

**任务清单：**
- [ ] 添加部署相关工具描述
- [ ] 添加外部访问配置说明
- [ ] 更新示例对话

### 阶段六：测试与优化（第 13-14 天）

#### 3.6.1 编写测试用例

**文件**: `server/src/master/__tests__/deployment.test.ts`

**任务清单：**
- [ ] 单元测试
- [ ] 集成测试
- [ ] 端到端测试

#### 3.6.2 性能优化

**任务清单：**
- [ ] Nginx 配置优化
- [ ] 数据库查询优化
- [ ] 缓存策略

---

## 四、数据库迁移计划

### 4.1 已有表确认

以下表已存在：
- ✅ `project_deployments`
- ✅ `domains`
- ✅ `tunnels`
- ✅ `proxy_configs`
- ✅ `ssl_certificates`

### 4.2 需要新增的表/字段

```sql
-- 项目部署表增加字段
ALTER TABLE project_deployments
ADD COLUMN domain_id VARCHAR(36) NULL COMMENT '关联域名ID',
ADD COLUMN external_access_enabled BOOLEAN DEFAULT FALSE COMMENT '外部访问是否启用',
ADD COLUMN external_access_type ENUM('subdomain', 'custom', 'tunnel') DEFAULT NULL,
ADD INDEX idx_domain_id (domain_id);

-- 创建项目端口分配表（避免端口冲突）
CREATE TABLE IF NOT EXISTS project_ports (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  container_id VARCHAR(64) NOT NULL,
  internal_port INT NOT NULL,
  UNIQUE INDEX idx_container_port (container_id, internal_port),
  FOREIGN KEY (project_id) REFERENCES project_deployments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 五、配置文件更新

### 5.1 环境变量

```bash
# .env 文件新增

# 外部访问配置
BASE_DOMAIN=claw-web.com
ENABLE_EXTERNAL_ACCESS=true
NGINX_CONFIG_DIR=/etc/nginx/conf.d
LETSENCRYPT_DIR=/etc/letsencrypt

# Cloudflare 配置（可选）
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ZONE_ID=

# 项目部署配置
PROJECT_MIN_PORT=10000
PROJECT_MAX_PORT=20000
DEFAULT_PROCESS_MANAGER=pm2
```

### 5.2 Docker Compose 更新

```yaml
# docker-compose.yml 新增 nginx 服务

nginx:
  image: nginx:alpine
  container_name: claw-web-nginx
  restart: unless-stopped
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./nginx/conf.d:/etc/nginx/conf.d
    - ./nginx/ssl:/etc/nginx/ssl
    - ./nginx/logs:/var/log/nginx
  networks:
    - claude-network
    - worker-network
  depends_on:
    - master
```

---

## 六、API 接口设计

### 6.1 部署管理 API

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/deployments` | 创建部署 |
| GET | `/api/deployments` | 列出租户部署 |
| GET | `/api/deployments/:id` | 获取部署详情 |
| POST | `/api/deployments/:id/start` | 启动项目 |
| POST | `/api/deployments/:id/stop` | 停止项目 |
| DELETE | `/api/deployments/:id` | 删除部署 |
| GET | `/api/deployments/:id/logs` | 获取日志 |

### 6.2 外部访问 API

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/external-access/enable` | 开启外部访问 |
| POST | `/api/external-access/disable` | 关闭外部访问 |
| GET | `/api/external-access/:projectId` | 获取访问信息 |

### 6.3 请求/响应示例

**创建部署：**
```json
// POST /api/deployments
{
  "name": "my-app",
  "type": "nodejs",
  "sourceType": "git",
  "sourceUrl": "https://github.com/user/repo.git",
  "buildCommand": "npm install && npm run build",
  "startCommand": "npm start",
  "envVars": {
    "NODE_ENV": "production",
    "PORT": "3000"
  },
  "enableExternalAccess": true
}

// Response
{
  "success": true,
  "data": {
    "projectId": "proj-123-uuid",
    "name": "my-app",
    "status": "building",
    "domain": "proj-123.claw-web.com",
    "publicUrl": "https://proj-123.claw-web.com"
  }
}
```

---

## 七、安全考虑

### 7.1 网络安全

- [ ] Worker 容器网络隔离（已完成）
- [ ] 子域名访问控制
- [ ] 速率限制
- [ ] IP 白名单/黑名单

### 7.2 应用安全

- [ ] 项目间资源隔离
- [ ] 环境变量加密存储
- [ ] 敏感信息过滤

### 7.3 运维安全

- [ ] 部署操作审计日志
- [ ] 异常访问监控
- [ ] 自动 SSL 证书续期

---

## 八、实施时间表

| 阶段 | 任务 | 预计时间 |
|------|------|----------|
| 阶段一 | Worker 容器增强 | 2 天 |
| 阶段二 | 部署服务完善 | 2 天 |
| 阶段三 | 域名与反向代理 | 3 天 |
| 阶段四 | 外部访问整合 | 3 天 |
| 阶段五 | AI Agent 集成 | 2 天 |
| 阶段六 | 测试与优化 | 2 天 |
| **总计** | | **14 天** |

---

## 九、风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| 端口冲突 | 高 | 使用端口分配表，动态分配 |
| Nginx 配置错误 | 高 | 配置验证、自动回滚 |
| SSL 证书过期 | 中 | 自动续期、过期提醒 |
| Worker 容器重启 | 中 | 项目自动重启、状态恢复 |
| 资源超限 | 中 | 配额限制、资源监控 |

---

## 十、后续优化方向

1. **自动扩缩容**：根据负载自动调整资源
2. **多区域部署**：支持多地部署和负载均衡
3. **自定义域名**：支持用户绑定自己的域名
4. **CDN 集成**：静态资源加速
5. **监控告警**：完善的监控和告警体系

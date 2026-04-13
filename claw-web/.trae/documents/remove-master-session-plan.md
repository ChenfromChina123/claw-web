# 取消会话管理中的主会话区分计划

## 目标
取消会话管理中的主会话（Master Session）与其他会话的区分，使所有会话在UI上显示一致，不再有特殊的主会话标识和样式。

## 当前实现分析

### 主会话的概念
主会话原本用于管理 skills 和用户配置，具有以下特殊处理：
- 数据库中有 `is_master` 字段标记
- 前端UI有特殊的星标图标和黄色渐变样式
- 会话列表中主会话始终排在最前面
- 后端有专门的主会话创建和管理逻辑

### 涉及的文件

#### 前端文件
1. `web/src/types/session.ts` - Session 类型定义
2. `web/src/components/ChatSidebar.vue` - 会话侧边栏组件
3. `web/src/components/SessionSwitcher.vue` - 会话切换器组件

#### 后端文件
1. `server/src/models/types.ts` - Session 类型定义
2. `server/src/db/repositories/sessionRepository.ts` - 会话仓库
3. `server/src/services/sessionManager.ts` - 会话管理器
4. `server/src/db/mysql.ts` - 数据库初始化
5. `server/src/tools/sessionManagementTool.ts` - 会话管理工具
6. `server/src/services/conversation/sessionConversationManager.ts` - 会话对话管理器

---

## 实施步骤

### 第一步：修改前端类型定义

#### 1.1 修改 `web/src/types/session.ts`
- 移除 `isMaster?: boolean` 字段（第17行）

### 第二步：修改前端UI组件

#### 2.1 修改 `web/src/components/ChatSidebar.vue`

**移除主会话排序逻辑：**
- 移除第73-78行的主会话排序代码

**移除主会话样式类：**
- 移除第288行的 `'master-session': session.isMaster` 类绑定

**移除主会话星标徽章：**
- 移除第293行的 `<span v-if="session.isMaster" class="master-badge">⭐</span>`

**移除主会话样式CSS：**
- 移除第660-700行的所有主会话相关样式：
  - `.session-item.master-session` 样式
  - `.session-item.master-session::before` 样式
  - `.session-item.master-session:hover` 样式
  - `.session-item.master-session.active` 样式
  - `.master-badge` 样式
  - `@keyframes starPulse` 动画

#### 2.2 修改 `web/src/components/SessionSwitcher.vue`

**移除主会话排序逻辑：**
- 移除第39-45行的主会话排序代码

**移除主会话星标显示：**
- 移除第160-162行的主会话星标图标

**移除主会话样式类：**
- 移除第153行的 `master: session.isMaster` 类绑定

**移除主会话星标样式CSS：**
- 移除第253-257行的 `.master-star` 样式

### 第三步：修改后端类型定义

#### 3.1 修改 `server/src/models/types.ts`
- 移除 `isMaster?: boolean` 字段（第31行）

### 第四步：修改后端数据库相关代码

#### 4.1 修改 `server/src/db/repositories/sessionRepository.ts`

**修改 `create` 方法：**
- 移除 `isMaster` 参数（第7行）
- 移除 SQL 语句中的 `is_master` 字段（第12-13行）

**修改 `save` 方法：**
- 移除 `isMasterValue` 变量（第105行）
- 移除 SQL 语句中的 `is_master` 字段（第108-109行）

**修改 `mapToSession` 方法：**
- 移除 `isMaster` 字段映射（第164行）

#### 4.2 修改 `server/src/db/mysql.ts`
- 移除第176-180行添加 `is_master` 字段的代码

### 第五步：修改后端会话管理器

#### 5.1 修改 `server/src/services/sessionManager.ts`

**移除主会话相关方法：**
- 移除 `cleanupDuplicateMasterSessions` 方法（第220-257行）
- 移除 `getOrCreateMasterSession` 方法（第264-279行）

**修改 `createSession` 方法调用：**
- 修改第276行的 `sessionRepo.create` 调用，移除 `isMaster` 参数

### 第六步：修改会话管理工具

#### 6.1 修改 `server/src/tools/sessionManagementTool.ts`

**修改 `SessionInfo` 接口：**
- 移除 `isMaster: boolean` 字段（第25行）

**修改 `list` 操作返回数据：**
- 移除第118行的 `isMaster: s.isMaster || false`

### 第七步：修改会话对话管理器

#### 7.1 修改 `server/src/services/conversation/sessionConversationManager.ts`

**修改 `initializeSessionWorkspace` 方法：**
- 移除第72-78行对 `isMaster` 的判断逻辑
- 简化为统一的工作区初始化逻辑

### 第八步：重新构建和测试

1. 删除所有容器并重新构建项目：
   ```bash
   cd d:\Users\Administrator\AistudyProject\HAHA\claw-web
   docker compose -f docker-compose.yml down
   docker compose -f docker-compose.yml up -d --build
   ```

2. 验证前端UI：
   - 所有会话显示样式一致
   - 没有星标图标
   - 没有特殊的黄色渐变背景

3. 验证后端功能：
   - 会话创建正常
   - 会话列表加载正常
   - 会话切换正常

---

## 注意事项

1. **数据库兼容性**：现有的 `is_master` 字段会保留在数据库中，但不再使用。如果需要完全清理，可以执行：
   ```sql
   ALTER TABLE sessions DROP COLUMN is_master;
   ```

2. **向后兼容**：前端代码移除 `isMaster` 字段后，即使后端返回该字段也不会报错，只是会被忽略。

3. **工作区逻辑**：移除主会话后，所有会话都将使用独立的工作区，不再有特殊的用户主目录逻辑。

---

## 文件修改清单

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| `web/src/types/session.ts` | 删除字段 | 移除 `isMaster` 字段 |
| `web/src/components/ChatSidebar.vue` | 删除代码 | 移除主会话排序、样式、徽章 |
| `web/src/components/SessionSwitcher.vue` | 删除代码 | 移除主会话排序、星标显示 |
| `server/src/models/types.ts` | 删除字段 | 移除 `isMaster` 字段 |
| `server/src/db/repositories/sessionRepository.ts` | 修改方法 | 移除 `isMaster` 参数和处理 |
| `server/src/services/sessionManager.ts` | 删除方法 | 移除主会话相关方法 |
| `server/src/db/mysql.ts` | 删除代码 | 移除 `is_master` 字段添加 |
| `server/src/tools/sessionManagementTool.ts` | 删除字段 | 移除 `isMaster` 字段 |
| `server/src/services/conversation/sessionConversationManager.ts` | 简化逻辑 | 移除 `isMaster` 判断 |

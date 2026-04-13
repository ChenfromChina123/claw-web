# 前端用户配额管理功能使用指南

## 概述

前端用户配额管理功能为用户提供了直观的资源使用情况展示，并支持管理员灵活管理用户等级和配额。

## 功能特性

### 1. 用户配额面板 (UserQuotaPanel)

**位置**: 设置 → 我的配额

**功能**:
- ✅ 显示当前用户等级和配额信息
- ✅ 实时展示资源使用情况（CPU、内存、存储）
- ✅ 可视化进度条显示使用百分比
- ✅ 资源使用警告提示（超过80%时自动显示）
- ✅ 显示活跃会话数、PTY进程数、文件数等详细信息
- ✅ 支持自定义配额标识

**资源警告阈值**:
- 🟢 0-60%: 资源充裕（绿色）
- 🟡 60-80%: 资源充足（黄色）
- 🔴 80%+: 资源紧张（红色，显示警告）

**使用示例**:

```vue
<template>
  <UserQuotaPanel />
</template>

<script setup>
import UserQuotaPanel from '@/components/UserQuotaPanel.vue'
</script>
```

### 2. 套餐对比组件 (TierComparison)

**位置**: 设置 → 套餐对比

**功能**:
- ✅ 展示所有用户等级的套餐详情
- ✅ 对比不同等级的资源配额
- ✅ 显示价格和订阅周期
- ✅ 支持一键升级（功能开发中）
- ✅ 标注最受欢迎套餐
- ✅ 响应式设计，支持移动端

**套餐信息**:

| 等级 | 价格 | CPU | 内存 | 存储 | 适用场景 |
|------|------|-----|------|------|----------|
| 免费用户 | 免费 | 0.5核 | 256MB | 200MB | 轻度使用 |
| 基础会员 | ¥29/月 | 1.0核 | 512MB | 500MB | 个人开发者 |
| 专业会员 | ¥99/月 | 2.0核 | 1024MB | 2GB | 专业开发者 |
| 企业会员 | ¥299/月 | 4.0核 | 2048MB | 10GB | 团队协作 |
| 管理员 | 联系客服 | 8.0核 | 4096MB | 50GB | 系统管理员 |

**使用示例**:

```vue
<template>
  <TierComparison />
</template>

<script setup>
import TierComparison from '@/components/TierComparison.vue'
</script>
```

### 3. 用户管理组件 (UserManagement)

**位置**: 设置 → 用户管理（仅管理员可见）

**功能**:
- ✅ 查看所有用户列表
- ✅ 编辑用户等级
- ✅ 设置订阅过期时间
- ✅ 为用户设置自定义配额
- ✅ 分页显示用户信息
- ✅ 显示用户登录状态

**管理员操作**:

1. **修改用户等级**:
   - 点击用户行的"编辑等级"按钮
   - 选择目标等级
   - 设置订阅过期时间（可选）
   - 保存更改

2. **设置自定义配额**:
   - 点击用户行的"自定义配额"按钮
   - 填写需要调整的资源配额
   - 留空的项目将使用默认值
   - 保存设置

**使用示例**:

```vue
<template>
  <UserManagement v-if="isAdmin" />
</template>

<script setup>
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import UserManagement from '@/components/UserManagement.vue'

const authStore = useAuthStore()
const isAdmin = computed(() => authStore.user?.isAdmin)
</script>
```

## API接口说明

### 用户配额API (userTierApi)

#### 1. 获取所有等级配额

```typescript
import { userTierApi } from '@/api'

const quotas = await userTierApi.getAllQuotas()
// 返回: Record<UserTier, HardwareQuota>
```

#### 2. 获取当前用户配额

```typescript
const myQuota = await userTierApi.getMyQuota()
// 返回: UserQuotaInfo
```

#### 3. 获取资源使用统计

```typescript
const stats = await userTierApi.getUsageStats(userId)
// 返回: ResourceUsageStats
```

#### 4. 更新用户等级（管理员）

```typescript
await userTierApi.updateUserTier(userId, 'pro', '2025-12-31T23:59:59Z')
```

#### 5. 设置自定义配额（管理员）

```typescript
await userTierApi.setCustomQuota(userId, {
  cpuLimit: 3.0,
  memoryLimitMB: 1536,
  storageQuotaMB: 3000
})
```

#### 6. 获取所有用户列表（管理员）

```typescript
const users = await userTierApi.getAllUsers()
// 返回: UserWithTier[]
```

## 集成到现有项目

### 1. 在设置页面中集成

已自动集成到设置页面，包含以下标签页：
- 我的配额
- 套餐对比
- 用户管理（仅管理员）

### 2. 在其他页面中使用

```vue
<template>
  <div>
    <!-- 显示用户配额信息 -->
    <UserQuotaPanel />
    
    <!-- 显示套餐对比 -->
    <TierComparison />
    
    <!-- 用户管理（仅管理员） -->
    <UserManagement v-if="isAdmin" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import UserQuotaPanel from '@/components/UserQuotaPanel.vue'
import TierComparison from '@/components/TierComparison.vue'
import UserManagement from '@/components/UserManagement.vue'

const authStore = useAuthStore()
const isAdmin = computed(() => authStore.user?.isAdmin)
</script>
```

### 3. 自定义资源警告阈值

可以在组件中修改警告阈值：

```typescript
// 在 UserQuotaPanel.vue 中修改
const warnings = computed(() => {
  const warns: string[] = []
  
  // 修改阈值为 70%
  if (memoryUsagePercent.value >= 70) {
    warns.push(`内存使用率已达 ${memoryUsagePercent.value.toFixed(1)}%`)
  }
  
  return warns
})
```

## 样式自定义

### 修改主题颜色

```css
/* 在组件的 <style scoped> 中修改 */
.tier-card {
  /* 修改卡片样式 */
}

.tier-price {
  /* 修改价格样式 */
}

.resource-item {
  /* 修改资源项样式 */
}
```

### 响应式设计

组件已内置响应式设计，支持：
- 桌面端（> 1200px）: 5列布局
- 平板端（768px - 1200px）: 2-3列布局
- 移动端（< 768px）: 单列布局

## 注意事项

1. **权限控制**:
   - 用户管理功能仅对管理员可见
   - 普通用户只能查看自己的配额信息
   - 管理员可以修改所有用户的等级和配额

2. **数据刷新**:
   - 配额信息在页面加载时自动获取
   - 使用统计实时计算
   - 管理员操作后需要手动刷新列表

3. **错误处理**:
   - API调用失败时会显示错误提示
   - 网络异常时显示友好的错误信息
   - 所有操作都有加载状态提示

4. **性能优化**:
   - 使用computed缓存计算结果
   - 组件按需加载
   - 避免不必要的重新渲染

## 故障排查

### 问题1: 配额信息不显示

**解决方案**:
1. 检查用户是否已登录
2. 确认后端API是否正常运行
3. 检查浏览器控制台是否有错误

### 问题2: 资源警告不触发

**解决方案**:
1. 检查资源使用率是否达到阈值
2. 确认警告功能未被关闭
3. 查看组件的computed属性是否正常计算

### 问题3: 管理员功能不可见

**解决方案**:
1. 确认用户是否具有管理员权限
2. 检查authStore.user.isAdmin的值
3. 查看导航项是否被正确过滤

## 未来规划

- [ ] 支持套餐升级支付功能
- [ ] 添加资源使用历史图表
- [ ] 支持配额预警通知
- [ ] 添加资源使用报告导出
- [ ] 支持多语言国际化

## 技术支持

如有问题或建议，请联系开发团队或提交Issue。

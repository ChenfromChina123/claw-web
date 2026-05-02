# 气泡主题功能实施计划

## 需求分析

当前用户消息气泡在浅色模式下为纯黑背景（`#000000`），深色模式下为靛蓝紫（`#6366F1`），用户觉得太丑，希望能在设置中选择不同的气泡主题样式。

## 设计方案

### 气泡主题定义

提供 6 种预设气泡主题，每种主题包含浅色/深色两套配色：

| 主题名称 | 浅色模式背景 | 深色模式背景 | 文字色 |
|---------|------------|------------|-------|
| 经典黑 (CLASSIC) | #000000 | #6366F1 | 白色 |
| 海洋蓝 (OCEAN) | #007AFF | #3B82F6 | 白色 |
| 薄荷绿 (MINT) | #059669 | #34D399 | 白色 |
| 薰衣紫 (LAVENDER) | #7C3AED | #8B5CF6 | 白色 |
| 日落橙 (SUNSET) | #EA580C | #FB923C | 白色 |
| 樱花粉 (SAKURA) | #DB2777 | #F472B6 | 白色 |

### 架构设计

采用与现有 `ThemeMode` 一致的架构模式：
- `BubbleTheme` 枚举定义主题选项
- `BubbleThemeColors` 数据类封装气泡颜色
- `LocalBubbleTheme` CompositionLocal 传递主题
- `ThemePreferencesStore` 扩展持久化存储
- `SettingsDrawer` 新增气泡主题选择区域

## 实施步骤

### 步骤 1：创建气泡主题定义文件

**新建文件**: `chat_application/app/src/main/java/com/example/claw_code_application/ui/theme/BubbleTheme.kt`

内容：
- `BubbleTheme` 枚举（CLASSIC, OCEAN, MINT, LAVENDER, SUNSET, SAKURA）
- `BubbleThemeColors` 数据类（background: Color, textColor: Color）
- `getBubbleThemeColors(bubbleTheme, darkTheme)` 函数
- `LocalBubbleTheme` CompositionLocal
- `BubbleTheme.current` 便捷访问对象

### 步骤 2：扩展 ThemePreferencesStore 持久化

**修改文件**: `chat_application/app/src/main/java/com/example/claw_code_application/data/local/ThemePreferencesStore.kt`

- 新增 `KEY_BUBBLE_THEME = "bubble_theme"` 常量
- 新增 `DEFAULT_BUBBLE_THEME = "OCEAN"` 默认值（改为海洋蓝作为默认，比黑色好看）
- 新增 `saveBubbleTheme(theme: String)` 方法
- 新增 `getBubbleThemeSync(): String` 方法
- 新增 `bubbleThemeFlow: Flow<String>` 响应式流

### 步骤 3：在 Theme.kt 中注入气泡主题

**修改文件**: `chat_application/app/src/main/java/com/example/claw_code_application/ui/theme/Theme.kt`

- `ClawCodeApplicationTheme` 新增 `bubbleTheme: BubbleTheme = BubbleTheme.OCEAN` 参数
- 在 `CompositionLocalProvider` 中同时提供 `LocalBubbleTheme`
- 调用 `getBubbleThemeColors(bubbleTheme, darkTheme)` 获取颜色

### 步骤 4：修改 MainActivity 传递气泡主题状态

**修改文件**: `chat_application/app/src/main/java/com/example/claw_code_application/MainActivity.kt`

- 新增 `currentBubbleTheme` 状态变量
- `LaunchedEffect` 中加载已保存的气泡主题
- `ClawCodeApplicationTheme` 传入 `bubbleTheme` 参数
- `onBubbleThemeChange` 回调处理切换 + 持久化
- 传递给 `ChatMainScreen` -> `SettingsDrawer`

### 步骤 5：SettingsDrawer 新增气泡主题选择区域

**修改文件**: `chat_application/app/src/main/java/com/example/claw_code_application/ui/chat/components/SettingsDrawer.kt`

- `SettingsDrawer` 新增 `currentBubbleTheme: BubbleTheme` 和 `onBubbleThemeChange: (BubbleTheme) -> Unit` 参数
- 新增 `BubbleThemeSection` 组件，在 `ThemeSection` 下方显示
- 每个主题选项显示一个彩色圆点预览 + 主题名称
- 选中状态使用与 `ThemeOption` 一致的样式

### 步骤 6：修改 EnhancedMessageBubble 使用气泡主题

**修改文件**: `chat_application/app/src/main/java/com/example/claw_code_application/ui/chat/components/EnhancedMessageBubble.kt`

- 用户气泡背景色改为 `BubbleTheme.current.background`
- 用户气泡文字色改为 `BubbleTheme.current.textColor`
- 移除对 `colors.UserBubbleBackground` 和 `colors.Surface` 的依赖（仅用户气泡部分）

### 步骤 7：同步 AppColor.kt

**修改文件**: `chat_application/app/src/main/java/com/example/claw_code_application/ui/theme/AppColor.kt`

- `UserBubbleBackground` 保留但标记为 deprecated，兼容旧代码
- 实际用户气泡颜色由 `BubbleTheme` 系统接管

## 数据流

```
用户在设置中选择气泡主题
    ↓
SettingsDrawer.BubbleThemeSection.onBubbleThemeChange(BubbleTheme)
    ↓
MainActivity.ChatMainScreen.onBubbleThemeChange
    ↓
1. currentBubbleTheme = newTheme（更新 Compose 状态）
2. themePreferencesStore.saveBubbleTheme("OCEAN")（持久化）
    ↓
ClawCodeApplicationTheme(bubbleTheme = currentBubbleTheme)
    ↓
CompositionLocalProvider(LocalBubbleTheme provides bubbleThemeColors)
    ↓
EnhancedMessageBubble → BubbleTheme.current.background / textColor
```

## 涉及文件清单

| 文件 | 操作 | 预估行数变化 |
|------|------|------------|
| `ui/theme/BubbleTheme.kt` | 新建 | ~120行 |
| `data/local/ThemePreferencesStore.kt` | 修改 | +30行 |
| `ui/theme/Theme.kt` | 修改 | +10行 |
| `MainActivity.kt` | 修改 | +25行 |
| `ui/chat/components/SettingsDrawer.kt` | 修改 | +80行 |
| `ui/chat/components/EnhancedMessageBubble.kt` | 修改 | +5行 |
| `ui/theme/AppColor.kt` | 修改 | +3行 |

## 验证标准

1. 设置页面能看到 6 种气泡主题选项，带彩色圆点预览
2. 选择不同主题后，聊天页面用户气泡立即变色
3. 切换浅色/深色模式后，气泡颜色正确适配
4. 重启应用后，气泡主题设置保持不变
5. 默认气泡主题为海洋蓝（比黑色更好看）

# 消息列表顶部适配动态岛/刘海屏改造计划

## 目标
将消息列表（SessionListScreen）的顶部改造成图1（Manus风格）的效果——为移动端设备的**动态岛/刘海屏/状态栏区域**预留空白空间，避免内容被遮挡。

## 当前问题分析
- 项目已启用 `enableEdgeToEdge()`（全屏边缘到边缘模式）
- 但 `TopAppBarWithSearch` 组件（[SessionListScreen.kt:145-233](app/src/main/java/com/example/claw_code_application/ui/chat/SessionListScreen.kt#L145-L233)）未处理 **WindowInsets（安全区域）**
- 当前顶部 padding 仅 `vertical = 12.dp`，未包含状态栏高度，导致内容紧贴状态栏/动态岛

## 改造方案

### 方案：使用 `WindowInsets.statusBars` 适配安全区域（推荐）

在 `TopAppBarWithSearch` 组件中添加系统状态栏内边距，自动适配所有设备（刘海屏、动态岛、水滴屏等）。

#### 具体修改

**修改文件**: [SessionListScreen.kt](app/src/main/java/com/example/claw_code_application/ui/chat/SessionListScreen.kt)

**修改点1 — TopAppBarWithSearch 组件（第157行）**

在 `Column(modifier = Modifier.background(surfaceColor))` 上添加 `.statusBarsPadding()` 或 `.windowInsetsPadding(WindowInsets.statusBars)`：

```kotlin
// 修改前 (第157行)
Column(modifier = Modifier.background(surfaceColor)) {

// 修改后
Column(
    modifier = Modifier
        .background(surfaceColor)
        .windowInsetsPadding(WindowInsets.statusBars)  // 新增：为状态栏/动态岛预留空间
) {
```

需要新增 import：
```kotlin
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
```

#### 效果说明
- 自动获取设备状态栏/动态岛的高度作为顶部 padding
- 在 iPhone 等有动态岛的设备上，标题栏会自动下移，避开动态岛区域
- 在普通设备上也会正确适配状态栏高度
- 与图1 Manus 风格效果一致

## 修改范围
| 文件 | 修改内容 |
|------|----------|
| SessionListScreen.kt | TopAppBarWithSearch 添加 WindowInsets.statusBars padding + 相关 import |

## 验证方式
1. 编译运行应用，观察消息列表页面顶部是否有适当留白
2. 确认搜索栏展开/收起动画正常
3. 确认标签栏和列表项布局不受影响

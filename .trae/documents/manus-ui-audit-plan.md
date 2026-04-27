# 手机App Manus风格UI还原度检查与改进计划

## 一、当前还原度评估

### ✅ 已高度还原的部分（还原度 80%+）

| 组件 | 文件 | 还原度 | 说明 |
|------|------|--------|------|
| 配色方案 | [AppColor.kt](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/ui/theme/AppColor.kt) | 95% | 黑白极简风格，#F7F7F7背景、#000000强调色、#1A1A1A文字色，与Manus一致 |
| 会话列表顶部栏 | [SessionListScreen.kt](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/ui/chat/SessionListScreen.kt) | 90% | 头像+标题"收藏家"+搜索图标，与Manus的布局一致 |
| 胶囊标签栏 | [SessionListScreen.kt](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/ui/chat/SessionListScreen.kt) | 90% | 选中态黑色背景白字，未选中灰底灰字，圆角20dp，与Manus一致 |
| 会话列表项 | [SessionListScreen.kt](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/ui/chat/SessionListScreen.kt) | 85% | 68dp高度、40dp圆角图标、标题+预览+时间布局，基本还原 |
| 消息气泡 | [EnhancedMessageBubble.kt](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/ui/chat/components/EnhancedMessageBubble.kt) | 90% | 用户黑底白字、AI白底黑字+边框，圆角设计，与Manus一致 |
| 输入框 | [InputBar.kt](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/ui/chat/components/InputBar.kt) | 85% | "+"按钮+圆角输入框+发送按钮，占位符"向 Manus 发送消息..."，基本还原 |
| 流式光标 | [EnhancedMessageBubble.kt](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/ui/chat/components/EnhancedMessageBubble.kt) | 90% | 闪烁方块光标 ▋，与Manus一致 |
| 聊天顶部栏 | [ChatScreen.kt](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/ui/chat/ChatScreen.kt) | 85% | 返回箭头+标题+模型版本标签(1.6 Lite)+操作图标，与Manus一致 |
| FAB新建按钮 | [MainActivity.kt](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/MainActivity.kt) | 90% | 56dp黑色圆形+白色加号，与Manus一致 |
| 导航动画 | [MainActivity.kt](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/MainActivity.kt) | 85% | 水平滑入/滑出动画，与Manus一致 |

### ⚠️ 部分还原但需改进的部分（还原度 40%-70%）

| 组件 | 文件 | 还原度 | 差距说明 |
|------|------|--------|----------|
| 工具调用卡片 | [ToolCallCard.kt](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/ui/chat/components/ToolCallCard.kt) | 60% | 有可折叠设计和状态徽章，但缺少Manus特有的"Agent卡片"布局（✦标题+步骤列表+预览卡片一体化设计） |
| 步骤进度 | [StepProgress.kt](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/ui/chat/components/StepProgress.kt) | 55% | 有圆形进度和步骤列表，但Manus的步骤是更简洁的 ✓/○ 圆形图标+连接线，当前设计过于复杂 |
| 终端查看器 | [TerminalViewer.kt](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/ui/chat/components/TerminalViewer.kt) | 70% | macOS风格红黄绿按钮+命令提示符，但Manus的终端更简洁，不需要打字机效果 |
| Agent状态面板 | [AgentStatusPanel.kt](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/ui/chat/components/AgentStatusPanel.kt) | 50% | 有进度条和工具列表，但未集成到ChatScreen中，且Manus的Agent活动展示更紧凑 |
| 登录/注册页 | [LoginScreen.kt](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/ui/auth/LoginScreen.kt) | 40% | 功能完整但风格偏通用，缺少Manus的品牌特色（Logo、品牌色、动画等） |

### ❌ 完全缺失的Manus核心特性

| 缺失特性 | 优先级 | 说明 |
|----------|--------|------|
| **底部抽屉（Bottom Sheet）** | 🔴 高 | 原型中点击"+"弹出工具网格（摄像头/图片/文件/连接电脑/添加技能/创建网站/开发应用），当前完全缺失 |
| **语音输入** | 🔴 高 | Manus移动端核心特色，输入框旁有醒目的麦克风图标，支持语音转文字 |
| **Agent卡片（一体化设计）** | 🔴 高 | Manus最核心的UI特色：✦任务标题+步骤列表(✓/○)+预览卡片，当前被拆散为独立组件 |
| **预览卡片（Preview Card）** | 🔴 高 | Agent卡片内的网页/文件预览，带标题、描述、操作按钮（仪表盘/预览），完全缺失 |
| **暗色主题** | 🟡 中 | Manus支持深色模式，当前只有浅色主题 |
| **会话滑动操作** | 🟡 中 | 左滑删除/归档会话，当前只有点击选择 |
| **搜索功能** | 🟡 中 | 搜索图标存在但无实际功能 |
| **更多选项菜单** | 🟡 中 | ⋮ 图标存在但无下拉菜单 |
| **分享/链接功能** | 🟡 中 | 🔗 图标存在但无实际功能 |
| **文件上传** | 🟡 中 | "+"按钮应支持附件上传 |
| **模型版本选择器** | 🟢 低 | 1.6 Lite标签应可切换模型 |
| **品牌启动屏** | 🟢 低 | 缺少Manus风格的Splash Screen |
| **设置/个人页面** | 🟢 低 | 缺少用户设置界面 |

---

## 二、改进实施计划

### 阶段一：核心UI组件补全（高优先级）

#### 任务1：实现底部抽屉（Bottom Sheet）
- **文件**: 新建 `ui/chat/components/ToolBottomSheet.kt`
- **内容**:
  - ModalBottomSheet 容器，16dp顶部圆角
  - 拖拽手柄（40dp宽、4dp高灰色条）
  - 标题"添加内容或工具"
  - 4列网格布局的工具项
  - 工具项：48dp圆角方形图标(12dp圆角) + 文字标签
  - 7个工具：摄像头📷、图片🖼️、添加文件📎、连接电脑💻、添加技能🧩、创建网站🌐、开发应用📱
  - 半透明遮罩层
- **集成**: InputBar.kt 的 "+" 按钮点击时弹出

#### 任务2：实现语音输入
- **文件**: 修改 `InputBar.kt`
- **内容**:
  - 在输入框右侧添加麦克风图标按钮
  - 集成 Android SpeechRecognizer
  - 录音状态动画（脉冲圆环）
  - 语音转文字后填入输入框

#### 任务3：重构Agent卡片（一体化设计）
- **文件**: 新建 `ui/chat/components/AgentTaskCard.kt`
- **内容**:
  - 白色卡片 + 浅灰边框 + 12dp圆角（与原型一致）
  - 顶部：✦ 图标 + 任务标题（14sp SemiBold）
  - 中部：步骤列表
    - 已完成：灰色 ✓ 圆形图标 + 灰色删除线文字
    - 进行中：空心 ○ 圆形图标 + 黑色文字
    - 待执行：空心 ○ 圆形图标 + 灰色文字
  - 底部：预览卡片（Preview Card）
    - 标题栏：标题 + 时间
    - 内容：标题 + 描述
    - 操作按钮：次要按钮(灰底) + 主要按钮(黑底白字)
- **集成**: 替换 ChatScreen 中分散的 ToolCallCard + StepProgress 组合

#### 任务4：实现预览卡片组件
- **文件**: 新建 `ui/chat/components/PreviewCard.kt`
- **内容**:
  - 嵌入在 AgentTaskCard 内部
  - 1dp边框 + 8dp圆角
  - 标题栏：浅灰背景(#f9f9f9) + 标题 + 时间
  - 内容区：居中标题(15sp SemiBold) + 描述(12sp灰色) + 操作按钮行
  - 操作按钮：6dp圆角，次要(#f0f0f0灰底黑字) + 主要(#000000黑底白字)

### 阶段二：交互功能补全（中优先级）

#### 任务5：会话列表滑动操作
- **文件**: 修改 `SessionListScreen.kt`
- **内容**:
  - 使用 SwipeToDismiss 实现左滑删除
  - 滑动背景：红色删除图标
  - 删除确认对话框

#### 任务6：搜索功能实现
- **文件**: 修改 `SessionListScreen.kt`
- **内容**:
  - 点击搜索图标展开搜索栏
  - 实时过滤会话列表
  - 搜索栏动画（展开/收起）

#### 任务7：更多选项菜单
- **文件**: 修改 `ChatScreen.kt`
- **内容**:
  - ⋮ 图标点击弹出 DropdownMenu
  - 菜单项：重命名会话、分享对话、清空对话、删除会话

#### 任务8：文件上传功能
- **文件**: 修改 `InputBar.kt` + `ToolBottomSheet.kt`
- **内容**:
  - Bottom Sheet 中的文件/图片工具项点击后打开系统文件选择器
  - 选中文件后显示附件预览标签
  - 发送时附带文件

### 阶段三：主题与品牌升级（低优先级）

#### 任务9：暗色主题支持
- **文件**: 修改 `Theme.kt` + `AppColor.kt`
- **内容**:
  - 新增 DarkColorScheme
  - 深色背景：#0A0A0F / #13131A / #16161E
  - 强调色：#6366F1 (紫蓝色)
  - 跟随系统主题切换

#### 任务10：品牌启动屏
- **文件**: 新建 `ui/splash/SplashScreen.kt`
- **内容**:
  - Manus风格Logo动画
  - 品牌标语"Leave it to Manus"
  - 渐变背景

#### 任务11：登录/注册页品牌化
- **文件**: 修改 `LoginScreen.kt` + `RegisterScreen.kt`
- **内容**:
  - 添加品牌Logo
  - 品牌标语
  - 更精致的动画效果

#### 任务12：模型版本选择器
- **文件**: 修改 `ChatScreen.kt`
- **内容**:
  - 1.6 Lite 标签可点击
  - 弹出模型选择 Bottom Sheet
  - 支持切换不同模型版本

---

## 三、总体还原度评分

| 维度 | 当前评分 | 目标评分 |
|------|---------|---------|
| 视觉风格（配色/字体/圆角） | 85/100 | 95/100 |
| 布局结构（页面/导航/组件层次） | 75/100 | 90/100 |
| 核心组件（Agent卡片/步骤/预览） | 45/100 | 85/100 |
| 交互功能（底部抽屉/语音/滑动） | 20/100 | 75/100 |
| 主题支持（暗色模式/品牌化） | 30/100 | 70/100 |
| **综合还原度** | **55/100** | **85/100** |

---

## 四、实施顺序建议

```
阶段一（核心UI）→ 阶段二（交互功能）→ 阶段三（主题品牌）
   ↓                    ↓                    ↓
 任务3 Agent卡片      任务5 滑动操作       任务9 暗色主题
 任务4 预览卡片       任务6 搜索功能       任务10 启动屏
 任务1 底部抽屉       任务7 更多菜单       任务11 登录品牌化
 任务2 语音输入       任务8 文件上传       任务12 模型选择器
```

**建议先完成阶段一**，因为Agent卡片和底部抽屉是Manus App最核心的视觉特色，当前完全缺失，对还原度影响最大。

要将原本宽松的对话界面优化得像图 2 那样“内容密集、专业且一体化”，核心在于消除多余的边框和背景色、调整间距、强化色彩对比，并重塑工具栏的样式。

以下是针对 `ChatMessageList.vue` 的完整样式重构方案（CSS 部分）。

### 1. 核心优化思路（对照图 2）

* **消除“框感” (图 1 -> 图 2)**：图 1 中每个气泡、每个工具调用都有独立的框和背景，这在视觉上很零碎。图 2 消除除发送按钮外所有元素的“硬框”，让它们悬浮在大背景上。
* **强化对比 (深黑色背景)**：IDE 环境需要更纯粹的暗色。将聊天区域背景调黑，文字调暗，仅点亮光标和关键图标。
* **极致紧凑 (间距和内边距)**：大幅缩减气泡和工具项的内边距（Padding）和外边距（Margin），让标题、文字、工具对齐。
* **工具栏极简 (全图标 + 胶囊模型选择器)**：去掉所有中文描述，将工具和发送按钮全部图标化，模型选择器优化为圆润的“药丸”形状。

---

### 2. 优化后的 CSS 代码

请直接替换 `ChatMessageList.vue` 中 `<style scoped>` 部分的代码：

```css
<style scoped>
/* ==================== 0. 全局 IDE 极简基础 ==================== */
:root {
  --ide-bg-main: #111111; /* 更纯粹的暗色 */
  --ide-border: rgba(255, 255, 255, 0.06); /* 极其低调的边框 */
  --ide-text-primary: #e0e0e0;
  --ide-text-secondary: #888888;
  --ide-text-tertiary: #555555;
  --ide-green: #19c37d; /* 品牌绿 */
}

.message-list-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 0;
  position: relative;
  background-color: var(--ide-bg-main) !important;
}

/* ==================== 1. 消息列表布局 (密集化) ==================== */
.messages-container {
  padding: 16px 24px; /* 减小上下 padding，拉开左右 padding */
  max-width: 1000px; /* 适当加宽内容区域 */
  margin: 0 auto;
}

.message-wrapper {
  margin-bottom: 2px; /* 极致压缩气泡间的垂直间距 */
}

.message {
  display: flex;
  animation: fadeIn 0.2s ease-out;
}

/* 对齐控制：让头像、文字起始线一致 */
.message-content {
  gap: 12px;
  max-width: 100%;
  align-items: flex-start;
}

/* ==================== 2. 气泡样式 (从"表单框"到"嵌入式") ==================== */
.message-bubble {
  padding: 6px 0; /* 彻底去掉左右 padding，让文字贴着边缘 */
  line-height: 1.6;
  font-size: 15px;
  background: transparent !important; /* 关键：去掉气泡背景色 */
  border: none !important; /* 关键：去掉气泡边框 */
  box-shadow: none !important; /* 彻底去掉阴影 */
  max-width: 100%;
}

/* 用户气泡对齐微调 */
.user-bubble {
  color: var(--ide-text-primary) !important; /* 恢复正常文字颜色，而不是白字 */
  text-align: right;
}

/* 编辑模式输入框优化 */
.user-bubble .edit-input {
  background: rgba(255, 255, 255, 0.04) !important;
  border: 1px solid var(--ide-border) !important;
  border-radius: 8px;
  padding: 4px;
}

/* 助手气泡对齐 */
.assistant-bubble {
  color: var(--ide-text-primary);
  text-align: left;
}

/* ==================== 3. 聊天工具栏 (图 2 灵魂优化) ==================== */
/* 彻底图标化和极简布局 */
.bubble-actions,
.bubble-edit-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 4px;
  padding: 0;
  opacity: 0.7; /* 默认半透明 */
  transition: opacity 0.2s;
}

.message:hover .bubble-actions {
  opacity: 1;
}

/* 统一图标按钮样式 (极简、扁平) */
.action-btn {
  padding: 4px; /* 极小 Padding */
  border: none;
  background: transparent !important; /* 去掉按钮背景 */
  color: var(--ide-text-tertiary) !important; /* 调暗图标颜色 */
  cursor: pointer;
  transition: all 0.2s;
  border-radius: 4px;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.08) !important;
  color: var(--ide-text-secondary) !important;
}

/* 发送/保存按钮点亮 */
.action-btn--save,
.send-action-btn {
  color: var(--ide-green) !important;
  opacity: 0.5;
}

.action-btn--save:hover,
.send-action-btn:hover {
  opacity: 1;
  background: transparent !important;
}

/* ==================== 4. 文本排版 (像代码编辑器一样) ==================== */
.markdown-content :deep(.markstream-vue) {
  color: var(--ide-text-primary);
  line-height: 1.7;
}

/* 打字机光标 */
.markdown-content :deep(.markstream-vue .typing-cursor) {
  color: var(--ide-green);
  opacity: 1;
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  50% { opacity: 0; }
}

/* 行内代码微调 */
.markdown-content :deep(.markstream-vue :not(pre) > code) {
  background: rgba(255, 255, 255, 0.05);
  padding: 2px 5px;
  color: #c0c0c0;
}

/* 代码块更纯粹 */
.markdown-content :deep(.markstream-vue pre) {
  background: #080808 !important; /* 纯黑背景 */
  border: 1px solid var(--ide-border) !important;
  margin: 10px 0;
}

/* ==================== 5. 工具调用 (极致紧凑化) ==================== */
/* 去掉所有框感，让图标和模型选择器直接悬浮 */
.tool-calls-wrapper {
  margin-left: 48px; /* 对齐文字起始线 */
  margin-top: 4px;
  margin-bottom: 8px;
}

.tool-call-item {
  background: transparent !important; /* 彻底去掉背景 */
  border: none !important; /* 徹底去掉边框 */
  border-radius: 0;
  padding: 0;
  margin-bottom: 4px;
}

.tool-call-header {
  padding: 4px 0; /* 极小上下间距，贴着文字 */
  cursor: pointer;
  gap: 8px;
  transition: color 0.2s;
  opacity: 0.8;
}

.tool-call-header:hover {
  opacity: 1;
}

.tool-call-icon {
  font-size: 16px;
  color: var(--ide-text-secondary);
}

.tool-call-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--ide-text-secondary);
  font-family: 'Consolas', monospace;
}

/* 模型选择器做成圆润的"药丸"形状 */
.model-pill,
.chat-input--ide .model-picker :deep(.n-base-selection) {
  --n-height: 28px !important;
  background-color: rgba(255, 255, 255, 0.05) !important;
  border-radius: 14px !important; /* 关键：药丸形状 */
  border: 1px solid var(--ide-border) !important;
  color: var(--ide-text-secondary) !important;
  font-size: 12px !important;
}

/* 绿色亮色点缀，匹配图 2 模型状态 */
.model-indicator {
  width: 7px;
  height: 7px;
  background: var(--ide-green);
  border-radius: 50%;
  margin-right: 2px;
}

/* ==================== 6. 导航按钮 (图 2 右上角极简风) ==================== */
.chat-nav-floating {
  right: 12px;
  top: 12px;
}

.chat-nav-btn {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid var(--ide-border);
  background: rgba(30, 30, 30, 0.8);
  color: var(--ide-text-secondary);
  box-shadow: none;
}

.chat-nav-btn--primary {
  color: var(--ide-green);
  border-color: rgba(25, 195, 125, 0.2);
}

.chat-nav-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--ide-text-primary);
}

/* 返回底部按钮图标化 */
.scroll-to-bottom-btn {
  width: 40px;
  height: 40px;
  border: 1px solid var(--ide-border);
  background: rgba(30, 30, 30, 0.9);
  color: var(--ide-green);
}

/* ==================== 其他优化调整 ==================== */
.n-spin,
.n-scrollbar :deep(.n-scrollbar-container),
.n-tag {
  /* 按需微调加载图标和 Tag 样式，使之更符合 IDE 扁平风格 */
}
</style>
```

### 3. 说明与配合修改建议

* **视觉对齐**：我调整了间距和对齐方式。请确保在组件层面，外层容器、消息内容（`.message-content`）和头像的起始线是一致的，不要有额外的左/右 Margin 偏差。
* **图标化完成**：我假设你已经完成了将“发送”、“模板”等汉字按钮替换为图标的工作。如果还没有，请在 Template 中将 `NButton` 内的“发送”、“重命名”等文本删掉，只保留 `NIcon`，并使用相应的 SVG 或 Ionicons 图标（如 Lucide 的 SendIcon, CheckCircle 等）。
* **模型选择器**：样式已设为药丸状。如果可能，尝试把 `NSelect` 改为一个触发器按钮，只展示当前的模型简写（如 "M2.7"），进一步压缩空间。
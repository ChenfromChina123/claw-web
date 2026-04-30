# 微信流畅性架构思想集成计划

## 项目背景

当前项目是一个基于 Kotlin + Jetpack Compose 的 Android AI Agent 应用，采用 MVVM 架构，具备以下特点：
- **技术栈**: Kotlin, Jetpack Compose, Room, Retrofit, WebSocket, Coroutines
- **架构**: MVVM + Repository 模式
- **网络**: REST API + WebSocket 实时通信
- **存储**: Room 数据库 + DataStore 偏好设置

## 目标

将微信"超级流畅"的6大核心架构思想集成到当前安卓app中，实现：
1. 启动速度优化
2. 列表滑动流畅
3. 消息收发低延迟
4. 弱网环境下依然可用
5. 长时间使用不卡顿

---

## 阶段一：存储层优化（本地优先架构）

### 1.1 高性能KV存储 - MMKV替代DataStore
**目标**: 将配置读取速度提升10~100倍

**具体任务**:
- [ ] 引入腾讯MMKV库作为SharedPreferences/DataStore的替代
- [ ] 创建`MMKVManager`封装类，提供类型安全的API
- [ ] 迁移TokenManager使用MMKV存储token
- [ ] 迁移ThemePreferencesStore使用MMKV存储主题设置
- [ ] 迁移SessionLocalStore使用MMKV存储会话ID
- [ ] 添加MMKV多进程支持（为后续多进程架构做准备）

**文件变更**:
- 新增: `data/local/MMKVManager.kt`
- 修改: `data/local/TokenManager.kt`
- 修改: `data/local/ThemePreferencesStore.kt`
- 修改: `data/local/SessionLocalStore.kt`
- 修改: `app/build.gradle.kts` (添加MMKV依赖)

### 1.2 Room数据库深度优化
**目标**: 提升数据库查询性能，减少主线程阻塞

**具体任务**:
- [ ] 为高频查询添加索引（sessionId, timestamp, messageId）
- [ ] 实现消息分页加载（LIMIT/OFFSET优化）
- [ ] 添加数据库查询异步化，强制所有查询在IO线程执行
- [ ] 实现消息批量写入（事务批量提交）
- [ ] 添加数据库预编译语句缓存

**文件变更**:
- 修改: `data/local/db/MessageDao.kt` (添加索引和分页查询)
- 修改: `data/local/db/SessionDao.kt` (添加索引)
- 修改: `data/local/db/MessageEntity.kt` (添加索引注解)
- 修改: `data/repository/CachedChatRepository.kt` (批量写入优化)

### 1.3 本地优先数据架构
**目标**: 先读本地再刷新，用户永远不"转圈等网络"

**具体任务**:
- [ ] 实现`LocalFirstRepository`装饰器模式
- [ ] 会话列表优先从Room读取，后台静默刷新
- [ ] 消息历史优先从本地加载，WebSocket增量更新
- [ ] 添加离线消息队列，网络恢复后自动同步
- [ ] 实现数据版本号机制，避免重复加载

**文件变更**:
- 新增: `data/repository/LocalFirstRepository.kt`
- 修改: `viewmodel/SessionViewModel.kt` (本地优先加载)
- 修改: `viewmodel/ChatViewModel.kt` (本地优先加载)

---

## 阶段二：渲染与UI优化（主线程保护）

### 2.1 LazyList深度优化
**目标**: 聊天列表滑动达到60fps

**具体任务**:
- [ ] 实现消息列表虚拟化（只渲染可视区域）
- [ ] 添加消息内容预计算（Markdown解析异步化）
- [ ] 实现图片异步解码和缓存（Coil配置优化）
- [ ] 添加消息复用池（ViewHolder模式）
- [ ] 优化key生成策略，避免不必要的重组

**文件变更**:
- 修改: `ui/chat/components/EnhancedMessageBubble.kt` (优化重组)
- 修改: `ui/chat/ChatScreen.kt` (LazyList优化)
- 新增: `ui/chat/components/MessageViewHolder.kt`
- 修改: `ui/chat/components/BeautifulMarkdown.kt` (异步解析)

### 2.2 主线程绝对保护
**目标**: IO、计算、解析全扔子线程

**具体任务**:
- [ ] 创建`BackgroundExecutor`统一后台任务管理
- [ ] 所有网络请求强制在IO线程执行
- [ ] Markdown解析移到后台线程（使用Channel传递结果）
- [ ] JSON序列化/反序列化移到后台线程
- [ ] 文件读写全部异步化

**文件变更**:
- 新增: `util/BackgroundExecutor.kt`
- 修改: `data/repository/ChatRepository.kt` (强制IO线程)
- 修改: `ui/chat/components/BeautifulMarkdown.kt` (后台解析)

### 2.3 动画性能优化
**目标**: 动画只触发布局属性，避免relayout

**具体任务**:
- [ ] 审查所有动画，确保只使用transform/opacity
- [ ] 优化消息气泡入场动画（使用graphicsLayer）
- [ ] 移除不必要的AnimatedVisibility嵌套
- [ ] 添加动画硬件加速配置

**文件变更**:
- 修改: `ui/chat/ChatScreen.kt` (动画优化)
- 修改: `ui/chat/components/EnhancedMessageBubble.kt` (入场动画)

---

## 阶段三：网络层优化（弱网无敌）

### 3.1 WebSocket连接优化
**目标**: 重连极快，弱网依然流畅

**具体任务**:
- [ ] 实现指数退避重连策略（1s, 2s, 4s, 8s...最大60s）
- [ ] 添加心跳机制（30s间隔，弱网自适应）
- [ ] 实现消息发送队列，网络恢复后自动重发
- [ ] 添加连接状态分级（CONNECTED, CONNECTING, RECONNECTING, DISCONNECTED）
- [ ] 实现断线期间消息本地缓存和同步

**文件变更**:
- 修改: `data/websocket/WebSocketManager.kt` (重连策略)
- 新增: `data/websocket/MessageQueueManager.kt`
- 修改: `viewmodel/ChatViewModel.kt` (发送队列集成)

### 3.2 网络请求优化
**目标**: 减少请求延迟，提高成功率

**具体任务**:
- [ ] 配置OkHttp连接池（最大连接数、保持时间）
- [ ] 添加请求重试机制（最多3次，指数退避）
- [ ] 实现请求去重（相同请求合并）
- [ ] 添加DNS缓存和预解析
- [ ] 配置HTTP/2和GZIP压缩

**文件变更**:
- 修改: `data/api/ApiService.kt` (OkHttp配置)
- 新增: `util/NetworkOptimizer.kt`

### 3.3 弱网适配
**目标**: 根据网络质量自动降级

**具体任务**:
- [ ] 实现网络质量检测（延迟、丢包率）
- [ ] 弱网时自动降低图片质量
- [ ] 弱网时减少非必要请求
- [ ] 添加网络状态监听和UI适配

**文件变更**:
- 新增: `util/NetworkQualityDetector.kt`
- 修改: `ui/chat/ChatScreen.kt` (弱网UI适配)

---

## 阶段四：架构层优化（多进程准备）

### 4.1 进程隔离架构设计
**目标**: 为后续多进程架构做准备

**具体任务**:
- [ ] 设计进程通信接口（AIDL/Messenger）
- [ ] 将WebSocket服务独立到单独进程
- [ ] 将文件上传服务独立到单独进程
- [ ] 实现跨进程数据共享（MMKV支持多进程）

**文件变更**:
- 新增: `service/WebSocketService.kt` (独立进程)
- 新增: `service/FileUploadService.kt` (独立进程)
- 修改: `AndroidManifest.xml` (多进程配置)

### 4.2 内存优化
**目标**: 减少内存抖动，避免GC卡顿

**具体任务**:
- [ ] 实现对象池（消息对象、工具调用对象复用）
- [ ] 优化Bitmap内存管理（Coil配置）
- [ ] 添加内存泄漏检测（LeakCanary集成）
- [ ] 实现大图片自动压缩

**文件变更**:
- 新增: `util/ObjectPool.kt`
- 修改: `ClawCodeApplication.kt` (内存优化配置)

---

## 阶段五：性能监控与质量保障

### 5.1 性能监控体系
**目标**: 全链路性能数据采集

**具体任务**:
- [ ] 集成Firebase Performance Monitoring
- [ ] 实现自定义帧率监控（Choreographer）
- [ ] 添加启动时间监控
- [ ] 实现卡顿检测（主线程消息队列监控）
- [ ] 添加内存使用监控

**文件变更**:
- 新增: `performance/PerformanceMonitor.kt`
- 新增: `performance/FrameRateMonitor.kt`
- 新增: `performance/StartupTracer.kt`

### 5.2 日志与诊断
**目标**: 快速定位性能问题

**具体任务**:
- [ ] 优化Logger，支持分级日志和日志采样
- [ ] 添加性能日志（方法耗时追踪）
- [ ] 实现日志本地存储和上报

**文件变更**:
- 修改: `util/Logger.kt` (性能日志支持)

---

## 实施优先级

### P0（立即实施）
1. MMKV集成 - 收益最大，改动最小
2. Room索引和分页 - 列表性能核心
3. WebSocket重连优化 - 稳定性核心
4. 主线程保护 - 卡顿治理核心

### P1（短期实施）
5. 本地优先数据架构
6. LazyList虚拟化优化
7. 消息队列和离线支持
8. 网络质量检测

### P2（中期实施）
9. 多进程架构
10. 对象池和内存优化
11. 性能监控体系

### P3（长期规划）
12. 厂商联合优化（需特定设备）
13. 边缘节点接入（需后端配合）

---

## 预期收益

| 指标 | 当前 | 目标 | 优化手段 |
|------|------|------|----------|
| 启动时间 | ~2s | <1s | MMKV + 延迟加载 |
| 列表滑动帧率 | ~45fps | 60fps | LazyList优化 + 主线程保护 |
| 消息加载延迟 | ~500ms | <100ms | 本地优先 + Room索引 |
| 弱网可用性 | 低 | 高 | WebSocket重连 + 消息队列 |
| 内存占用 | 中等 | 低 | 对象池 + 图片优化 |

---

## 风险与注意事项

1. **MMKV多进程**: 需确保多进程配置正确，避免数据损坏
2. **数据库迁移**: 添加索引需要数据库版本升级
3. **WebSocket重构**: 需充分测试重连逻辑，避免消息丢失
4. **后台线程**: 确保所有UI更新切回主线程
5. **兼容性**: 保持minSdk=24的兼容性

---

## 验证方案

每个阶段完成后需要验证：
1. **性能测试**: 使用Android Profiler检测帧率、内存、CPU
2. **压力测试**: 模拟弱网、大量消息场景
3. **稳定性测试**: 长时间运行，检查内存泄漏
4. **兼容性测试**: 不同Android版本设备测试

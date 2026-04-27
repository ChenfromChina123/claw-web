# 手机 App Token 保存机制问题检查与修复计划

## 一、当前 Token 存储机制概述

| 环节           | 实现                                                     | 文件                    |
| ------------ | ------------------------------------------------------ | --------------------- |
| 存储方式         | Jetpack DataStore Preferences（**明文**）                  | `TokenManager.kt`     |
| DataStore 名称 | `auth_prefs`                                           | `Constants.kt`        |
| Token 键名     | `auth_token`                                           | `Constants.kt`        |
| HTTP 请求注入    | `AuthInterceptor` 自动添加 `Authorization: Bearer <token>` | `AuthInterceptor.kt`  |
| WebSocket 认证 | HTTP 头 + 消息体双重传递                                       | `WebSocketManager.kt` |
| 启动认证检查       | `AuthCheckScreen` 读取 Token 判断登录状态                      | `MainActivity.kt`     |

***

## 二、发现的问题（按严重程度排序）

### 🔴 P0 - 严重安全问题

#### 问题 1：Token 明文存储（未加密）

* **文件**: [TokenManager.kt](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/data/local/TokenManager.kt)

* **现状**: 使用 `preferencesDataStore(name = "auth_prefs")` 存储 Token

* **风险**: DataStore Preferences 以 XML 明文文件存储在 `/data/data/com.example.claw_code_application/files/datastore/auth_prefs.preferences_pb`，已 root 设备可直接读取

* **缺失依赖**: 项目未引入 `androidx.security:security-crypto`，未使用 `EncryptedSharedPreferences` 或加密 DataStore

* **修复方案**: 迁移到 `EncryptedSharedPreferences`，使用 `MasterKey` + AES256 加密存储

#### 问题 2：Token 完整内容泄露到日志

* **文件**: [TokenManager.kt](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/data/local/TokenManager.kt#L31-L43), [AuthRepository.kt](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/data/repository/AuthRepository.kt#L35-L46)

* **现状**:

  * `TokenManager.saveToken()` 输出 Token 前80字符、后20字符

  * `TokenManager.getTokenSync()` 输出 Token 前80字符

  * `AuthRepository.login()` 直接输出完整 Token：`Log.d("AuthRepo", "Token from server: ${token}")`

* **风险**: Release 构建中日志仍可被 `READ_LOGS` 权限应用读取，完整 Token 直接暴露

* **修复方案**: 移除所有 Token 内容日志，仅保留 Token 是否存在的状态日志

#### 问题 3：HttpLoggingInterceptor Level.BODY 在生产环境泄露 Token

* **文件**: [ClawCodeApplication.kt](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/ClawCodeApplication.kt#L88-L92)

* **现状**: `HttpLoggingInterceptor.Level.BODY` 会记录完整请求/响应体，包括 Authorization 头中的 Token

* **风险**: 任何能读取 Logcat 的应用或工具都能获取 Token

* **修复方案**: Release 构建使用 `Level.NONE`，Debug 构建使用 `Level.HEADERS`（并过滤 Authorization 头）

***

### 🟡 P1 - 重要问题

#### 问题 4：AuthInterceptor 中使用 `runBlocking` 获取 Token

* **文件**: [AuthInterceptor.kt](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/data/api/AuthInterceptor.kt#L43)

* **现状**: `val token = runBlocking { tokenManager.getToken().first() }`

* **风险**: OkHttp 拦截器中 `runBlocking` 可能导致主线程 ANR 或死锁

* **修复方案**: 在 `TokenManager` 中增加内存缓存（`AtomicReference<String?>`），拦截器直接读取内存缓存

#### 问题 5：ChatRepository 重复手动读取 Token（与 AuthInterceptor 冲突）

* **文件**: [ChatRepository.kt](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/data/repository/ChatRepository.kt)

* **现状**: 每个方法都调用 `tokenManager.getTokenSync()` 检查 Token 是否存在，但 `AuthInterceptor` 已经自动注入 Token

* **风险**: 冗余代码 + Token 读取逻辑不一致（Repository 手动检查 vs Interceptor 自动注入）

* **修复方案**: 移除 ChatRepository 中手动读取 Token 的逻辑，统一依赖 AuthInterceptor

#### 问题 6：AuthRepository.login() 中嵌套 `runBlocking`

* **文件**: [AuthRepository.kt](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/data/repository/AuthRepository.kt#L43)

* **现状**: `val verifyToken = runBlocking { tokenManager.getTokenSync() }` — 在 suspend 函数中使用 `runBlocking`

* **风险**: 在协程中使用 `runBlocking` 可能导致死锁

* **修复方案**: 直接调用 `tokenManager.getTokenSync()`（已在协程中，无需 runBlocking）

***

### 🟠 P2 - 中等问题

#### 问题 7：WebSocket Token 双重传递

* **文件**: [WebSocketManager.kt](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/data/websocket/WebSocketManager.kt#L96-L109)

* **现状**: Token 同时通过 HTTP 头 (`Authorization: Bearer`) 和消息体 (`{"type":"login","token":"..."}`) 传递

* **风险**: 增加攻击面，消息体中的 Token 可能被服务器日志记录

* **修复方案**: 仅保留 HTTP 头认证，移除消息体中的 Token 传递（需确认后端是否支持仅 HTTP 头认证）

#### 问题 8：无 Token 刷新机制

* **文件**: [AuthInterceptor.kt](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/data/api/AuthInterceptor.kt#L153)

* **现状**: 预留了 `/api/auth/refresh` 路径，但未实现自动刷新逻辑

* **风险**: Token 过期后用户必须重新登录，体验差

* **修复方案**: 实现 Token 自动刷新机制（需后端配合）

#### 问题 9：Release 构建未启用代码混淆

* **文件**: [build.gradle.kts](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/build.gradle.kts#L26)

* **现状**: `isMinifyEnabled = false`

* **风险**: 反编译后代码可读性高，Token 存储逻辑完全暴露

* **修复方案**: 启用 `isMinifyEnabled = true`，配置 ProGuard 规则

***

### 🔵 P3 - 低优先级

#### 问题 10：无 Token 过期时间管理

* **文件**: [AuthModels.kt](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/data/api/models/AuthModels.kt#L44-L59)

* **现状**: `AuthData` 没有 `expiresIn` 或 `expiresAt` 字段

* **风险**: 客户端无法判断 Token 是否即将过期，无法主动刷新

* **修复方案**: 后端返回 `expiresIn`，客户端存储并主动刷新

***

## 三、修复实施计划

### 步骤 1：迁移到 EncryptedSharedPreferences（P0）

1. 在 `libs.versions.toml` 添加 `securityCrypto` 版本
2. 在 `build.gradle.kts` 添加 `androidx.security:security-crypto` 依赖
3. 重写 `TokenManager.kt`，使用 `EncryptedSharedPreferences` 替代 DataStore
4. 保持 `saveToken()`、`getToken()`、`getTokenSync()`、`clearToken()` 接口不变
5. 增加内存缓存 `AtomicReference<String?>` 避免频繁 IO

### 步骤 2：清除所有 Token 日志泄露（P0）

1. 移除 `TokenManager.kt` 中所有 Token 内容日志
2. 移除 `AuthRepository.kt` 中所有 Token 内容日志
3. 仅保留 Token 是否存在的状态日志（如 "Token 已保存"、"Token 不存在"）

### 步骤 3：修复 HttpLoggingInterceptor（P0）

1. 在 `ClawCodeApplication.kt` 中根据 BuildConfig 动态设置日志级别
2. Release 构建使用 `Level.NONE`
3. Debug 构建使用 `Level.HEADERS` 并过滤 Authorization 头

### 步骤 4：修复 AuthInterceptor runBlocking 问题（P1）

1. 在 `TokenManager` 中增加 `AtomicReference<String?>` 内存缓存
2. `saveToken()` 时同步更新内存缓存
3. `clearToken()` 时清空内存缓存
4. `AuthInterceptor` 直接读取内存缓存，不再使用 `runBlocking`

### 步骤 5：清理 ChatRepository 冗余 Token 读取（P1）

1. 移除 ChatRepository 中每个方法开头的 `tokenManager.getTokenSync()` 调用
2. 统一依赖 `AuthInterceptor` 自动注入 Token
3. 仅保留 Token 为空时的优雅降级处理

### 步骤 6：修复 AuthRepository 嵌套 runBlocking（P1）

1. 将 `runBlocking { tokenManager.getTokenSync() }` 改为直接调用 `tokenManager.getTokenSync()`

### 步骤 7：移除 WebSocket 消息体 Token 传递（P2）

1. 移除 `WebSocketManager.kt` 中 `onOpen` 里的 login 消息发送
2. 仅保留 HTTP 头认证
3. **需确认后端是否支持仅 HTTP 头认证**

### 步骤 8：启用 Release 代码混淆（P2）

1. 设置 `isMinifyEnabled = true`
2. 配置 ProGuard 规则保留必要类

***

## 四、涉及修改的文件清单

| 文件                          | 修改内容                                       |
| --------------------------- | ------------------------------------------ |
| `gradle/libs.versions.toml` | 添加 securityCrypto 版本                       |
| `app/build.gradle.kts`      | 添加 security-crypto 依赖，启用 minify            |
| `TokenManager.kt`           | 迁移到 EncryptedSharedPreferences，增加内存缓存，移除日志 |
| `AuthRepository.kt`         | 移除 Token 日志，修复 runBlocking                 |
| `AuthInterceptor.kt`        | 使用内存缓存替代 runBlocking                       |
| `ChatRepository.kt`         | 移除冗余 Token 读取                              |
| `WebSocketManager.kt`       | 移除消息体 Token 传递                             |
| `ClawCodeApplication.kt`    | 修复 HttpLoggingInterceptor 级别               |
| `proguard-rules.pro`        | 添加混淆规则                                     |

***

## 五、验证方式

1. **加密验证**: 使用 `adb shell` 检查 DataStore 文件是否已加密
2. **日志验证**: 在 Logcat 中搜索 "token"、"Token"、"Bearer" 确认无泄露
3. **功能验证**: 登录 → 聊天 → 登出 → 重新登录，确保完整流程正常
4. **ANR 验证**: 多次快速操作确认无 runBlocking 导致的卡顿


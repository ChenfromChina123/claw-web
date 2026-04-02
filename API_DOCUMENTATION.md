# 智学云境 (AI LearnSphere) - API 文档

## 目录

- [项目概述](#项目概述)
- [技术栈](#技术栈)
- [API 基础说明](#api-基础说明)
- [认证授权 API](#认证授权-api)
- [AI 聊天 API](#ai-聊天-api)
- [聊天记录管理 API](#聊天记录管理-api)
- [云盘管理 API](#云盘管理-api)
- 用户管理 API
- 笔记管理 API
- 收藏管理 API
- 翻译服务 API
- 搜索服务 API
- 单词词典 API
- AI 文章生成 API
- 单词游戏 API
- 需求文档管理 API
- 管理后台 API
- WebSocket 实时通信 API
- 错误响应说明
- 响应格式规范

---

## 项目概述

**智学云境 (AI LearnSphere)** 是一个基于 Spring Boot + Vue 3 的 AI 智能学习助手平台，提供 AI 聊天、云盘存储、学习资源管理、单词学习等多种功能。

### 项目结构

```
HAHA/
├── aispring/                 # 后端 Spring Boot 项目
│   ├── src/main/java/com/aispring/
│   │   ├── controller/      # REST API 控制器
│   │   ├── service/         # 业务逻辑层
│   │   ├── entity/          # 数据库实体类
│   │   ├── repository/      # 数据访问层
│   │   ├── dto/             # 数据传输对象
│   │   ├── security/        # 安全认证
│   │   └── config/          # 配置类
│   └── src/main/resources/
│       └── application.yml  # 应用配置文件
└── claude-code-haha/web/    # 前端 Vue 3 项目
    ├── src/
    │   ├── api/             # API 调用封装
    │   ├── components/      # Vue 组件
    │   ├── views/           # 页面视图
    │   ├── stores/          # Pinia 状态管理
    │   └── composables/     # 组合式函数
    └── package.json         # 前端依赖配置
```

---

## 技术栈

### 后端技术栈

- **框架**: Spring Boot 3.3.5
- **语言**: Java 17
- **数据库**: MySQL 8.0
- **ORM**: Spring Data JPA + Hibernate
- **缓存**: Redis (Lettuce 客户端)
- **安全**: Spring Security + JWT
- **AI 集成**: Spring AI (兼容 DeepSeek API)
- **WebSocket**: Spring WebSocket
- **邮件**: Spring Mail (SMTP)
- **文件处理**: Apache Commons IO
- **PDF 生成**: OpenHTMLToPDF
- **HTTP 客户端**: OkHttp3
- **加密**: Jasypt

### 前端技术栈

- **框架**: Vue 3.4.21 (Composition API)
- **构建工具**: Vite 5.1.6
- **状态管理**: Pinia 2.1.7
- **路由**: Vue Router 4.3.0
- **UI 组件库**: Naive UI 2.38.1
- **HTTP 客户端**: Axios 1.6.7
- **Markdown 渲染**: Marked 12.0.0
- **代码高亮**: Highlight.js 11.9.0
- **TypeScript**: 5.4.2

---

## API 基础说明

### 基础 URL

- **开发环境**: `http://localhost:5000/api`
- **生产环境**: `https://aistudy.icu/api`

### 认证方式

大部分 API 需要使用 JWT Token 进行认证，在请求头中携带：

```http
Authorization: Bearer <your_jwt_token>
```

### 通用响应格式

所有 API 响应遵循统一格式：

```json
{
  "success": true,
  "message": "操作成功",
  "data": {},
  "timestamp": 1234567890
}
```

### 错误响应格式

```json
{
  "success": false,
  "error": {
    "code": 400,
    "message": "错误描述信息"
  },
  "timestamp": 1234567890
}
```

---

## 认证授权 API

### 1.1 发送注册验证码

**端点**: `POST /api/auth/register/send-code`

**请求体**:
```json
{
  "email": "user@example.com"
}
```

**响应**:
```json
{
  "success": true,
  "message": "验证码已发送到您的邮箱",
  "data": null
}
```

---

### 1.2 用户注册

**端点**: `POST /api/auth/register`

**请求体**:
```json
{
  "email": "user@example.com",
  "username": "张三",
  "password": "password123",
  "code": "123456"
}
```

**响应**:
```json
{
  "success": true,
  "message": "注册成功",
  "data": {
    "userId": "1",
    "username": "张三",
    "email": "user@example.com",
    "avatar": "/api/users/avatar/default.png",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

### 1.3 用户登录

**端点**: `POST /api/auth/login`

**请求体**:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**响应**:
```json
{
  "success": true,
  "message": "登录成功",
  "data": {
    "userId": "1",
    "username": "张三",
    "email": "user@example.com",
    "avatar": "/api/users/avatar/1_xxxxx.jpg",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

### 1.4 发送忘记密码验证码

**端点**: `POST /api/auth/forgot-password/send-code`

**请求体**:
```json
{
  "email": "user@example.com"
}
```

**响应**:
```json
{
  "success": true,
  "message": "验证码已发送到您的邮箱",
  "data": null
}
```

---

### 1.5 重置密码

**端点**: `POST /api/auth/forgot-password`

**请求体**:
```json
{
  "email": "user@example.com",
  "code": "123456",
  "newPassword": "newpassword123"
}
```

**响应**:
```json
{
  "success": true,
  "message": "密码重置成功",
  "data": null
}
```

---

## AI 聊天 API

### 2.1 AI 问答（流式）

**端点**: `POST /api/ask-stream`

**Content-Type**: `application/json`

**请求体**:
```json
{
  "prompt": "请解释什么是量子计算",
  "session_id": "session_123",
  "model": "deepseek-v3.2",
  "system_prompt": "你是一个专业的 AI 助手"
}
```

**响应**: Server-Sent Events (SSE) 流式响应

```
data: {"content":"量"}
data: {"content":"子"}
data: {"content":"计"}
data: {"content":"算"}
data: [DONE]
```

**说明**:
- 使用 SSE (Server-Sent Events) 协议实时推送 AI 回复
- 支持匿名用户访问（有次数限制）
- 登录用户无次数限制

---

### 2.2 AI 问答（非流式）

**端点**: `POST /api/ask`

**请求体**:
```json
{
  "prompt": "请解释什么是量子计算",
  "session_id": "session_123",
  "model": "deepseek-v3.2",
  "system_prompt": "你是一个专业的 AI 助手"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "answer": "量子计算是一种基于量子力学原理的计算方式..."
  }
}
```

---

## 聊天记录管理 API

### 3.1 保存聊天记录

**端点**: `POST /api/chat-records/save`

**认证**: 需要登录（支持匿名）

**请求体**:
```json
{
  "sessionId": "session_123",
  "userMessage": "什么是量子计算",
  "aiResponse": "量子计算是一种基于量子力学原理的计算方式...",
  "aiReasoning": "思考过程...",
  "searchQuery": "quantum computing",
  "searchResults": "搜索结果...",
  "userImages": ["data:image/png;base64,..."],
  "model": "deepseek-v3.2",
  "role": "user",
  "content": "什么是量子计算",
  "timestamp": 1234567890
}
```

**响应**:
```json
{
  "message": "聊天记录保存成功"
}
```

---

### 3.2 获取用户会话列表

**端点**: `GET /api/chat-records/sessions`

**认证**: 可选（匿名用户返回空列表）

**响应**:
```json
{
  "sessions": [
    {
      "sessionId": "session_123",
      "title": "量子计算讨论",
      "model": "deepseek-v3.2",
      "createdAt": "2026-04-01T10:00:00",
      "updatedAt": "2026-04-01T12:00:00",
      "messageCount": 10
    }
  ]
}
```

---

### 3.3 获取会话消息（分页）

**端点**: `GET /api/chat-records/session/{sessionId}`

**查询参数**:
- `page`: 页码（默认 1）
- `pageSize`: 每页数量（默认 20）

**响应**:
```json
{
  "messages": [
    {
      "id": 1,
      "sessionId": "session_123",
      "senderType": 1,
      "content": "什么是量子计算",
      "sendTime": "2026-04-01T10:00:00"
    },
    {
      "id": 2,
      "sessionId": "session_123",
      "senderType": 2,
      "content": "量子计算是一种...",
      "reasoningContent": "思考过程...",
      "sendTime": "2026-04-01T10:00:05"
    }
  ],
  "total": 10,
  "page": 1,
  "pageSize": 20,
  "suggestions": ["量子纠缠是什么？", "量子计算机有什么应用？"],
  "title": "量子计算讨论"
}
```

---

### 3.4 创建新会话

**端点**: `POST /api/chat-records/new-session`

**响应**:
```json
{
  "session_id": "session_456"
}
```

---

### 3.5 删除会话

**端点**: `DELETE /api/chat-records/session/{sessionId}`

**响应**:
```json
{
  "message": "会话已删除"
}
```

---

### 3.6 管理员：获取所有会话

**端点**: `GET /api/chat-records/admin/sessions`

**权限**: 需要管理员权限

**查询参数**:
- `skip`: 跳过数量（默认 0）
- `limit`: 返回数量（默认 20）
- `userId`: 可选，筛选特定用户

**响应**:
```json
{
  "sessions": [
    {
      "sessionId": "session_123",
      "userId": 1,
      "username": "张三",
      "title": "量子计算讨论",
      "createdAt": "2026-04-01T10:00:00"
    }
  ]
}
```

---

### 3.7 管理员：获取聊天统计

**端点**: `GET /api/chat-records/admin/stats`

**权限**: 需要管理员权限

**响应**:
```json
{
  "totalUsers": 100,
  "totalChats": 5000,
  "totalFiles": 2000,
  "totalStorage": 10737418240
}
```

---

## 云盘管理 API

### 4.1 获取文件夹树

**端点**: `GET /api/cloud_disk/folders`

**认证**: 需要登录

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "folderName": "根目录",
      "folderPath": "/",
      "parentId": null,
      "children": []
    }
  ]
}
```

---

### 4.2 创建文件夹

**端点**: `POST /api/cloud_disk/create-folder`

**请求参数**:
- `folderName`: 文件夹名称
- `folderPath`: 文件夹路径
- `parentId`: 父文件夹 ID（可选）

**响应**:
```json
{
  "success": true,
  "message": "文件夹创建成功",
  "data": {
    "id": 2,
    "folderName": "学习资料",
    "folderPath": "/学习资料",
    "parentId": 1
  }
}
```

---

### 4.3 上传文件

**端点**: `POST /api/cloud_disk/upload`

**Content-Type**: `multipart/form-data`

**请求参数**:
- `file`: 文件对象
- `folderId`: 文件夹 ID（可选）
- `folderPath`: 文件夹路径
- `conflictStrategy`: 冲突处理策略（RENAME|OVERWRITE|SKIP，默认 RENAME）

**响应**:
```json
{
  "success": true,
  "message": "文件上传成功",
  "data": {
    "id": 1,
    "filename": "document.pdf",
    "filePath": "/学习资料/document.pdf",
    "fileSize": 1048576,
    "mimeType": "application/pdf",
    "uploadTime": "2026-04-01T10:00:00"
  }
}
```

---

### 4.4 获取文件列表

**端点**: `GET /api/cloud_disk/files`

**查询参数**:
- `folderId`: 文件夹 ID（可选）
- `folderPath`: 文件夹路径（可选）

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "filename": "document.pdf",
      "filePath": "/学习资料/document.pdf",
      "fileSize": 1048576,
      "mimeType": "application/pdf",
      "uploadTime": "2026-04-01T10:00:00"
    }
  ]
}
```

---

### 4.5 下载文件

**端点**: `GET /api/cloud_disk/download/{fileId}`

**查询参数**:
- `mode`: inline（在线预览）| attachment（附件下载，默认）

**响应**: 文件二进制流

**响应头**:
```
Content-Disposition: attachment; filename="document.pdf"
Content-Type: application/pdf
```

---

### 4.6 删除文件

**端点**: `DELETE /api/cloud_disk/delete/{fileId}`

**响应**:
```json
{
  "success": true,
  "message": "文件已删除",
  "data": null
}
```

---

### 4.7 删除文件夹

**端点**: `POST /api/cloud_disk/delete-folder`

**请求参数**:
- `folderId`: 文件夹 ID

**响应**:
```json
{
  "success": true,
  "message": "文件夹已删除",
  "data": null
}
```

---

### 4.8 移动文件

**端点**: `PUT /api/cloud_disk/move-file`

**请求体**:
```json
{
  "targetFolderId": 2,
  "targetPath": "/新位置"
}
```

**响应**:
```json
{
  "success": true,
  "message": "文件移动成功",
  "data": {
    "id": 1,
    "filename": "document.pdf",
    "filePath": "/新位置/document.pdf"
  }
}
```

---

### 4.9 重命名文件

**端点**: `PUT /api/cloud_disk/rename-file`

**请求体**:
```json
{
  "newName": "新文件名.pdf"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "conflict": false,
    "file": {
      "id": 1,
      "filename": "新文件名.pdf"
    }
  }
}
```

---

### 4.10 获取文件内容

**端点**: `GET /api/cloud_disk/content/{fileId}`

**响应**:
```json
{
  "success": true,
  "message": "获取文件内容成功",
  "data": "文件文本内容..."
}
```

---

### 4.11 更新文件内容

**端点**: `PUT /api/cloud_disk/content/{fileId}`

**请求体**:
```json
{
  "content": "新的文件内容"
}
```

**响应**:
```json
{
  "success": true,
  "message": "文件内容更新成功",
  "data": null
}
```

---

### 4.12 获取存储配额

**端点**: `GET /api/cloud_disk/quota`

**响应**:
```json
{
  "success": true,
  "message": "获取存储配额成功",
  "data": {
    "used": 1073741824,
    "total": 10737418240,
    "percentage": 10.5
  }
}
```

---

### 4.13 下载文件夹（ZIP）

**端点**: `GET /api/cloud_disk/download-folder`

**查询参数**:
- `folderPath`: 文件夹路径

**响应**: ZIP 文件二进制流

---

### 4.14 上传文件夹（ZIP）

**端点**: `POST /api/cloud_disk/upload-folder`

**请求参数**:
- `file`: ZIP 文件
- `folderPath`: 目标文件夹路径

**响应**:
```json
{
  "success": true,
  "message": "文件夹上传成功",
  "data": 15
}
```

---

### 4.15 初始化文件夹结构

**端点**: `POST /api/cloud_disk/init-folder-structure`

**响应**:
```json
{
  "success": true,
  "message": "文件夹结构初始化成功",
  "data": null
}
```

---

## 用户管理 API

### 5.1 更新用户资料

**端点**: `PUT /api/users/profile`

**请求体**:
```json
{
  "username": "新用户名"
}
```

**响应**:
```json
{
  "success": true,
  "message": "资料更新成功",
  "data": {
    "id": 1,
    "username": "新用户名",
    "email": "user@example.com",
    "avatar": "/api/users/avatar/1_xxxxx.jpg"
  }
}
```

---

### 5.2 上传头像

**端点**: `POST /api/users/upload-avatar`

**Content-Type**: `multipart/form-data`

**请求参数**:
- `file`: 图片文件

**响应**:
```json
{
  "success": true,
  "message": "头像上传成功",
  "data": "/api/users/avatar/1_xxxxx.jpg"
}
```

---

### 5.3 获取头像

**端点**: `GET /api/users/avatar/{filename}`

**响应**: 图片文件

---

## 笔记管理 API

### 6.1 保存笔记

**端点**: `POST /api/notes/save`

**请求体**:
```json
{
  "title": "学习笔记",
  "content": "# 笔记内容\n\n这是笔记的详细内容...",
  "filePath": "/笔记/2026-04-01.md"
}
```

**响应**:
```json
{
  "id": 1,
  "userId": 1,
  "title": "学习笔记",
  "content": "# 笔记内容...",
  "filePath": "/笔记/2026-04-01.md",
  "createdAt": "2026-04-01T10:00:00",
  "updatedAt": "2026-04-01T10:00:00"
}
```

---

### 6.2 获取笔记列表

**端点**: `GET /api/notes/list`

**响应**:
```json
{
  "notes": [
    {
      "id": 1,
      "title": "学习笔记",
      "content": "# 笔记内容...",
      "filePath": "/笔记/2026-04-01.md",
      "createdAt": "2026-04-01T10:00:00"
    }
  ]
}
```

---

### 6.3 获取笔记详情

**端点**: `GET /api/notes/{noteId}`

**响应**:
```json
{
  "id": 1,
  "title": "学习笔记",
  "content": "# 笔记内容...",
  "filePath": "/笔记/2026-04-01.md"
}
```

---

### 6.4 删除笔记

**端点**: `DELETE /api/notes/{noteId}`

**响应**:
```json
{
  "message": "笔记已删除"
}
```

---

## 收藏管理 API

### 7.1 收藏资源

**端点**: `POST /api/favorites/add`

**请求参数**:
- `resourceId`: 资源 ID

**响应**:
```json
{
  "success": true,
  "message": "收藏成功",
  "data": null
}
```

---

### 7.2 取消收藏

**端点**: `POST /api/favorites/remove`

**请求参数**:
- `resourceId`: 资源 ID

**响应**:
```json
{
  "success": true,
  "message": "取消收藏成功",
  "data": null
}
```

---

### 7.3 检查收藏状态

**端点**: `GET /api/favorites/check`

**请求参数**:
- `resourceId`: 资源 ID

**响应**:
```json
{
  "success": true,
  "message": "检查收藏状态成功",
  "data": true
}
```

---

### 7.4 获取用户收藏列表

**端点**: `GET /api/favorites/user`

**请求参数**:
- `categoryName`: 分类名称（可选）

**响应**:
```json
{
  "success": true,
  "message": "获取收藏列表成功",
  "data": [
    {
      "id": 1,
      "title": "资源标题",
      "categoryName": "学习资料",
      "url": "https://example.com"
    }
  ]
}
```

---

## 翻译服务 API

### 8.1 翻译文本

**端点**: `POST /api/translation/translate`

**请求体**:
```json
{
  "text": "Hello, World!",
  "sourceLanguage": "en",
  "targetLanguage": "zh"
}
```

**响应**:
```json
{
  "success": true,
  "data": "你好，世界！"
}
```

---

## 搜索服务 API

### 9.1 执行网络搜索

**端点**: `GET /api/search`

**查询参数**:
- `q`: 搜索关键词（必填）
- `site`: 指定搜索站点（可选）
- `apiKey`: API Key（可选，如果配置了密钥则必须提供）

**请求头**:
- `X-API-Key`: API Key（可选）

**响应**:
```json
{
  "success": true,
  "data": {
    "query": "量子计算",
    "site": null,
    "result": "[1] 量子计算是一种基于量子力学原理的计算方式..."
  }
}
```

---

## 单词词典 API

### 10.1 查询单词

**端点**: `GET /api/word-dict/word/{word}`

**响应**:
```json
{
  "success": true,
  "data": {
    "word": "quantum",
    "phonetic": "/ˈkwɒntəm/",
    "definitions": [
      {
        "partOfSpeech": "n.",
        "definition": "量子；定量"
      }
    ]
  },
  "pronunciation": "https://dict.youdao.com/dictvoice?audio=quantum&type=1"
}
```

---

### 10.2 获取单词发音

**端点**: `GET /api/word-dict/word/{word}/pronunciation`

**响应**:
```json
{
  "word": "quantum",
  "pronunciation": "https://dict.youdao.com/dictvoice?audio=quantum&type=1",
  "cached": "true"
}
```

---

### 10.3 批量获取发音

**端点**: `GET /api/word-dict/pronunciations`

**查询参数**:
- `words`: 单词列表（逗号分隔）

**响应**:
```json
{
  "success": true,
  "count": 3,
  "pronunciations": [
    "https://dict.youdao.com/dictvoice?audio=quantum&type=1",
    "https://dict.youdao.com/dictvoice?audio=computing&type=1",
    "https://dict.youdao.com/dictvoice?audio=mechanics&type=1"
  ]
}
```

---

### 10.4 智能搜索单词

**端点**: `GET /api/word-dict/search`

**查询参数**:
- `keyword`: 关键词
- `limit`: 返回数量（默认 10）

**响应**:
```json
{
  "success": true,
  "count": 5,
  "data": [
    {
      "word": "quantum",
      "phonetic": "/ˈkwɒntəm/",
      "definitions": [...]
    }
  ]
}
```

---

### 10.5 清除单词缓存

**端点**: `DELETE /api/word-dict/cache/{word}`

**响应**:
```json
{
  "success": true,
  "message": "缓存已清除"
}
```

---

### 10.6 预加载高频单词

**端点**: `POST /api/word-dict/cache/preload`

**响应**:
```json
{
  "success": true,
  "message": "高频单词已预加载到缓存"
}
```

---

### 10.7 获取缓存统计

**端点**: `GET /api/word-dict/cache/stats`

**响应**:
```json
{
  "success": true,
  "data": {
    "totalEntries": 1000,
    "hitRate": 0.85,
    "memoryUsage": "10MB"
  }
}
```

---

## AI 文章生成 API

### 11.1 获取词库列表

**端点**: `GET /api/ai/article/word-library`

**查询参数**:
- `libraryType`: 词库类型（mine|public）
- `keyword`: 搜索关键词
- `category`: 分类
- `language`: 语言
- `pageNum`: 页码（默认 1）
- `pageSize`: 每页数量（默认 20）

**响应**:
```json
{
  "total": 100,
  "list": [
    {
      "id": 1,
      "name": "四级核心词汇",
      "wordCount": 500,
      "language": "en"
    }
  ],
  "pageNum": 1,
  "pageSize": 20
}
```

---

### 11.2 推荐文章主题

**端点**: `POST /api/ai/article/recommend-theme`

**请求体**:
```json
{
  "wordList": ["quantum", "computing", "physics"]
}
```

**响应**:
```json
[
  "量子计算在物理学中的应用",
  "现代计算技术的革命：量子计算机",
  "从经典计算到量子计算的演进"
]
```

---

### 11.3 生成文章

**端点**: `POST /api/ai/article/generate`

**请求体**:
```json
{
  "listId": 1,
  "wordIds": [1, 2, 3],
  "wordList": ["quantum", "computing"],
  "theme": "量子计算",
  "targetLanguage": "zh",
  "lengthType": "medium",
  "difficulty": "intermediate"
}
```

**响应**:
```json
{
  "id": 1,
  "userId": 1,
  "theme": "量子计算",
  "originalText": "# 量子计算\n\n量子计算是一种...",
  "difficulty": "intermediate",
  "lengthType": "medium",
  "targetLanguage": "zh",
  "createdAt": "2026-04-01T10:00:00"
}
```

---

### 11.4 获取生成历史列表

**端点**: `GET /api/ai/article/history-list`

**查询参数**:
- `keyword`: 搜索关键词
- `targetLanguage`: 目标语言
- `startTime`: 开始时间（yyyy-MM-dd）
- `endTime`: 结束时间（yyyy-MM-dd）
- `pageNum`: 页码（默认 1）
- `pageSize`: 每页数量（默认 10）

**响应**:
```json
{
  "total": 50,
  "list": [
    {
      "id": 1,
      "theme": "量子计算",
      "targetLanguage": "zh",
      "createdAt": "2026-04-01T10:00:00"
    }
  ],
  "pageNum": 1,
  "pageSize": 10
}
```

---

### 11.5 获取生成历史详情

**端点**: `GET /api/ai/article/history-detail`

**查询参数**:
- `recordId`: 记录 ID

**响应**:
```json
{
  "id": 1,
  "theme": "量子计算",
  "originalText": "# 量子计算\n\n量子计算是一种...",
  "wordCount": 500
}
```

---

### 11.6 导出 PDF

**端点**: `POST /api/ai/article/export-pdf`

**请求体**:
```json
{
  "recordId": 1,
  "content": "# 量子计算\n\n量子计算是一种...",
  "theme": "量子计算"
}
```

**响应**: PDF 文件二进制流

**响应头**:
```
Content-Disposition: attachment; filename="量子计算_1234567890.pdf"
Content-Type: application/pdf
```

---

### 11.7 删除生成历史

**端点**: `POST /api/ai/article/delete-history`

**请求体**:
```json
{
  "recordIdList": [1, 2, 3]
}
```

**响应**:
```json
{
  "success": true,
  "deleted_count": 3
}
```

---

### 11.8 清空生成历史

**端点**: `POST /api/ai/article/clear-history`

**响应**:
```json
{
  "success": true,
  "deleted_count": 50
}
```

---

## 单词游戏 API

### 12.1 获取词包列表

**端点**: `GET /api/word-game/packages`

**查询参数**:
- `search`: 搜索关键词（可选）

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "packageId": "pkg_001",
      "name": "四级核心词汇",
      "courseCount": 10,
      "description": "大学英语四级核心词汇"
    }
  ]
}
```

---

### 12.2 记录词包点击

**端点**: `POST /api/word-game/packages/{packageId}/click`

**响应**:
```json
{
  "success": true,
  "data": null
}
```

---

### 12.3 获取课程列表

**端点**: `GET /api/word-game/packages/{packageId}/courses`

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "courseIndex": 1,
      "name": "第一单元",
      "questionCount": 20,
      "isCompleted": false
    }
  ]
}
```

---

### 12.4 获取题目列表

**端点**: `GET /api/word-game/courses/{courseIndex}/questions`

**查询参数**:
- `packageId`: 词包 ID（可选）

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "questionIndex": 1,
      "question": "quantum 的中文意思是？",
      "options": ["量子", "计算机", "物理", "数学"],
      "correctAnswer": 0
    }
  ]
}
```

---

### 12.5 创建自定义词包

**端点**: `POST /api/word-game/packages`

**请求体**:
```json
{
  "name": "我的词包",
  "description": "自定义词包描述",
  "courses": [...]
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "packageId": "pkg_custom_001",
    "name": "我的词包"
  }
}
```

---

### 12.6 添加词包章节

**端点**: `POST /api/word-game/packages/{packageId}/sections`

**请求体**:
```json
{
  "name": "新章节",
  "questions": [...]
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "courseIndex": 5,
    "name": "新章节"
  }
}
```

---

### 12.7 获取学习进度

**端点**: `GET /api/word-game/progress`

**查询参数**:
- `packageId`: 词包 ID

**响应**:
```json
{
  "success": true,
  "data": {
    "packageId": "pkg_001",
    "completedCourses": 5,
    "totalCourses": 10,
    "completedQuestions": 80,
    "totalQuestions": 200,
    "accuracy": 0.85
  }
}
```

---

### 12.8 保存学习进度

**端点**: `POST /api/word-game/progress`

**请求体**:
```json
{
  "packageId": "pkg_001",
  "courseIndex": 5,
  "questionIndex": 10,
  "score": 90
}
```

**响应**:
```json
{
  "success": true,
  "data": null
}
```

---

### 12.9 迁移学习进度

**端点**: `POST /api/word-game/progress/migrate`

**请求体**:
```json
{
  "oldPackageId": "pkg_old_001",
  "newPackageId": "pkg_new_001",
  "progress": {...}
}
```

**响应**:
```json
{
  "success": true,
  "migrated": true
}
```

---

## 需求文档管理 API

### 13.1 获取需求文档列表

**端点**: `GET /api/requirements`

**认证**: 需要登录

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "userId": 1,
      "title": "AI 助手需求文档",
      "content": "# 需求文档\n\n## 功能需求...",
      "version": 1,
      "createdAt": "2026-04-01T10:00:00",
      "updatedAt": "2026-04-01T12:00:00"
    }
  ]
}
```

---

### 13.2 创建需求文档

**端点**: `POST /api/requirements`

**请求体**:
```json
{
  "title": "AI 助手需求文档",
  "content": "# 需求文档\n\n## 功能需求..."
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "title": "AI 助手需求文档",
    "version": 1
  }
}
```

---

### 13.3 更新需求文档

**端点**: `PUT /api/requirements/{id}`

**请求体**:
```json
{
  "title": "更新后的标题",
  "content": "# 更新后的内容..."
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "title": "更新后的标题",
    "version": 2
  }
}
```

---

### 13.4 获取文档历史版本

**端点**: `GET /api/requirements/{id}/history`

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "docId": 1,
      "content": "# 历史版本内容...",
      "version": 1,
      "createdAt": "2026-04-01T10:00:00"
    }
  ]
}
```

---

### 13.5 流式生成需求文档

**端点**: `POST /api/requirements/generate-stream`

**Content-Type**: `application/json`

**请求体**:
```json
{
  "prompt": "我需要一个在线购物网站的需求文档"
}
```

**响应**: Server-Sent Events (SSE) 流式响应

---

### 13.6 Agent 生成问题

**端点**: `POST /api/requirements/agent/questions`

**请求体**:
```json
{
  "userIdea": "我想做一个在线学习平台"
}
```

**响应**:
```json
{
  "success": true,
  "data": "{\"questions\":[\"目标用户是谁？\",\"核心功能有哪些？\",\"盈利模式是什么？\"]}"
}
```

---

### 13.7 Agent 流式生成文档

**端点**: `POST /api/requirements/agent/generate-stream`

**请求体**:
```json
{
  "userIdea": "在线学习平台",
  "answers": "{\"questions\":[...],\"answers\":[...]}",
  "domain": "教育"
}
```

**响应**: Server-Sent Events (SSE) 流式响应

---

## 管理后台 API

### 14.1 获取统计数据

**端点**: `GET /api/admin/statistics`

**权限**: 需要管理员权限

**响应**:
```json
{
  "success": true,
  "data": {
    "totalUsers": 100,
    "totalChats": 5000,
    "totalFiles": 2000,
    "totalStorage": 10737418240
  }
}
```

---

### 14.2 获取用户列表

**端点**: `GET /api/admin/users`

**权限**: 需要管理员权限

**响应**:
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": 1,
        "email": "user@example.com",
        "createdAt": "2026-04-01T10:00:00",
        "active": true
      }
    ]
  }
}
```

---

### 14.3 获取文件列表

**端点**: `GET /api/admin/files`

**权限**: 需要管理员权限

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "filename": "document.pdf",
      "userEmail": "user@example.com",
      "fileSize": 1048576,
      "uploadTime": "2026-04-01T10:00:00"
    }
  ]
}
```

---

### 14.4 管理员下载文件

**端点**: `GET /api/admin/files/download/{fileId}`

**权限**: 需要管理员权限

**查询参数**:
- `mode`: inline|attachment

**响应**: 文件二进制流

---

### 14.5 验证文件完整性

**端点**: `GET /api/admin/files/verify`

**权限**: 需要管理员权限

**响应**:
```json
{
  "success": true,
  "data": {
    "totalFiles": 100,
    "validFiles": 98,
    "invalidFiles": 2,
    "details": [...]
  }
}
```

---

### 14.6 清理孤立文件记录

**端点**: `DELETE /api/admin/files/cleanup-orphans`

**权限**: 需要管理员权限

**响应**:
```json
{
  "success": true,
  "data": {
    "cleaned": 5
  }
}
```

---

### 14.7 获取 Token 审计统计

**端点**: `GET /api/admin/token-audit/stats`

**权限**: 需要管理员权限

**查询参数**:
- `startDate`: 开始日期
- `endDate`: 结束日期

**响应**:
```json
{
  "success": true,
  "data": {
    "totalRequests": 10000,
    "totalInputTokens": 500000,
    "totalOutputTokens": 300000,
    "totalTokens": 800000,
    "avgResponseTimeMs": 1500,
    "byProvider": {
      "deepseek": 8000,
      "doubao": 2000
    },
    "byModel": {
      "deepseek-v3.2": 7000,
      "doubao-pro": 3000
    }
  }
}
```

---

### 14.8 获取 Token 审计记录

**端点**: `GET /api/admin/token-audit/records`

**权限**: 需要管理员权限

**查询参数**:
- `provider`: 提供商
- `userId`: 用户 ID
- `page`: 页码（默认 0）
- `size`: 每页数量（默认 50）

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "provider": "deepseek",
      "modelName": "deepseek-v3.2",
      "userId": 1,
      "sessionId": "session_123",
      "inputTokens": 100,
      "outputTokens": 200,
      "totalTokens": 300,
      "responseTimeMs": 1500,
      "streaming": true,
      "createdAt": "2026-04-01T10:00:00"
    }
  ]
}
```

---

### 14.9 获取外部链接列表

**端点**: `GET /api/admin/external-links`

**权限**: 需要管理员权限

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "title": "友情链接",
      "url": "https://example.com",
      "sortOrder": 1,
      "isActive": true
    }
  ]
}
```

---

### 14.10 创建外部链接

**端点**: `POST /api/admin/external-links`

**请求体**:
```json
{
  "title": "友情链接",
  "url": "https://example.com",
  "sortOrder": 1,
  "isActive": true
}
```

**响应**:
```json
{
  "success": true,
  "message": "创建成功",
  "data": {
    "id": 1,
    "title": "友情链接"
  }
}
```

---

### 14.11 更新外部链接

**端点**: `PUT /api/admin/external-links/{id}`

**请求体**:
```json
{
  "title": "更新后的标题",
  "url": "https://newurl.com",
  "sortOrder": 2,
  "isActive": false
}
```

**响应**:
```json
{
  "success": true,
  "message": "更新成功",
  "data": {
    "id": 1,
    "title": "更新后的标题"
  }
}
```

---

### 14.12 删除外部链接

**端点**: `DELETE /api/admin/external-links/{id}`

**响应**:
```json
{
  "success": true,
  "message": "删除成功",
  "data": null
}
```

---

## WebSocket 实时通信 API

### 15.1 建立 WebSocket 连接

**端点**: `ws://localhost:5000/ws`

**连接消息**:
```json
{
  "type": "login",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

或匿名用户：
```json
{
  "type": "register"
}
```

---

### 15.2 创建会话

**发送消息**:
```json
{
  "type": "rpc_call",
  "id": "rpc_001",
  "method": "create_session",
  "params": {
    "title": "新会话",
    "model": "deepseek-v3.2"
  }
}
```

**响应消息**:
```json
{
  "type": "rpc_response",
  "id": "rpc_001",
  "result": {
    "session": {
      "id": "session_123",
      "title": "新会话",
      "model": "deepseek-v3.2"
    }
  }
}
```

---

### 15.3 发送消息

**发送消息**:
```json
{
  "type": "rpc_call",
  "id": "rpc_002",
  "method": "send_message",
  "params": {
    "sessionId": "session_123",
    "content": "你好"
  }
}
```

**流式响应事件**:

1. 消息开始：
```json
{
  "type": "event",
  "event": "message_start"
}
```

2. 内容增量：
```json
{
  "type": "event",
  "event": "content_block_delta",
  "data": {
    "text": "你"
  }
}
```

3. 工具调用：
```json
{
  "type": "event",
  "event": "tool_use",
  "data": {
    "id": "tool_001",
    "name": "search",
    "input": {
      "query": "keyword"
    }
  }
}
```

4. 工具结束：
```json
{
  "type": "event",
  "event": "tool_end",
  "data": {
    "id": "tool_001",
    "result": {
      "results": [...]
    }
  }
}
```

5. 消息停止：
```json
{
  "type": "event",
  "event": "message_stop"
}
```

---

### 15.4 获取会话列表

**发送消息**:
```json
{
  "type": "rpc_call",
  "id": "rpc_003",
  "method": "list_sessions"
}
```

**响应事件**:
```json
{
  "type": "event",
  "event": "session_list",
  "data": {
    "sessions": [...]
  }
}
```

---

### 15.5 加载会话

**发送消息**:
```json
{
  "type": "rpc_call",
  "id": "rpc_004",
  "method": "load_session",
  "params": {
    "sessionId": "session_123"
  }
}
```

**响应事件**:
```json
{
  "type": "event",
  "event": "session_loaded",
  "data": {
    "session": {...},
    "messages": [...],
    "toolCalls": [...]
  }
}
```

---

### 15.6 删除会话

**发送消息**:
```json
{
  "type": "rpc_call",
  "id": "rpc_005",
  "method": "delete_session",
  "params": {
    "sessionId": "session_123"
  }
}
```

**响应事件**:
```json
{
  "type": "event",
  "event": "session_deleted",
  "data": {
    "sessionId": "session_123"
  }
}
```

---

### 15.7 清空会话

**发送消息**:
```json
{
  "type": "rpc_call",
  "id": "rpc_006",
  "method": "clear_session",
  "params": {
    "sessionId": "session_123"
  }
}
```

**响应事件**:
```json
{
  "type": "event",
  "event": "session_cleared"
}
```

---

### 15.8 心跳检测

**客户端发送**:
```json
{
  "type": "ping",
  "timestamp": 1234567890
}
```

**服务端响应**:
```json
{
  "type": "pong",
  "timestamp": 1234567890,
  "latency": 50
}
```

---

## 错误响应说明

### HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 未授权，需要登录 |
| 403 | 禁止访问，权限不足 |
| 404 | 资源不存在 |
| 409 | 资源冲突（如重名） |
| 429 | 请求次数超限 |
| 500 | 服务器内部错误 |

---

### 错误码说明

| 错误码 | 说明 |
|--------|------|
| 40001 | 参数验证失败 |
| 40101 | Token 无效或过期 |
| 40301 | 权限不足 |
| 40401 | 资源不存在 |
| 40901 | 资源名称冲突 |
| 42901 | 请求频率超限 |
| 50001 | 服务器内部错误 |
| 50002 | 数据库操作失败 |
| 50003 | 文件操作失败 |
| 50004 | AI 服务调用失败 |

---

## 响应格式规范

### 成功响应

```json
{
  "success": true,
  "message": "操作成功",
  "data": {
    // 具体数据内容
  },
  "timestamp": 1234567890
}
```

### 错误响应

```json
{
  "success": false,
  "error": {
    "code": 400,
    "message": "错误描述信息"
  },
  "timestamp": 1234567890
}
```

### 分页响应

```json
{
  "success": true,
  "data": {
    "list": [...],
    "total": 100,
    "pageNum": 1,
    "pageSize": 20
  }
}
```

---

## 附录

### A. 数据库实体关系

主要实体类：
- User: 用户
- ChatRecord: 聊天记录
- ChatSession: 聊天会话
- UserFile: 用户文件
- UserFolder: 用户文件夹
- Note: 笔记
- Resource: 资源
- UserFavorite: 用户收藏
- WordDict: 单词词典
- GeneratedArticle: 生成的文章
- VocabularyList: 词汇表
- RequirementDoc: 需求文档

### B. 配置文件说明

主要配置项在 `application.yml`：
- 数据库连接
- Redis 配置
- JWT 密钥
- AI 模型配置
- 文件上传限制
- 邮件服务
- CORS 配置

### C. 环境变量

推荐在生产环境使用环境变量：
- `DB_HOST`: 数据库主机
- `DB_USERNAME`: 数据库用户名
- `DB_PASSWORD`: 数据库密码
- `DEEPSEEK_API_KEY`: DeepSeek API 密钥
- `JWT_SECRET_KEY`: JWT 密钥
- `REDIS_HOST`: Redis 主机
- `SENDER_EMAIL`: 发件人邮箱
- `SEARCH_API_KEY`: 搜索 API 密钥

---

## 更新日志

### v1.0.0 (2026-04-02)
- 初始版本
- 完整的 API 文档
- 涵盖所有 REST API 和 WebSocket API

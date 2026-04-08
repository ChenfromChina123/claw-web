# AI智能学习助手系统 - 后端API文档

## 1. 文档概述

本文档描述了AI智能学习助手系统的后端API接口，包括认证、AI聊天、云盘管理、词汇学习等功能模块的接口定义。

### 1.1 基础URL

所有API接口的基础URL为：`http://localhost:5000`

### 1.2 认证方式

系统采用JWT（JSON Web Token）认证机制，用户登录后获取token，后续请求需在Authorization头中携带该token。

```
Authorization: Bearer <your_token_here>
```

## 2. 认证相关API

### 2.1 发送注册验证码

**接口路径**：`POST /api/auth/register/send-code`

**功能描述**：向指定邮箱发送注册验证码

**请求体**：
```json
{
  "email": "user@example.com"
}
```

**响应**：
```json
{
  "message": "验证码已发送到您的邮箱"
}
```

### 2.2 用户注册

**接口路径**：`POST /api/auth/register`

**功能描述**：用户注册账号

**请求体**：
```json
{
  "email": "user@example.com",
  "password": "password123",
  "code": "123456",
  "username": "testuser"
}
```

**响应**：
```json
{
  "token": "jwt_token_here",
  "user": {
    "id": 1,
    "username": "testuser",
    "email": "user@example.com"
  }
}
```

### 2.3 用户登录

**接口路径**：`POST /api/auth/login`

**功能描述**：用户登录获取JWT token

**请求体**：
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**响应**：
```json
{
  "token": "jwt_token_here",
  "user": {
    "id": 1,
    "username": "testuser",
    "email": "user@example.com"
  }
}
```

### 2.4 发送忘记密码验证码

**接口路径**：`POST /api/auth/forgot-password/send-code`

**功能描述**：向指定邮箱发送忘记密码验证码

**请求体**：
```json
{
  "email": "user@example.com"
}
```

**响应**：
```json
{
  "message": "验证码已发送到您的邮箱"
}
```

### 2.5 重置密码

**接口路径**：`POST /api/auth/forgot-password`

**功能描述**：使用验证码重置密码

**请求体**：
```json
{
  "email": "user@example.com",
  "code": "123456",
  "newPassword": "newpassword123"
}
```

**响应**：
```json
{
  "message": "密码重置成功"
}
```

## 3. AI聊天相关API

### 3.1 AI问答流式接口

**接口路径**：`POST /api/ask-stream`

**功能描述**：AI问答流式接口，返回SSE（Server-Sent Events）格式的响应

**请求体**：
```json
{
  "prompt": "什么是AI？",
  "session_id": "session123",
  "model": "gpt-3.5-turbo"
}
```

**响应**：SSE流格式的AI回答

### 3.2 AI问答非流式接口

**接口路径**：`POST /api/ask`

**功能描述**：AI问答非流式接口，一次性返回完整回答

**请求体**：
```json
{
  "prompt": "什么是AI？",
  "session_id": "session123",
  "model": "gpt-3.5-turbo"
}
```

**响应**：
```json
{
  "answer": "AI是人工智能（Artificial Intelligence）的缩写..."
}
```

## 4. 聊天记录相关API

### 4.1 保存聊天记录

**接口路径**：`POST /api/chat-records/save`

**功能描述**：保存单轮聊天记录

**请求体**：
```json
{
  "session_id": "session123",
  "user_message": "什么是AI？",
  "ai_response": "AI是人工智能（Artificial Intelligence）的缩写...",
  "model": "gpt-3.5-turbo"
}
```

**响应**：
```json
{
  "message": "聊天记录保存成功"
}
```

### 4.2 获取用户的所有聊天会话

**接口路径**：`GET /api/chat-records/sessions`

**功能描述**：获取当前用户的所有聊天会话列表

**响应**：
```json
{
  "sessions": [
    {
      "session_id": "session123",
      "created_at": "2023-12-01T10:00:00Z",
      "last_message": "什么是AI？"
    }
  ]
}
```

### 4.3 获取特定会话的所有消息

**接口路径**：`GET /api/chat-records/session/{sessionId}`

**功能描述**：获取指定会话ID的所有聊天消息

**响应**：
```json
{
  "messages": [
    {
      "id": 1,
      "content": "什么是AI？",
      "sender_type": 1,
      "created_at": "2023-12-01T10:00:00Z"
    },
    {
      "id": 2,
      "content": "AI是人工智能（Artificial Intelligence）的缩写...",
      "sender_type": 2,
      "created_at": "2023-12-01T10:00:05Z"
    }
  ]
}
```

### 4.4 删除特定会话

**接口路径**：`DELETE /api/chat-records/session/{sessionId}`

**功能描述**：删除指定会话及其所有消息

**响应**：
```json
{
  "message": "会话已删除"
}
```

### 4.5 创建新会话

**接口路径**：`POST /api/chat-records/new-session`

**功能描述**：创建一个新的聊天会话

**响应**：
```json
{
  "session_id": "new_session_123"
}
```

## 5. 云盘相关API

### 5.1 初始化用户文件夹结构

**接口路径**：`POST /api/cloud_disk/init-folder-structure`

**功能描述**：初始化当前用户的云盘文件夹结构

**响应**：
```json
{
  "message": "文件夹结构初始化成功"
}
```

### 5.2 获取文件夹树

**接口路径**：`GET /api/cloud_disk/folders`

**功能描述**：获取当前用户的文件夹列表

**响应**：
```json
{
  "folders": [
    {
      "id": 1,
      "folderName": "学习资料",
      "folderPath": "/学习资料",
      "parentId": null,
      "createdAt": "2023-12-01T10:00:00Z"
    }
  ]
}
```

### 5.3 创建文件夹

**接口路径**：`POST /api/cloud_disk/create-folder`

**功能描述**：在指定位置创建新文件夹

**请求体**：
```json
{
  "folderName": "新文件夹",
  "folderPath": "/学习资料/新文件夹",
  "parentId": 1
}
```

**响应**：返回创建的文件夹信息

### 5.4 删除文件夹

**接口路径**：`POST /api/cloud_disk/delete-folder`

**功能描述**：删除指定文件夹

**请求参数**：
- `folderId`：文件夹ID

**响应**：
```json
{
  "message": "文件夹已删除"
}
```

### 5.5 上传文件

**接口路径**：`POST /api/cloud_disk/upload`

**功能描述**：上传文件到指定文件夹

**请求参数**：
- `file`：要上传的文件（multipart/form-data）
- `folderId`：目标文件夹ID
- `folderPath`：目标文件夹路径

**响应**：返回上传的文件信息

### 5.6 获取文件列表

**接口路径**：`GET /api/cloud_disk/files`

**功能描述**：获取指定文件夹下的文件列表

**请求参数**：
- `folderId`：文件夹ID（可选，默认获取根目录文件）

**响应**：
```json
{
  "files": [
    {
      "id": 1,
      "fileName": "test.pdf",
      "filePath": "/学习资料/test.pdf",
      "fileSize": 1024000,
      "fileType": "pdf",
      "uploadTime": "2023-12-01T10:00:00Z"
    }
  ]
}
```

### 5.7 下载文件

**接口路径**：`GET /api/cloud_disk/download/{fileId}`

**功能描述**：下载指定ID的文件

**响应**：文件二进制流

### 5.8 删除文件

**接口路径**：`DELETE /api/cloud_disk/delete/{fileId}`

**功能描述**：删除指定ID的文件

**响应**：
```json
{
  "message": "文件已删除"
}
```

### 5.9 移动文件

**接口路径**：`PUT /api/cloud_disk/move-file`

**功能描述**：将文件移动到指定文件夹

**请求参数**：
- `fileId`：文件ID

**请求体**：
```json
{
  "targetFolderId": 2,
  "targetPath": "/新文件夹"
}
```

**响应**：返回更新后的文件信息

### 5.10 重命名文件夹

**接口路径**：`PUT /api/cloud_disk/rename-folder`

**功能描述**：重命名指定文件夹

**请求参数**：
- `folderId`：文件夹ID

**请求体**：
```json
{
  "newName": "重命名后的文件夹"
}
```

**响应**：返回更新后的文件夹信息

## 6. 自定义模型相关API

### 6.1 获取自定义模型列表

**接口路径**：`GET /api/custom-models`

**功能描述**：获取当前用户的自定义模型列表

**响应**：
```json
{
  "models": [
    {
      "id": 1,
      "name": "自定义GPT模型",
      "baseUrl": "https://api.openai.com/v1",
      "modelName": "gpt-3.5-turbo",
      "isActive": true,
      "createdAt": "2023-12-01T10:00:00Z"
    }
  ]
}
```

### 6.2 创建自定义模型

**接口路径**：`POST /api/custom-models`

**功能描述**：创建一个新的自定义模型

**请求体**：
```json
{
  "name": "自定义模型",
  "apiKey": "sk-xxx",
  "baseUrl": "https://api.example.com/v1",
  "modelName": "custom-model-1",
  "description": "我的自定义模型"
}
```

**响应**：返回创建的模型信息

### 6.3 更新自定义模型

**接口路径**：`PUT /api/custom-models/{modelId}`

**功能描述**：更新指定自定义模型的信息

**请求体**：
```json
{
  "name": "更新后的模型名",
  "isActive": false
}
```

**响应**：返回更新后的模型信息

### 6.4 删除自定义模型

**接口路径**：`DELETE /api/custom-models/{modelId}`

**功能描述**：删除指定的自定义模型

**响应**：
```json
{
  "message": "自定义模型已删除"
}
```

## 7. 反馈相关API

### 7.1 提交反馈

**接口路径**：`POST /api/feedback`

**功能描述**：提交用户反馈

**请求体**：
```json
{
  "type": "bug",
  "title": "登录页面显示异常",
  "content": "登录页面在移动端显示异常，按钮位置偏移"
}
```

**响应**：返回创建的反馈信息

### 7.2 获取用户的反馈列表

**接口路径**：`GET /api/feedback`

**功能描述**：获取当前用户的反馈列表

**响应**：返回反馈列表

### 7.3 获取反馈详情

**接口路径**：`GET /api/feedback/{feedbackId}`

**功能描述**：获取指定反馈的详细信息

**响应**：返回反馈详情

## 8. 笔记相关API

### 8.1 保存笔记

**接口路径**：`POST /api/notes/save`

**功能描述**：保存或更新笔记

**请求体**：
```json
{
  "title": "学习笔记",
  "content": "# AI学习笔记\n\nAI是人工智能的缩写...",
  "filePath": "/学习笔记"
}
```

**响应**：返回保存的笔记信息

### 8.2 获取笔记列表

**接口路径**：`GET /api/notes/list`

**功能描述**：获取当前用户的笔记列表

**响应**：
```json
{
  "notes": [
    {
      "id": 1,
      "title": "学习笔记",
      "content": "# AI学习笔记\n\nAI是人工智能的缩写...",
      "filePath": "/学习笔记",
      "createdAt": "2023-12-01T10:00:00Z",
      "updatedAt": "2023-12-01T10:00:00Z"
    }
  ]
}
```

### 8.3 获取笔记详情

**接口路径**：`GET /api/notes/{noteId}`

**功能描述**：获取指定笔记的详细信息

**响应**：返回笔记详情

### 8.4 删除笔记

**接口路径**：`DELETE /api/notes/{noteId}`

**功能描述**：删除指定笔记

**响应**：
```json
{
  "message": "笔记已删除"
}
```

## 9. 用户设置相关API

### 9.1 获取用户设置

**接口路径**：`GET /api/settings`

**功能描述**：获取当前用户的设置信息

**响应**：返回用户设置信息

### 9.2 更新用户设置

**接口路径**：`POST /api/settings`

**功能描述**：更新当前用户的设置

**请求体**：
```json
{
  "theme": "dark",
  "language": "zh-CN",
  "notificationsEnabled": true
}
```

**响应**：返回更新后的设置信息

### 9.3 删除用户设置

**接口路径**：`DELETE /api/settings`

**功能描述**：删除当前用户的设置（恢复默认设置）

**响应**：
```json
{
  "message": "设置已删除"
}
```

## 10. 词汇学习相关API

### 10.1 创建单词表

**接口路径**：`POST /api/vocabulary/lists`

**功能描述**：创建新的单词表

**请求体**：
```json
{
  "name": "英语单词表",
  "description": "日常英语单词",
  "language": "en"
}
```

**响应**：返回创建的单词表信息

### 10.2 获取单词表列表

**接口路径**：`GET /api/vocabulary/lists`

**功能描述**：获取当前用户的单词表列表

**响应**：
```json
{
  "lists": [
    {
      "id": 1,
      "name": "英语单词表",
      "description": "日常英语单词",
      "language": "en",
      "createdAt": "2023-12-01T10:00:00Z"
    }
  ]
}
```

### 10.3 添加单词到单词表

**接口路径**：`POST /api/vocabulary/lists/{listId}/words`

**功能描述**：向指定单词表添加新单词

**请求体**：
```json
{
  "word": "hello",
  "definition": "你好",
  "partOfSpeech": "int",
  "example": "Hello, how are you?",
  "language": "en"
}
```

**响应**：返回添加的单词信息

### 10.4 获取单词表中的所有单词

**接口路径**：`GET /api/vocabulary/lists/{listId}/words`

**功能描述**：获取指定单词表中的所有单词

**响应**：
```json
{
  "words": [
    {
      "id": 1,
      "word": "hello",
      "definition": "你好",
      "partOfSpeech": "int",
      "example": "Hello, how are you?",
      "language": "en",
      "createdAt": "2023-12-01T10:00:00Z"
    }
  ]
}
```

### 10.5 删除单词表

**接口路径**：`DELETE /api/vocabulary/lists/{listId}`

**功能描述**：删除指定单词表

**响应**：
```json
{
  "message": "单词表已删除"
}
```

### 10.6 删除单词

**接口路径**：`DELETE /api/vocabulary/words/{wordId}`

**功能描述**：删除指定单词

**响应**：
```json
{
  "message": "单词已删除"
}
```

### 10.7 更新单词学习进度

**接口路径**：`POST /api/vocabulary/progress`

**功能描述**：更新用户对指定单词的学习进度

**请求体**：
```json
{
  "wordId": 1,
  "masteryLevel": 3,
  "isDifficult": false
}
```

**响应**：返回更新后的学习进度

### 10.8 获取需要复习的单词

**接口路径**：`GET /api/vocabulary/review`

**功能描述**：获取当前用户需要复习的单词列表

**响应**：
```json
{
  "words": [
    {
      "id": 1,
      "word": {
        "word": "hello",
        "definition": "你好"
      },
      "masteryLevel": 3,
      "nextReviewDate": "2023-12-02T10:00:00Z"
    }
  ]
}
```

### 10.9 获取学习统计

**接口路径**：`GET /api/vocabulary/stats`

**功能描述**：获取当前用户的词汇学习统计信息

**响应**：返回学习统计数据

### 10.10 记录学习活动

**接口路径**：`POST /api/vocabulary/activity`

**功能描述**：记录用户的学习活动

**请求体**：
```json
{
  "activityType": "review",
  "activityDetails": "复习了10个单词",
  "duration": 15
}
```

**响应**：
```json
{
  "message": "学习活动已记录"
}
```

### 10.11 搜索公共词库

**接口路径**：`GET /api/vocabulary/public/search?keyword=hello&language=en`

**功能描述**：搜索公共词库中的单词

**请求参数**：
- `keyword`：搜索关键词
- `language`：语言代码（默认：en）

**响应**：
```json
{
  "words": [
    {
      "id": 1,
      "word": "hello",
      "definition": "你好",
      "partOfSpeech": "int",
      "example": "Hello, how are you?",
      "language": "en"
    }
  ]
}
```

## 11. 错误处理

所有API接口在发生错误时，返回统一的错误格式：

```json
{
  "timestamp": "2023-12-01T10:00:00Z",
  "status": 400,
  "error": "Bad Request",
  "message": "请求参数错误",
  "path": "/api/auth/login"
}
```

### 11.1 常见错误码

| 错误码 | 描述 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未授权，缺少或无效的token |
| 403 | 禁止访问，没有权限 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

## 12. 附录

### 12.1 数据类型说明

| 数据类型 | 描述 |
|----------|------|
| String | 字符串类型 |
| Integer | 整数类型 |
| Long | 长整数类型 |
| Boolean | 布尔类型，true/false |
| Date | 日期时间类型，格式：ISO 8601（YYYY-MM-DDTHH:mm:ssZ） |
| Array | 数组类型 |
| Object | 对象类型，包含键值对 |

### 12.2 状态码说明

| 状态码 | 描述 |
|--------|------|
| 1 | 用户 |
| 2 | AI |
| "pending" | 待处理 |
| "processing" | 处理中 |
| "completed" | 已完成 |
| "failed" | 失败 |

## 13. 版本历史

| 版本 | 日期 | 描述 |
|------|------|------|
| 1.0.0 | 2023-12-01 | 初始版本 |

# AI智能学习导师 API 文档

## 1. 应用概述

- **应用名称**: AI智能学习导师
- **描述**: 基于IPv6的AI智能学习助手
- **版本**: 4.0
- **文档地址**: http://{host}:{port}/docs
- **API地址**: http://{host}:{port}/api

## 2. 认证方式

本应用使用JWT (JSON Web Token) 进行认证。用户登录后获取token，之后的所有请求都需要在Authorization头中携带该token。

```
Authorization: Bearer <your_token>
```

## 3. 主要功能模块

### 3.1 用户认证与管理

#### 3.1.1 注册

**URL**: `/api/register/email`
**方法**: `POST`
**描述**: 发送注册验证码到指定邮箱
**请求体**:
```json
{
  "email": "user@example.com"
}
```
**响应**:
```json
{
  "message": "已成功发送验证码！"
}
```

#### 3.1.2 完成注册

**URL**: `/api/register`
**方法**: `POST`
**描述**: 完成用户注册
**请求体**:
```json
{
  "username": "username",
  "email": "user@example.com",
  "password": "password123",
  "createVerifyCode_value": "123456",
  "agree_terms": true
}
```
**响应**:
```json
{
  "message": "注册成功",
  "user": {
    "id": 1,
    "username": "username",
    "email": "user@example.com",
    "created_at": "2023-01-01T00:00:00"
  }
}
```

#### 3.1.3 登录

**URL**: `/api/login`
**方法**: `POST`
**描述**: 用户登录获取token
**请求体**:
```json
{
  "useremail": "user@example.com",
  "password": "password123",
  "agree_terms": true
}
```
**响应**:
```json
{
  "message": "登录成功",
  "user": {
    "id": 1,
    "username": "username",
    "email": "user@example.com",
    "created_at": "2023-01-01T00:00:00"
  },
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### 3.1.4 验证Token

**URL**: `/api/auth/verify`
**方法**: `POST`
**描述**: 验证用户token的有效性
**请求体**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```
**响应**:
```json
{
  "valid": true,
  "user_id": 1,
  "username": "username",
  "message": "Token验证成功"
}
```

#### 3.1.5 忘记密码

**URL**: `/api/forgot-password/email`
**方法**: `POST`
**描述**: 发送密码重置验证码
**请求体**:
```json
{
  "email": "user@example.com"
}
```
**响应**:
```json
{
  "message": "已成功发送验证码！"
}
```

#### 3.1.6 重置密码

**URL**: `/api/forgot-password`
**方法**: `POST`
**描述**: 使用验证码重置密码
**请求体**:
```json
{
  "email": "user@example.com",
  "verifyCode": "123456",
  "newPassword": "newpassword123"
}
```
**响应**:
```json
{
  "message": "密码重置成功，请用新密码登录"
}
```

#### 3.1.7 获取当前用户信息

**URL**: `/api/users/me`
**方法**: `GET`
**描述**: 获取当前登录用户的信息
**响应**:
```json
{
  "status": "success",
  "message": "获取用户信息成功",
  "data": {
    "id": 1,
    "username": "username",
    "email": "user@example.com",
    "avatar": null,
    "created_at": "2023-01-01T00:00:00",
    "is_admin": false
  }
}
```

### 3.2 用户头像管理

#### 3.2.1 上传头像

**URL**: `/api/users/avatar/upload`
**方法**: `POST`
**描述**: 上传用户头像
**请求体**: 表单数据，包含file字段
**响应**:
```json
{
  "code": 200,
  "message": "头像上传成功",
  "data": {
    "avatar_url": "/api/users/avatar/1_12345678.jpg",
    "filename": "1_12345678.jpg"
  }
}
```

#### 3.2.2 获取头像

**URL**: `/api/users/avatar/{filename}`
**方法**: `GET`
**描述**: 获取用户头像
**响应**: 图片文件

#### 3.2.3 删除头像

**URL**: `/api/users/avatar`
**方法**: `DELETE`
**描述**: 删除用户头像
**响应**:
```json
{
  "code": 200,
  "message": "头像删除成功"
}
```

### 3.3 资源管理

#### 3.3.1 添加资源

**URL**: `/api/resources`
**方法**: `POST`
**描述**: 添加学习资源
**请求体**:
```json
{
  "category_name": "编程",
  "title": "Python入门教程",
  "url": "https://example.com/python-tutorial",
  "description": "Python基础入门教程"
}
```
**响应**:
```json
{
  "message": "资源添加成功",
  "resource": {
    "id": 1,
    "title": "Python入门教程",
    "url": "https://example.com/python-tutorial",
    "description": "Python基础入门教程",
    "category_id": 1,
    "category_name": "编程",
    "is_public": 0,
    "created_at": "2023-01-01T00:00:00"
  }
}
```

#### 3.3.2 获取资源列表

**URL**: `/api/resources`
**方法**: `GET`
**描述**: 获取用户收藏的资源列表
**参数**:
- `category_name`: 可选，按分类筛选
**响应**:
```json
{
  "resources": [
    {
      "id": 1,
      "title": "Python入门教程",
      "url": "https://example.com/python-tutorial",
      "description": "Python基础入门教程",
      "category_id": 1,
      "category_name": "编程",
      "is_public": 0,
      "created_at": "2023-01-01T00:00:00",
      "is_favorite": true
    }
  ]
}
```

#### 3.3.3 取消收藏

**URL**: `/api/favorites/remove`
**方法**: `POST`
**描述**: 取消收藏资源
**请求体**:
```json
{
  "resource_id": 1
}
```
**响应**:
```json
{
  "message": "取消收藏成功"
}
```

### 3.4 聊天功能

#### 3.4.1 发送消息

**URL**: `/api/ask-stream`
**方法**: `POST`
**描述**: 发送问题并获取AI的流式回复
**请求体**:
```json
{
  "question": "什么是人工智能？",
  "session_id": "session123"
}
```
**响应**: 流式文本响应

#### 3.4.2 获取聊天会话列表

**URL**: `/api/chat-records/sessions`
**方法**: `GET`
**描述**: 获取用户的聊天会话列表
**响应**:
```json
{
  "sessions": [
    {
      "session_id": "session123",
      "last_message": "什么是人工智能？",
      "last_message_time": "2023-01-01 12:00:00"
    }
  ]
}
```

#### 3.4.3 获取会话消息

**URL**: `/api/chat-records/session/{session_id}`
**方法**: `GET`
**描述**: 获取指定会话的聊天记录
**响应**:
```json
{
  "messages": [
    {
      "id": 1,
      "session_id": "session123",
      "message_order": 1,
      "content": "什么是人工智能？",
      "sender_type": 1,
      "send_time": "2023-01-01 12:00:00",
      "user_id": "1",
      "status": "completed",
      "ai_model": "deepseek"
    }
  ]
}
```

#### 3.4.4 删除会话

**URL**: `/api/chat-records/session/{session_id}`
**方法**: `DELETE`
**描述**: 删除指定会话
**响应**:
```json
{
  "message": "会话已删除"
}
```

#### 3.4.5 创建新会话

**URL**: `/api/chat-records/new-session`
**方法**: `POST`
**描述**: 创建新的聊天会话
**响应**:
```json
{
  "session_id": "new_session_123"
}
```

### 3.5 文件管理

#### 3.5.1 上传文件

**URL**: `/api/files/upload`
**方法**: `POST`
**描述**: 上传文件到云盘
**请求体**: 表单数据，包含file字段
**响应**:
```json
{
  "message": "文件上传完成",
  "success_count": 1,
  "error_count": 0,
  "uploaded_files": [
    {
      "id": 1,
      "filename": "example.txt",
      "stored_filename": "user_1_20230101_120000_abc123.txt",
      "status": "success"
    }
  ]
}
```

#### 3.5.2 获取文件列表

**URL**: `/api/files`
**方法**: `GET`
**描述**: 获取用户的文件列表
**参数**:
- `skip`: 跳过的记录数，默认0
- `limit`: 返回的最大记录数，默认100
**响应**:
```json
[
  {
    "id": 1,
    "file_uuid": "uuid123",
    "original_name": "example.txt",
    "save_path": "/path/to/example.txt",
    "file_size": 1024,
    "file_type": "text/plain",
    "upload_time": "2023-01-01T12:00:00",
    "user_id": 1
  }
]
```

#### 3.5.3 下载文件

**URL**: `/api/files/{file_id}/download`
**方法**: `GET`
**描述**: 下载文件
**响应**: 文件内容

#### 3.5.4 删除文件

**URL**: `/api/files/{file_id}`
**方法**: `DELETE`
**描述**: 删除文件
**响应**:
```json
{
  "message": "文件删除成功"
}
```

### 3.6 云盘功能

#### 3.6.1 上传云盘文件

**URL**: `/api/cloud_disk/upload`
**方法**: `POST`
**描述**: 上传文件到云盘
**请求体**: 表单数据，包含file字段和folder_path字段
**响应**:
```json
{
  "message": "文件上传完成",
  "success_count": 1,
  "error_count": 0,
  "uploaded_files": [
    {
      "id": 1,
      "file_name": "example.txt",
      "status": "success"
    }
  ]
}
```

#### 3.6.2 获取云盘文件列表

**URL**: `/api/cloud_disk/files`
**方法**: `GET`
**描述**: 获取用户的云盘文件列表
**参数**:
- `user_id`: 用户ID
**响应**:
```json
{
  "tree": [
    {
      "path": "/",
      "name": "根目录",
      "type": "folder",
      "children": [
        {
          "id": 1,
          "file_uuid": "uuid123",
          "original_name": "example.txt",
          "file_size": 1024,
          "file_type": "text/plain",
          "upload_time": "2023-01-01T12:00:00",
          "user_id": 1,
          "folder_path": "/",
          "type": "file"
        }
      ],
      "is_expanded": true
    }
  ],
  "folders": ["/"],
  "total_files": 1,
  "total_size": 1024
}
```

#### 3.6.3 创建文件夹

**URL**: `/api/cloud_disk/create-folder`
**方法**: `POST`
**描述**: 创建新文件夹
**请求体**:
```json
{
  "folder_path": "/new_folder/"
}
```
**响应**:
```json
{
  "message": "文件夹创建成功",
  "folder_path": "/new_folder/"
}
```

#### 3.6.4 删除文件夹

**URL**: `/api/cloud_disk/delete-folder`
**方法**: `POST`
**描述**: 删除文件夹及其内的所有文件
**请求体**:
```json
{
  "folder_path": "/new_folder/"
}
```
**响应**:
```json
{
  "message": "文件夹删除成功",
  "deleted_count": 1
}
```

#### 3.6.5 移动文件

**URL**: `/api/cloud_disk/move-file`
**方法**: `PUT`
**描述**: 将文件移动到指定文件夹
**请求体**:
```json
{
  "file_id": 1,
  "target_folder": "/new_folder/"
}
```
**响应**:
```json
{
  "message": "文件移动成功",
  "file": {
    "id": 1,
    "file_uuid": "uuid123",
    "original_name": "example.txt",
    "save_path": "/path/to/example.txt",
    "file_size": 1024,
    "file_type": "text/plain",
    "upload_time": "2023-01-01T12:00:00",
    "user_id": 1,
    "folder_path": "/new_folder/"
  }
}
```

### 3.7 笔记功能

#### 3.7.1 保存笔记

**URL**: `/api/notes/save`
**方法**: `POST`
**描述**: 创建或更新笔记
**请求体**:
```json
{
  "title": "笔记标题",
  "content": "笔记内容",
  "id": 1 // 可选，用于更新现有笔记
}
```
**响应**:
```json
{
  "id": 1,
  "title": "笔记标题",
  "file_path": "/path/to/note.txt",
  "created_at": "2023-01-01T12:00:00",
  "updated_at": "2023-01-01T12:00:00",
  "user_id": 1
}
```

#### 3.7.2 获取笔记列表

**URL**: `/api/notes/list`
**方法**: `GET`
**描述**: 获取用户的笔记列表
**响应**:
```json
{
  "notes": [
    {
      "id": 1,
      "title": "笔记标题",
      "file_path": "/path/to/note.txt",
      "created_at": "2023-01-01T12:00:00",
      "updated_at": "2023-01-01T12:00:00",
      "user_id": 1
    }
  ]
}
```

#### 3.7.3 获取笔记内容

**URL**: `/api/notes/{note_id}`
**方法**: `GET`
**描述**: 获取笔记的详细内容
**响应**:
```json
{
  "id": 1,
  "title": "笔记标题",
  "file_path": "/path/to/note.txt",
  "created_at": "2023-01-01T12:00:00",
  "updated_at": "2023-01-01T12:00:00",
  "user_id": 1,
  "content": "笔记内容"
}
```

#### 3.7.4 删除笔记

**URL**: `/api/notes/{note_id}`
**方法**: `DELETE`
**描述**: 删除笔记
**响应**:
```json
{
  "message": "笔记删除成功"
}
```

### 3.8 反馈系统

#### 3.8.1 提交反馈

**URL**: `/api/feedback`
**方法**: `POST`
**描述**: 提交用户反馈
**请求体**:
```json
{
  "content": "这是一条反馈内容",
  "feedback_type": "suggestion",
  "contact_info": "user@example.com"
}
```
**响应**:
```json
{
  "id": 1,
  "user_id": 1,
  "username": "username",
  "content": "这是一条反馈内容",
  "feedback_type": "suggestion",
  "status": "pending",
  "created_at": "2023-01-01 12:00:00",
  "updated_at": "2023-01-01 12:00:00",
  "contact_info": "user@example.com"
}
```

#### 3.8.2 获取反馈列表

**URL**: `/api/feedback`
**方法**: `GET`
**描述**: 获取用户的反馈列表
**参数**:
- `skip`: 跳过的记录数，默认0
- `limit`: 返回的最大记录数，默认10
**响应**:
```json
[
  {
    "id": 1,
    "user_id": 1,
    "username": "username",
    "content": "这是一条反馈内容",
    "feedback_type": "suggestion",
    "status": "pending",
    "created_at": "2023-01-01 12:00:00",
    "updated_at": "2023-01-01 12:00:00",
    "contact_info": "user@example.com"
  }
]
```

### 3.9 翻译功能

#### 3.9.1 翻译文本

**URL**: `/api/ask/translate`
**方法**: `POST`
**描述**: 翻译文本
**请求体**:
```json
{
  "question": "Hello, how are you?",
  "session_id": "translate_session_123"
}
```
**响应**:
```json
{
  "content": "你好，你好吗？",
  "session_id": "translate_session_123"
}
```

### 3.10 管理员功能

#### 3.10.1 验证管理员权限

**URL**: `/api/admin/verify`
**方法**: `GET`
**描述**: 验证当前用户是否具有管理员权限
**响应**:
```json
{
  "is_admin": true
}
```

#### 3.10.2 获取仪表盘数据

**URL**: `/api/admin/dashboard`
**方法**: `GET`
**描述**: 获取管理员仪表盘统计数据
**响应**:
```json
{
  "total_users": 10,
  "total_files": 100,
  "total_resources": 50,
  "recent_users": [
    {
      "id": 1,
      "username": "user1",
      "email": "user1@example.com",
      "created_at": "2023-01-01T12:00:00"
    }
  ],
  "recent_files": [
    {
      "id": 1,
      "original_name": "example.txt",
      "file_size": 1024,
      "upload_time": "2023-01-01T12:00:00",
      "user_id": 1
    }
  ]
}
```

#### 3.10.3 创建用户

**URL**: `/api/admin/create-user`
**方法**: `POST`
**描述**: 创建新用户
**请求体**:
```json
{
  "username": "newuser",
  "email": "newuser@example.com",
  "password": "password123"
}
```
**响应**:
```json
{
  "message": "用户创建成功",
  "user_id": 2,
  "username": "newuser",
  "email": "newuser@example.com"
}
```

#### 3.10.4 获取所有用户

**URL**: `/api/admin/users`
**方法**: `GET`
**描述**: 获取所有用户列表
**参数**:
- `page`: 页码，默认1
- `page_size`: 每页记录数，默认20
**响应**:
```json
{
  "users": [
    {
      "id": 1,
      "username": "user1",
      "email": "user1@example.com",
      "created_at": "2023-01-01T12:00:00"
    }
  ],
  "total": 10,
  "page": 1,
  "page_size": 20,
  "total_pages": 1
}
```

#### 3.10.5 删除用户

**URL**: `/api/admin/users/{user_id}`
**方法**: `DELETE`
**描述**: 删除用户
**响应**:
```json
{
  "message": "用户删除成功"
}
```

## 4. 数据模型

### 4.1 用户模型 (User)

| 字段名 | 类型 | 描述 |
|--------|------|------|
| id | Integer | 用户ID |
| username | String(80) | 用户名 |
| email | String(120) | 邮箱 |
| password_hash | String(255) | 密码哈希 |
| avatar | String(255) | 头像URL |
| created_at | DateTime | 创建时间 |
| updated_at | DateTime | 更新时间 |

### 4.2 资源模型 (Resource)

| 字段名 | 类型 | 描述 |
|--------|------|------|
| id | Integer | 资源ID |
| category_id | Integer | 分类ID |
| title | String(200) | 标题 |
| url | String(500) | 链接 |
| description | Text | 描述 |
| is_public | Integer | 是否公开 (0: 私有, 1: 公共) |
| created_at | DateTime | 创建时间 |

### 4.3 分类模型 (Category)

| 字段名 | 类型 | 描述 |
|--------|------|------|
| id | Integer | 分类ID |
| name | String(50) | 分类名称 |
| description | Text | 分类描述 |
| created_at | DateTime | 创建时间 |

### 4.4 聊天记录模型 (ChatRecord)

| 字段名 | 类型 | 描述 |
|--------|------|------|
| id | Integer | 记录ID |
| session_id | String(64) | 会话ID |
| message_order | Integer | 消息顺序 |
| content | Text | 消息内容 |
| sender_type | Integer | 发送者类型 (1: 用户, 2: AI) |
| send_time | DateTime | 发送时间 |
| user_id | String(64) | 用户ID |
| status | String(20) | 状态 (pending, completed, failed, cancelled) |
| ai_model | String(50) | 使用的AI模型 |

### 4.5 文件模型 (UserFile)

| 字段名 | 类型 | 描述 |
|--------|------|------|
| id | Integer | 文件ID |
| file_uuid | String(36) | 文件唯一标识 |
| original_name | String(255) | 原始文件名 |
| save_path | String(255) | 存储路径 |
| file_size | Integer | 文件大小（字节） |
| file_type | String(50) | MIME类型 |
| upload_time | DateTime | 上传时间 |
| user_id | Integer | 用户ID |
| folder_path | String(500) | 文件夹路径 |

### 4.6 反馈模型 (Feedback)

| 字段名 | 类型 | 描述 |
|--------|------|------|
| id | Integer | 反馈ID |
| user_id | Integer | 用户ID |
| content | Text | 反馈内容 |
| feedback_type | String(20) | 反馈类型 (suggestion, problem, bug, other) |
| status | String(20) | 状态 (pending, processing, resolved, rejected) |
| created_at | DateTime | 创建时间 |
| updated_at | DateTime | 更新时间 |
| contact_info | String(255) | 联系方式 |

## 5. 错误处理

API返回的错误格式统一为:

```json
{
  "detail": "错误描述"
}
```

常见错误码:

| 状态码 | 描述 |
|--------|------|
| 200 | 请求成功 |
| 400 | 请求参数错误 |
| 401 | 未授权，token无效或过期 |
| 403 | 禁止访问，没有权限 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

## 6. 依赖项

### 6.1 get_db

获取数据库会话，用于所有需要访问数据库的API端点。

### 6.2 get_current_user

获取当前登录用户，用于需要认证的API端点。

### 6.3 get_current_admin

获取当前管理员用户，用于需要管理员权限的API端点。

## 7. 配置说明

### 7.1 环境变量

| 变量名 | 描述 |
|--------|------|
| HOST | 服务器主机地址 |
| PORT | 服务器端口 |
| DEBUG | 是否启用调试模式 |
| DATABASE_URL | 数据库连接URL |
| JWT_SECRET_KEY | JWT密钥 |
| DEEPSEEK_API_KEY | DeepSeek API密钥 |
| MAX_TOKEN | 最大token数 |
| DOUBAO_BASEURL | 豆包API基础URL |
| MAX_FILE_SIZE | 最大文件大小 |

### 7.2 文件上传配置

- 最大文件大小: 100MB
- 支持的文件类型: jpg, jpeg, png, gif, pdf, doc, docx, xls, xlsx, ppt, pptx, txt, md, zip, rar, 7z
- 上传目录: `uploads/`
- 云盘目录: `cloud_disk/`

## 8. 启动和运行

### 8.1 启动命令

```bash
python run.py
```

### 8.2 访问地址

- **应用首页**: http://{host}:{port}/
- **API文档**: http://{host}:{port}/docs
- **API地址**: http://{host}:{port}/api

## 9. 开发说明

### 9.1 项目结构

```
py/
├── app.py            # FastAPI应用主文件
├── config.py         # 配置文件
├── run.py            # 启动脚本
├── chat_records.py   # 聊天记录路由
├── models.py         # 数据库模型
├── utils/            # 工具函数
└── api_doc.apimd     # API文档
```

### 9.2 路由注册

所有路由都在`app.py`中定义，或者通过`register_all_routes()`函数动态导入注册，避免循环依赖问题。

### 9.3 数据库初始化

应用启动时会自动创建所有数据库表，并初始化一些默认数据。

## 10. 更新日志

### 版本 4.0

- 重构了文件上传功能，支持大文件上传
- 新增了云盘功能，支持文件夹管理
- 优化了聊天记录存储和管理
- 新增了笔记功能
- 新增了反馈系统
- 改进了管理员功能
- 支持IPv6
- 优化了API性能

## 11. 联系方式

如有问题或建议，请通过以下方式联系:

- 邮箱: support@example.com
- 反馈系统: 在应用内提交反馈

---

**文档生成时间**: 2023-01-01
**文档版本**: 1.0

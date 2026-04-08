# 数据库表结构与键值依赖关系说明

## 1. 数据库概述

本应用使用关系型数据库存储数据，采用SQLAlchemy ORM框架进行数据库操作。数据库表之间通过外键建立关联，形成完整的数据关系网络。

## 2. 表结构与依赖关系

### 2.1 users表（用户表）

**表名**: `users`
**描述**: 存储系统用户基本信息，是系统的核心表

**字段列表**:
| 字段名 | 数据类型 | 约束 | 描述 |
|--------|----------|------|------|
| id | Integer | PRIMARY KEY, AUTO_INCREMENT | 用户唯一标识 |
| username | String(80) | NOT NULL, UNIQUE | 用户名，唯一 |
| email | String(120) | NOT NULL, UNIQUE | 邮箱，唯一 |
| password_hash | String(255) | NOT NULL | 密码哈希值 |
| avatar | String(255) | NULL | 用户头像URL |
| created_at | DateTime | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DateTime | DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

**主键**: `id`

**外键依赖**: 无（核心表）

**关联关系**:
- 1:1关联 `admins.user_id -> users.id`
- 1:N关联 `notes.user_id -> users.id`
- 1:N关联 `user_folders.user_id -> users.id`
- 1:N关联 `files.user_id -> users.id`
- 1:N关联 `user_favorites.user_id -> users.id`

### 2.2 admins表（管理员表）

**表名**: `admins`
**描述**: 存储管理员信息，与用户表形成1:1关联

**字段列表**:
| 字段名 | 数据类型 | 约束 | 描述 |
|--------|----------|------|------|
| id | Integer | PRIMARY KEY, AUTO_INCREMENT | 管理员记录ID |
| user_id | Integer | NOT NULL, UNIQUE, FOREIGN KEY | 关联的用户ID |
| is_active | Boolean | DEFAULT True | 是否激活 |
| created_at | DateTime | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DateTime | DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

**主键**: `id`

**外键依赖**:
| 外键字段 | 关联表 | 关联字段 | 约束 |
|----------|--------|----------|------|
| user_id | users | id | NOT NULL, UNIQUE |

**关联关系**:
- N:1关联 `admins.user_id -> users.id`

### 2.3 categories表（分类表）

**表名**: `categories`
**描述**: 存储资源分类信息

**字段列表**:
| 字段名 | 数据类型 | 约束 | 描述 |
|--------|----------|------|------|
| id | Integer | PRIMARY KEY, AUTO_INCREMENT | 分类ID |
| name | String(50) | NOT NULL, UNIQUE | 分类名称 |
| description | Text | NULL | 分类描述 |
| created_at | DateTime | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

**主键**: `id`

**外键依赖**: 无

**关联关系**:
- 1:N关联 `resources.category_id -> categories.id`

### 2.4 resources表（资源表）

**表名**: `resources`
**描述**: 存储学习资源信息

**字段列表**:
| 字段名 | 数据类型 | 约束 | 描述 |
|--------|----------|------|------|
| id | Integer | PRIMARY KEY, AUTO_INCREMENT | 资源ID |
| category_id | Integer | NOT NULL, FOREIGN KEY | 所属分类ID |
| title | String(200) | NOT NULL | 资源标题 |
| url | String(500) | NOT NULL | 资源链接 |
| description | Text | NULL | 资源描述 |
| is_public | Integer | DEFAULT 1 | 是否公开 (0: 私有, 1: 公共) |
| created_at | DateTime | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

**主键**: `id`

**外键依赖**:
| 外键字段 | 关联表 | 关联字段 | 约束 |
|----------|--------|----------|------|
| category_id | categories | id | NOT NULL |

**关联关系**:
- N:1关联 `resources.category_id -> categories.id`
- 1:N关联 `user_favorites.resource_id -> resources.id`

### 2.5 user_favorites表（用户收藏表）

**表名**: `user_favorites`
**描述**: 存储用户收藏资源的关联关系，是users和resources的多对多关系表

**字段列表**:
| 字段名 | 数据类型 | 约束 | 描述 |
|--------|----------|------|------|
| id | Integer | PRIMARY KEY, AUTO_INCREMENT | 收藏记录ID |
| user_id | Integer | NOT NULL, FOREIGN KEY | 收藏用户ID |
| resource_id | Integer | NOT NULL, FOREIGN KEY | 收藏资源ID |
| created_at | DateTime | DEFAULT CURRENT_TIMESTAMP | 收藏时间 |

**主键**: `id`

**外键依赖**:
| 外键字段 | 关联表 | 关联字段 | 约束 |
|----------|--------|----------|------|
| user_id | users | id | NOT NULL |
| resource_id | resources | id | NOT NULL |

**唯一约束**:
- `unique_user_resource`: (user_id, resource_id) 唯一，确保用户不会重复收藏同一资源

**关联关系**:
- N:1关联 `user_favorites.user_id -> users.id`
- N:1关联 `user_favorites.resource_id -> resources.id`

### 2.6 chat_records表（聊天记录表）

**表名**: `chat_records`
**描述**: 存储用户与AI的聊天记录

**字段列表**:
| 字段名 | 数据类型 | 约束 | 描述 |
|--------|----------|------|------|
| id | Integer | PRIMARY KEY, AUTO_INCREMENT | 聊天记录ID |
| session_id | String(64) | NOT NULL | 会话ID，同一会话下的消息共享此ID |
| message_order | Integer | NOT NULL | 消息在会话中的顺序 |
| content | Text | NOT NULL | 消息内容 |
| sender_type | Integer | NOT NULL | 发送者类型 (1: 用户, 2: AI) |
| send_time | DateTime | DEFAULT CURRENT_TIMESTAMP | 发送时间 |
| user_id | String(64) | NOT NULL | 用户ID |
| status | String(20) | DEFAULT 'completed' | 消息状态 (pending, completed, failed, cancelled) |
| ai_model | String(50) | NULL | 使用的AI模型名称 |

**主键**: `id`

**外键依赖**: 无（user_id为字符串类型，未建立外键约束）

**索引**:
- `idx_session_order`: (session_id, message_order)，加速会话消息排序查询
- `idx_user_id`: (user_id)，加速按用户查询聊天记录

**关联关系**:
- 逻辑关联 `chat_records.user_id -> users.id`（无外键约束）

### 2.7 files表（文件表）

**表名**: `files`
**描述**: 存储用户上传的文件信息

**字段列表**:
| 字段名 | 数据类型 | 约束 | 描述 |
|--------|----------|------|------|
| id | Integer | PRIMARY KEY, AUTO_INCREMENT | 文件记录ID |
| file_uuid | String(36) | NOT NULL, UNIQUE | 文件唯一标识UUID |
| original_name | String(255) | NOT NULL | 原始文件名 |
| save_path | String(255) | NOT NULL | 文件存储路径 |
| file_size | Integer | NOT NULL | 文件大小（字节） |
| file_type | String(50) | NULL | 文件MIME类型 |
| upload_time | DateTime | DEFAULT CURRENT_TIMESTAMP | 上传时间 |
| user_id | Integer | NOT NULL, FOREIGN KEY | 所属用户ID |
| folder_path | String(500) | DEFAULT '/' | 文件所在文件夹路径 |

**主键**: `id`

**外键依赖**:
| 外键字段 | 关联表 | 关联字段 | 约束 |
|----------|--------|----------|------|
| user_id | users | id | NOT NULL |

**关联关系**:
- N:1关联 `files.user_id -> users.id`

### 2.8 notes表（笔记表）

**表名**: `notes`
**描述**: 存储用户笔记信息

**字段列表**:
| 字段名 | 数据类型 | 约束 | 描述 |
|--------|----------|------|------|
| id | Integer | PRIMARY KEY, AUTO_INCREMENT | 笔记ID |
| title | String(255) | NOT NULL | 笔记标题 |
| file_path | String(255) | NOT NULL | 笔记文件存储路径 |
| created_at | DateTime | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DateTime | DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 更新时间 |
| user_id | Integer | NOT NULL, FOREIGN KEY | 所属用户ID |

**主键**: `id`

**外键依赖**:
| 外键字段 | 关联表 | 关联字段 | 约束 |
|----------|--------|----------|------|
| user_id | users | id | NOT NULL |

**关联关系**:
- N:1关联 `notes.user_id -> users.id`

### 2.9 user_folders表（用户文件夹表）

**表名**: `user_folders`
**描述**: 存储用户创建的虚拟文件夹

**字段列表**:
| 字段名 | 数据类型 | 约束 | 描述 |
|--------|----------|------|------|
| id | Integer | PRIMARY KEY, AUTO_INCREMENT | 文件夹ID |
| user_id | Integer | NOT NULL, FOREIGN KEY | 所属用户ID |
| folder_path | String(500) | NOT NULL | 文件夹路径 |
| created_at | DateTime | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

**主键**: `id`

**外键依赖**:
| 外键字段 | 关联表 | 关联字段 | 约束 |
|----------|--------|----------|------|
| user_id | users | id | NOT NULL |

**唯一约束**:
- `unique_user_folder_path`: (user_id, folder_path) 唯一，确保用户不会创建重复路径的文件夹

**关联关系**:
- N:1关联 `user_folders.user_id -> users.id`

### 2.10 categories表（分类表）

**表名**: `categories`
**描述**: 存储资源分类信息

**字段列表**:
| 字段名 | 数据类型 | 约束 | 描述 |
|--------|----------|------|------|
| id | Integer | PRIMARY KEY, AUTO_INCREMENT | 分类ID |
| name | String(50) | NOT NULL, UNIQUE | 分类名称 |
| description | Text | NULL | 分类描述 |
| created_at | DateTime | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

**主键**: `id`

**外键依赖**: 无

**关联关系**:
- 1:N关联 `resources.category_id -> categories.id`

### 2.11 verification_codes表（验证码表）

**表名**: `verification_codes`
**描述**: 存储邮箱验证码信息，用于用户注册和密码重置

**字段列表**:
| 字段名 | 数据类型 | 约束 | 描述 |
|--------|----------|------|------|
| id | Integer | PRIMARY KEY, AUTO_INCREMENT | 验证码记录ID |
| email | String(255) | NOT NULL | 接收验证码的邮箱 |
| code | String(6) | NOT NULL | 验证码 |
| expiration_time | DateTime | NOT NULL | 验证码过期时间 |
| created_time | DateTime | DEFAULT CURRENT_TIMESTAMP | 验证码创建时间 |
| is_blocked | Boolean | DEFAULT False | 是否被封禁 |
| blocked_until | DateTime | NULL | 封禁结束时间 |

**主键**: `id`

**外键依赖**: 无

### 2.12 user_settings表（用户设置表）

**表名**: `user_settings`
**描述**: 存储用户的AI模型配置设置

**字段列表**:
| 字段名 | 数据类型 | 约束 | 描述 |
|--------|----------|------|------|
| id | Integer | PRIMARY KEY, AUTO_INCREMENT | 设置记录ID |
| user_id | Integer | NOT NULL, UNIQUE, FOREIGN KEY | 所属用户ID |
| model_name | String(100) | NULL | AI模型名称 |
| api_base | String(500) | NULL | API访问地址 |
| api_key | String(500) | NULL | API密钥 |
| model_params | Text | NULL | 模型参数（JSON格式） |
| created_at | DateTime | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DateTime | DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

**主键**: `id`

**外键依赖**:
| 外键字段 | 关联表 | 关联字段 | 约束 |
|----------|--------|----------|------|
| user_id | users | id | NOT NULL, UNIQUE |

**关联关系**:
- 1:1关联 `user_settings.user_id -> users.id`

### 2.13 custom_ai_models表（自定义AI模型表）

**表名**: `custom_ai_models`
**描述**: 存储用户自定义的AI模型配置

**字段列表**:
| 字段名 | 数据类型 | 约束 | 描述 |
|--------|----------|------|------|
| id | Integer | PRIMARY KEY, AUTO_INCREMENT | 自定义模型ID |
| user_id | Integer | NOT NULL, FOREIGN KEY | 所属用户ID |
| model_name | String(100) | NOT NULL | 模型名称 |
| model_display_name | String(100) | NOT NULL | 模型显示名称 |
| api_base_url | String(500) | NOT NULL | API基础URL |
| api_key | String(500) | NOT NULL | API密钥 |
| is_active | Boolean | DEFAULT True | 是否启用 |
| last_test_status | String(20) | NULL | 最后测试状态 (success/failed) |
| last_test_time | DateTime | NULL | 最后测试时间 |
| created_at | DateTime | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DateTime | DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

**主键**: `id`

**外键依赖**:
| 外键字段 | 关联表 | 关联字段 | 约束 |
|----------|--------|----------|------|
| user_id | users | id | NOT NULL |

**关联关系**:
- N:1关联 `custom_ai_models.user_id -> users.id`

## 3. 表关系图

```
+----------------+     +----------------+     +----------------+     +----------------+     +----------------+     +----------------+
|     users      |     |     admins     |     |    resources   |     |    files       |     |    notes       |     | user_folders   |
+----------------+     +----------------+     +----------------+     +----------------+     +----------------+     +----------------+
| id (PK)        |<----| id (PK)        |     | id (PK)        |     | id (PK)        |     | id (PK)        |     | id (PK)        |
| username       |     | user_id (FK)   |     | category_id (FK)|     | user_id (FK)   |     | user_id (FK)   |     | user_id (FK)   |
| email          |     | is_active      |     | title          |     | file_uuid      |     | title          |     | folder_path    |
| password_hash  |     | created_at     |     | url            |     | original_name  |     | file_path      |     | created_at     |
| avatar         |     | updated_at     |     | description    |     | save_path      |     | created_at     |     |                |
| created_at     |     |                |     | is_public      |     | file_size      |     | updated_at     |     |                |
| updated_at     |     |                |     | created_at     |     | file_type      |     |                |     |                |
+----------------+     +----------------+     +----------------+     +----------------+     +----------------+     +----------------+
         ^                       ^                          ^                          ^                          ^
         |                       |                          |                          |                          |
         |                       |                          |                          |                          |
         v                       v                          v                          v                          v
+----------------+     +----------------+     +----------------+     +----------------+     +----------------+     +----------------+
| user_favorites |     | categories     |     | chat_records   |     | user_settings  |     | custom_ai_models|     | verification_codes|
+----------------+     +----------------+     +----------------+     +----------------+     +----------------+     +----------------+
| id (PK)        |     | id (PK)        |     | id (PK)        |     | id (PK)        |     | id (PK)        |     | id (PK)        |
| user_id (FK)   |     | name           |     | session_id     |     | user_id (FK)   |     | user_id (FK)   |     | email          |
| resource_id (FK)|    | description    |     | message_order  |     | model_name     |     | model_name     |     | code           |
| created_at     |     | created_at     |     | content        |     | api_base       |     | model_display_name|  | expiration_time|
|                |     |                |     | sender_type    |     | api_key        |     | api_base_url   |     | created_time   |
|                |     |                |     | send_time      |     | model_params   |     | api_key        |     | is_blocked     |
|                |     |                |     | user_id        |     | created_at     |     | is_active      |     | blocked_until  |
|                |     |                |     | status         |     | updated_at     |     | last_test_status|  |                |
|                |     |                |     | ai_model       |     |                |     | last_test_time |     |                |
+----------------+     +----------------+     +----------------+     +----------------+     +----------------+     +----------------+
         |                          ^
         |                          |
         v                          |
+----------------+                  |
|  categories    |------------------+
+----------------+
| id (PK)        |
| name           |
| description    |
| created_at     |
+----------------+
```

## 4. 依赖关系总结

### 4.1 核心依赖链

1. **用户相关依赖**: `users` → `admins`, `notes`, `user_folders`, `files`, `user_favorites`, `user_settings`, `custom_ai_models`
2. **资源相关依赖**: `categories` → `resources` → `user_favorites`
3. **聊天相关依赖**: `users` → `chat_records`
4. **文件相关依赖**: `users` → `files`, `user_folders`
5. **笔记相关依赖**: `users` → `notes`

### 4.2 关键依赖说明

1. **用户表是核心**: 几乎所有表都直接或间接依赖于users表
2. **外键约束确保数据完整性**: 外键约束确保了关联数据的一致性
3. **多对多关系**: users和resources通过user_favorites表建立多对多关系
4. **1:1关系**: users和admins通过外键建立1:1关系
5. **唯一约束**: 关键字段添加了唯一约束，防止数据重复

## 5. 索引与性能优化

1. **聊天记录索引**: `chat_records`表的`idx_session_order`索引加速会话消息的排序查询
2. **用户ID索引**: `chat_records`表的`idx_user_id`索引加速按用户查询聊天记录
3. **唯一约束**: 对username、email等字段添加唯一约束，确保数据唯一性并加速查询
4. **外键索引**: 外键字段自动创建索引，加速关联查询

## 6. 数据完整性保障

1. **外键约束**: 确保关联数据的一致性
2. **非空约束**: 关键字段添加非空约束，确保数据完整性
3. **唯一约束**: 防止数据重复
4. **默认值**: 为部分字段设置默认值，确保数据完整性
5. **时间戳**: 自动记录数据的创建和更新时间

## 7. 总结

本数据库设计遵循了关系型数据库的最佳实践，通过合理的表结构设计和外键约束，确保了数据的完整性和一致性。表之间的关联关系清晰，形成了完整的数据关系网络，能够有效支持应用的各种功能需求。

数据库设计考虑了性能优化，通过索引和唯一约束加速查询，提高系统响应速度。同时，设计也考虑了未来的扩展性，便于后续添加新的功能和表。
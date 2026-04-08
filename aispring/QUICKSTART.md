# AI智能学习导师 - 快速入门指南

## 项目概述

这是一个从Python FastAPI迁移到Spring Boot的AI智能学习助手项目。提供完整的用户认证、词汇学习、聊天记录、云盘管理等功能。

---

## 快速开始

### 1. 环境准备

**必需软件**:
- JDK 17 或更高版本
- MySQL 8.0+
- Maven 3.6+

**可选软件**:
- Git
- IDE (IntelliJ IDEA推荐)

### 2. 数据库配置

创建数据库:
```sql
CREATE DATABASE ipv6_education CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

修改 `src/main/resources/application.yml` 中的数据库配置:
```yaml
spring:
  datasource:
    url: jdbc:mysql://localhost:3306/ipv6_education?...
    username: root
    password: your_password
```

### 3. 配置邮件服务

修改 `application.yml` 中的邮件配置:
```yaml
spring:
  mail:
    host: smtp.qq.com
    username: your_email@qq.com
    password: your_authorization_code
```

### 4. 编译和运行

```bash
# 编译项目
mvn clean package

# 运行应用
mvn spring-boot:run

# 或直接运行JAR
java -jar target/aispring-1.0.0.jar
```

应用将在 http://localhost:5000 启动

---

## API端点概览

### 认证相关
- POST `/api/auth/register/send-code` - 发送注册验证码
- POST `/api/auth/register` - 用户注册
- POST `/api/auth/login` - 用户登录
- POST `/api/auth/forgot-password/send-code` - 发送忘记密码验证码
- POST `/api/auth/forgot-password` - 重置密码

### 聊天记录
- POST `/api/chat-records/save` - 保存聊天记录
- GET `/api/chat-records/sessions` - 获取会话列表
- GET `/api/chat-records/session/{sessionId}` - 获取会话消息
- DELETE `/api/chat-records/session/{sessionId}` - 删除会话

### 词汇学习
- POST `/api/vocabulary/lists` - 创建单词表
- GET `/api/vocabulary/lists` - 获取单词表列表
- POST `/api/vocabulary/lists/{listId}/words` - 添加单词
- GET `/api/vocabulary/review` - 获取需要复习的单词
- POST `/api/vocabulary/progress` - 更新学习进度

### 云盘管理
- POST `/api/cloud_disk/upload` - 上传文件
- GET `/api/cloud_disk/files` - 获取文件列表
- GET `/api/cloud_disk/download/{fileId}` - 下载文件
- DELETE `/api/cloud_disk/delete/{fileId}` - 删除文件
- POST `/api/cloud_disk/create-folder` - 创建文件夹

### 用户设置
- GET `/api/settings` - 获取用户设置
- POST `/api/settings` - 更新用户设置

### 反馈
- POST `/api/feedback` - 提交反馈
- GET `/api/feedback` - 获取反馈列表

### 笔记
- POST `/api/notes/save` - 保存笔记
- GET `/api/notes/list` - 获取笔记列表
- DELETE `/api/notes/{noteId}` - 删除笔记

### 自定义模型
- POST `/api/custom-models` - 创建自定义AI模型
- GET `/api/custom-models` - 获取模型列表
- PUT `/api/custom-models/{modelId}` - 更新模型
- DELETE `/api/custom-models/{modelId}` - 删除模型

---

## 使用示例

### 1. 用户注册

**步骤1: 发送验证码**
```bash
curl -X POST http://localhost:5000/api/auth/register/send-code \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'
```

**步骤2: 注册**
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "user@example.com",
    "password": "password123",
    "code": "123456"
  }'
```

### 2. 用户登录

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "testuser",
    "password": "password123"
  }'
```

响应示例:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "testuser",
    "email": "user@example.com"
  }
}
```

### 3. 创建单词表 (需要认证)

```bash
curl -X POST http://localhost:5000/api/vocabulary/lists \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "四级词汇",
    "description": "大学英语四级词汇表",
    "language": "en"
  }'
```

### 4. 上传文件到云盘

```bash
curl -X POST http://localhost:5000/api/cloud_disk/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@/path/to/file.pdf" \
  -F "folderId=1" \
  -F "folderPath=/documents"
```

---

## 项目结构

```
aispring/
├── src/main/java/com/aispring/
│   ├── controller/          # REST API控制器
│   │   ├── AuthController.java
│   │   ├── ChatRecordController.java
│   │   ├── VocabularyController.java
│   │   ├── CloudDiskController.java
│   │   └── ...
│   ├── service/            # 业务逻辑层
│   │   ├── AuthService.java
│   │   ├── ChatRecordService.java
│   │   ├── VocabularyService.java
│   │   └── ...
│   ├── repository/         # 数据访问层
│   │   ├── UserRepository.java
│   │   ├── ChatRecordRepository.java
│   │   └── ...
│   ├── entity/            # JPA实体类
│   │   ├── User.java
│   │   ├── ChatRecord.java
│   │   ├── VocabularyList.java
│   │   └── ...
│   ├── dto/               # 数据传输对象
│   │   ├── request/
│   │   └── response/
│   ├── config/            # 配置类
│   │   ├── SecurityConfig.java
│   │   └── CorsConfig.java
│   ├── security/          # 安全相关
│   │   ├── JwtAuthenticationFilter.java
│   │   └── UserDetailsServiceImpl.java
│   ├── exception/         # 异常处理
│   │   ├── CustomException.java
│   │   └── GlobalExceptionHandler.java
│   └── util/              # 工具类
│       ├── JwtUtil.java
│       └── EmailUtil.java
├── src/main/resources/
│   ├── application.yml    # 应用配置
│   └── ...
├── pom.xml               # Maven依赖配置
├── MIGRATION_SUMMARY.md  # 迁移总结
└── QUICKSTART.md         # 快速入门指南
```

---

## 核心技术栈

- **Spring Boot 3.x** - 应用框架
- **Spring Security** - 安全认证
- **Spring Data JPA** - 数据持久化
- **MySQL** - 数据库
- **JWT** - 令牌认证
- **Lombok** - 简化代码
- **Maven** - 项目构建

---

## 开发建议

### 1. IDE配置

**IntelliJ IDEA**:
- 安装Lombok插件
- 启用注解处理 (Settings → Build → Compiler → Annotation Processors)
- 配置代码格式化规则

### 2. 调试技巧

启用SQL日志:
```yaml
logging:
  level:
    org.hibernate.SQL: DEBUG
    org.hibernate.type.descriptor.sql.BasicBinder: TRACE
```

### 3. 性能优化

- 使用 `@Transactional` 注解管理事务
- 避免 N+1 查询问题
- 合理使用懒加载和急加载
- 为常用查询添加索引

---

## 常见问题

### Q1: 启动时数据库连接失败
**A**: 检查MySQL是否运行，数据库是否存在，用户名密码是否正确

### Q2: JWT令牌验证失败
**A**: 确保请求头包含正确格式的Authorization: `Bearer YOUR_TOKEN`

### Q3: 文件上传失败
**A**: 检查文件大小是否超过500MB限制，文件存储目录是否有写权限

### Q4: 邮件发送失败
**A**: 确认邮件服务器配置正确，使用授权码而非邮箱密码

---

## 安全注意事项

1. **生产环境配置**:
   - 修改JWT密钥为强密码
   - 使用环境变量存储敏感信息
   - 配置HTTPS
   - 启用CSRF保护

2. **数据库安全**:
   - 使用独立的数据库用户
   - 限制用户权限
   - 定期备份数据

3. **文件安全**:
   - 验证文件类型
   - 限制文件大小
   - 扫描恶意文件

---

## 获取帮助

- 查看详细文档: `MIGRATION_SUMMARY.md`
- 报告问题: 在项目仓库创建Issue
- 贡献代码: 提交Pull Request

---

## 许可证

本项目采用 MIT 许可证

---

## 更新日志

### v1.0.0 (2025-12-03)
- 初始版本发布
- 完成Python到Spring Boot的迁移
- 实现所有核心功能

---

**祝您使用愉快！** 🎉


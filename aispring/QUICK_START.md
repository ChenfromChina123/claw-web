# 智学云境 (AI LearnSphere) - Spring Boot 快速开始指南

## 🚀 10分钟快速启动

### 步骤1: 克隆项目 (1分钟)

```bash
cd aispring
```

### 步骤2: 配置数据库 (2分钟)

1. 创建MySQL数据库:
```sql
CREATE DATABASE IF NOT EXISTS ipv6_education
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

2. 修改 `src/main/resources/application.yml`:
```yaml
spring:
  datasource:
    url: jdbc:mysql://localhost:3306/ipv6_education
    username: root
    password: your_password  # 修改为你的密码
```

### 步骤3: 构建项目 (3分钟)

```bash
# 使用Maven构建
mvn clean install

# 或使用Maven Wrapper (如果有)
./mvnw clean install
```

### 步骤4: 运行应用 (1分钟)

```bash
# 方式1: 使用Maven
mvn spring-boot:run

# 方式2: 运行JAR
java -jar target/zhixueyunjing-1.0.0.jar

# 方式3: 在IDE中直接运行 AiTutorApplication.java
```

### 步骤5: 验证启动 (1分钟)

访问: http://localhost:5000

看到以下输出说明启动成功:
```
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🤖 智学云境 (AI LearnSphere) - Spring Boot启动成功！   ║
║                                                           ║
║   📚 API文档: http://localhost:5000/swagger-ui.html     ║
║   💻 管理后台: http://localhost:5000/admin               ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
```

### 步骤6: 测试API (2分钟)

使用curl或Postman测试:

```bash
# 发送注册验证码
curl -X POST http://localhost:5000/api/auth/register/send-code \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# 用户注册
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email":"test@example.com",
    "password":"123456",
    "code":"123456"
  }'

# 用户登录
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username":"test@example.com",
    "password":"123456"
  }'
```

## 📦 项目已包含的内容

### ✅ 已完成的配置文件

1. **pom.xml** - Maven依赖配置
   - Spring Boot Web
   - Spring Data JPA
   - Spring Security
   - MySQL Connector
   - JWT支持
   - Lombok
   - 邮件支持

2. **application.yml** - 应用配置
   - 数据库配置
   - JPA配置
   - 文件上传配置
   - JWT配置
   - AI模型配置
   - CORS配置

### ✅ 已创建的实体类

所有实体类已经创建并配置好JPA注解:
- User.java - 用户实体
- Admin.java - 管理员实体
- VerificationCode.java - 验证码实体
- ChatRecord.java - 聊天记录实体
- UserFile.java - 用户文件实体
- UserFolder.java - 用户文件夹实体

### ✅ 已创建的Repository

基本的Repository接口已创建:
- UserRepository
- VerificationCodeRepository

### 📝 需要补充的代码

根据 `IMPLEMENTATION_GUIDE.md` 补充以下内容:

1. **配置类** (config包)
   - SecurityConfig.java ✨重要
   - CorsConfig.java ✨重要
   - JwtConfig.java

2. **安全组件** (security包)
   - JwtAuthenticationFilter.java ✨重要
   - UserDetailsServiceImpl.java ✨重要

3. **工具类** (util包)
   - JwtUtil.java ✨重要
   - EmailUtil.java ✨重要
   - FileUtil.java

4. **Service层** (service包)
   - AuthService.java ✨重要
   - ChatService.java
   - FileService.java
   - LanguageLearningService.java

5. **Controller层** (controller包)
   - AuthController.java ✨重要
   - ChatController.java
   - CloudDiskController.java
   - LanguageLearningController.java

6. **DTO类** (dto包)
   - request包下的请求DTO
   - response包下的响应DTO

7. **异常处理** (exception包)
   - CustomException.java
   - GlobalExceptionHandler.java ✨重要

## 🎯 推荐实现顺序

### 第一优先级 (核心功能)

1. **复制 IMPLEMENTATION_GUIDE.md 中的代码**
   - SecurityConfig.java
   - JwtAuthenticationFilter.java
   - JwtUtil.java
   - GlobalExceptionHandler.java
   - AuthService.java
   - AuthController.java

2. **创建必要的DTO类**
   - LoginRequest
   - RegisterRequest
   - AuthResponse
   - MessageResponse

3. **实现UserDetailsService**
   ```java
   @Service
   @RequiredArgsConstructor
   public class UserDetailsServiceImpl implements UserDetailsService {
       private final UserRepository userRepository;
       
       @Override
       public UserDetails loadUserByUsername(String username) {
           User user = userRepository.findByEmail(username)
               .orElseThrow(() -> new UsernameNotFoundException("用户不存在"));
           
           return org.springframework.security.core.userdetails.User
               .withUsername(user.getEmail())
               .password(user.getPasswordHash())
               .authorities("ROLE_USER")
               .build();
       }
   }
   ```

### 第二优先级 (扩展功能)

4. 实现邮件工具类
5. 实现文件服务
6. 实现聊天服务
7. 实现语言学习服务

### 第三优先级 (优化)

8. 添加单元测试
9. 完善异常处理
10. 添加日志
11. 优化性能

## 🔧 常用Maven命令

```bash
# 编译项目
mvn compile

# 运行测试
mvn test

# 打包（跳过测试）
mvn package -DskipTests

# 清理并重新构建
mvn clean install

# 运行应用
mvn spring-boot:run

# 查看依赖树
mvn dependency:tree

# 更新依赖
mvn versions:display-dependency-updates
```

## 📚 重要文档

| 文档 | 说明 |
|------|------|
| README.md | 项目总览和API映射 |
| IMPLEMENTATION_GUIDE.md | ⭐ 完整代码实现指南 |
| MIGRATION_GUIDE.md | Python到Java迁移对比 |
| QUICK_START.md | 本文档 - 快速开始 |

## 🐛 常见问题

### Q1: Maven依赖下载慢怎么办？
**A**: 配置国内Maven镜像（阿里云）

在 `~/.m2/settings.xml` 添加:
```xml
<mirrors>
  <mirror>
    <id>aliyun</id>
    <mirrorOf>central</mirrorOf>
    <url>https://maven.aliyun.com/repository/public</url>
  </mirror>
</mirrors>
```

### Q2: 数据库连接失败？
**A**: 检查：
1. MySQL服务是否启动
2. 数据库名称是否正确
3. 用户名密码是否正确
4. URL格式是否正确

### Q3: JWT验证失败？
**A**: 确保：
1. JWT secret配置正确
2. Token格式为 "Bearer {token}"
3. Token未过期

### Q4: 文件上传413错误？
**A**: 增加文件大小限制:
```yaml
spring:
  servlet:
    multipart:
      max-file-size: 500MB
      max-request-size: 500MB
```

### Q5: CORS跨域问题？
**A**: 检查CorsConfig配置，确保前端域名在allowed-origins中

## 💡 开发建议

1. **使用IDE**: 推荐IntelliJ IDEA或Eclipse
2. **启用热部署**: spring-boot-devtools已配置
3. **查看日志**: 日志文件在 `logs/application.log`
4. **使用Lombok**: 减少样板代码
5. **遵循命名规范**: 
   - 类名: PascalCase
   - 方法名: camelCase
   - 常量: UPPER_SNAKE_CASE

## 🎉 下一步

完成快速启动后，你可以：

1. ✅ 测试所有API端点
2. 📝 根据IMPLEMENTATION_GUIDE.md补充代码
3. 🧪 编写单元测试
4. 📚 集成Swagger文档
5. 🚀 部署到生产环境

## 📞 需要帮助？

- 查看完整实现: `IMPLEMENTATION_GUIDE.md`
- 理解迁移差异: `MIGRATION_GUIDE.md`
- API接口说明: `README.md`

---

**祝你开发顺利！** 🚀


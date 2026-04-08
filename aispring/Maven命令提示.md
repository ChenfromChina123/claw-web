# Maven 命令使用提示

## ⚠️ 重要提示

**Maven 命令必须在项目根目录（包含 pom.xml 的目录）执行！**

### ❌ 错误示例

```powershell
# 当前目录: aispring\src\main\java\com\aispring
PS> mvn clean compile
# 错误: 找不到 pom.xml
```

### ✅ 正确做法

```powershell
# 方法1: 切换到项目根目录
PS> cd D:\Users\Administrator\AistudyProject\aispring
PS> mvn clean compile

# 方法2: 使用完整路径（PowerShell）
PS> cd D:\Users\Administrator\AistudyProject\aispring; mvn clean compile
```

## 📝 常用 Maven 命令

### 在项目根目录执行

```powershell
# 确保在项目根目录
cd D:\Users\Administrator\AistudyProject\aispring

# 清理并编译
mvn clean compile

# 清理、编译并打包
mvn clean package

# 运行应用
mvn spring-boot:run

# 跳过测试打包
mvn clean package -DskipTests

# 查看依赖树
mvn dependency:tree

# 查看编译错误详情
mvn clean compile -X
```

## 🔍 如何确认当前目录

```powershell
# 查看当前目录
pwd
# 或
Get-Location

# 查看是否有 pom.xml
ls pom.xml
# 或
Test-Path pom.xml
```

## 💡 PowerShell 技巧

PowerShell 不支持 `&&` 语法，但可以：

```powershell
# 方法1: 分号分隔（在同一行）
cd D:\Users\Administrator\AistudyProject\aispring; mvn clean compile

# 方法2: 换行执行（自动在下一行继续）
cd D:\Users\Administrator\AistudyProject\aispring
mvn clean compile
```

## ✅ 已修复的问题

- ✅ JWT工具类已更新为 jjwt 0.12.3 兼容API
- ✅ 编译成功，27个源文件全部通过

## 🚀 下一步

现在可以运行项目了：

```powershell
cd D:\Users\Administrator\AistudyProject\aispring
mvn spring-boot:run
```

---

**提示**: 如果遇到问题，确保：
1. ✅ 在项目根目录（有 pom.xml 的目录）
2. ✅ Java 17+ 已安装
3. ✅ Maven 已配置


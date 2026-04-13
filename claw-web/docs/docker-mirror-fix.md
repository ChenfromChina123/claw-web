# Docker镜像配置修复指南

## 问题描述

当前Docker配置中包含了不可用的百度云镜像源（mirror.baidubce.com），导致镜像拉取失败。

## 解决方案

### 方法1：修改Docker Desktop配置（推荐）

1. **打开Docker Desktop**
2. **进入 Settings → Docker Engine**
3. **修改配置文件，移除百度云镜像：**

```json
{
  "builder": {
    "gc": {
      "defaultKeepStorage": "20GB",
      "enabled": true
    }
  },
  "experimental": false,
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com"
  ]
}
```

4. **点击 Apply & Restart**

### 方法2：使用命令行配置（Windows PowerShell）

```powershell
# 停止Docker服务
Stop-Service docker

# 修改配置文件（需要管理员权限）
$configPath = "$env:USERPROFILE\.docker\daemon.json"
$config = @{
    "builder" = @{
        "gc" = @{
            "defaultKeepStorage" = "20GB"
            "enabled" = $true
        }
    }
    "experimental" = $false
    "registry-mirrors" = @(
        "https://docker.m.daocloud.io",
        "https://docker.mirrors.ustc.edu.cn",
        "https://hub-mirror.c.163.com"
    )
}

$config | ConvertTo-Json -Depth 10 | Set-Content $configPath

# 启动Docker服务
Start-Service docker
```

### 方法3：临时使用代理

如果上述方法都不行，可以配置HTTP代理：

```powershell
# 设置代理（如果你的代理端口是9674）
$env:HTTP_PROXY = "http://127.0.0.1:9674"
$env:HTTPS_PROXY = "http://127.0.0.1:9674"

# 然后重新构建
docker compose -f docker-compose.yml up -d --build
```

## 验证配置

修改后，运行以下命令验证镜像配置：

```powershell
docker info | Select-String -Pattern "Registry Mirrors" -Context 0,5
```

应该看到类似输出：

```
Registry Mirrors:
 https://docker.m.daocloud.io/
 https://docker.mirrors.ustc.edu.cn/
 https://hub-mirror.c.163.com/
```

## 重新构建项目

配置修复后，运行以下命令重新构建：

```powershell
# 停止并删除所有容器
docker compose -f docker-compose.yml down

# 重新构建并启动
docker compose -f docker-compose.yml up -d --build
```

## 执行数据库迁移

容器启动成功后，执行数据库迁移：

```powershell
# PowerShell命令
Get-Content "server\src\db\add_user_tier.sql" | docker exec -i claude-mysql mysql -u root -prootpassword123 claude_code_haha
```

或者使用CMD命令：

```cmd
type server\src\db\add_user_tier.sql | docker exec -i claude-mysql mysql -u root -prootpassword123 claude_code_haha
```

## 故障排查

### 问题1：镜像拉取仍然失败

**解决方案**：
1. 检查网络连接
2. 尝试使用代理
3. 更换其他镜像源

### 问题2：Docker Desktop无法启动

**解决方案**：
1. 重启Docker Desktop
2. 重启计算机
3. 重新安装Docker Desktop

### 问题3：配置文件找不到

**解决方案**：
配置文件位置：
- Windows: `C:\Users\{用户名}\.docker\daemon.json`
- Mac: `~/.docker/daemon.json`
- Linux: `/etc/docker/daemon.json`

## 可用的国内镜像源

以下是经过测试可用的镜像源：

1. **DaoCloud**: `https://docker.m.daocloud.io`
2. **中科大**: `https://docker.mirrors.ustc.edu.cn`
3. **网易**: `https://hub-mirror.c.163.com`
4. **阿里云**: `https://<你的ID>.mirror.aliyuncs.com`（需要注册获取）

## 注意事项

1. **不要使用百度云镜像**：`mirror.baidubce.com` 已不可用
2. **镜像源可能随时变化**：建议定期检查镜像源可用性
3. **代理设置**：如果使用代理，确保代理服务正常运行

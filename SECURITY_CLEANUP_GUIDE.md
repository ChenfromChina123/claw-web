# 安全漏洞清理操作指南

## 🚨 问题概述

GitGuardian 检测到你的 GitHub 仓库 `ChenfromChina123/claw-web` 中存在硬编码密码泄露。

**泄露文件**:
- `.env`
- `.env.example`
- `web/.env.development`
- `web/.env.production`

**泄露的敏感信息**:
- MySQL Root 密码: `clawweb2024`
- MySQL 用户密码: `clawpass2024`
- JWT Secret: `your-super-secret-jwt-key-change-in-production`
- Master Internal Token: `internal-master-worker-token-2024`

---

## ✅ 已完成的修复

1. 创建了 `.gitignore` 文件，防止敏感文件被提交
2. 从 git 追踪中移除了 `.env` 文件
3. 更新了 `.env.example` 使用占位符密码

**这些修复已经提交到本地，但推送到远程仓库后，历史中的密码仍然存在。**

---

## 📋 需要执行的清理步骤

### 步骤 1: 密码轮换（立即执行！）

**⚠️ 这是最重要的一步，必须在清理历史之前完成！**

#### 1.1 修改 MySQL 密码

```bash
# 连接到 MySQL
mysql -h 127.0.0.1 -P 23306 -u root -pclawweb2024

# 在 MySQL 中执行
ALTER USER 'root'@'%' IDENTIFIED BY '新的强密码';
ALTER USER 'clawuser'@'%' IDENTIFIED BY '新的强密码';
FLUSH PRIVILEGES;
```

#### 1.2 更新本地 `.env` 文件

编辑项目根目录的 `.env` 文件，更新为新密码:

```env
MYSQL_ROOT_PASSWORD=你的新密码
MYSQL_PASSWORD=你的新密码
JWT_SECRET=使用 openssl rand -base64 32 生成
MASTER_INTERNAL_TOKEN=使用 openssl rand -hex 32 生成
```

**生成安全的随机密钥**:
```bash
# Windows PowerShell
openssl rand -base64 32
openssl rand -hex 32
```

#### 1.3 重启服务

```bash
docker-compose down
docker-compose up -d
```

---

### 步骤 2: 使用 BFG Repo-Cleaner 清理 Git 历史

#### 2.1 下载 BFG Repo-Cleaner

1. 访问 https://rtyley.github.io/bfg-repo-cleaner/
2. 下载最新版 `bfg.jar` (约 5MB)
3. 保存到项目根目录 `d:\Users\Administrator\AistudyProject\claw-web\`

#### 2.2 创建密码列表文件

创建文件 `passwords-to-remove.txt`，内容如下:

```
clawweb2024
clawpass2024
your-super-secret-jwt-key-change-in-production
internal-master-worker-token-2024
```

#### 2.3 执行清理

在项目根目录打开 PowerShell，执行以下命令:

```powershell
# 1. 克隆一个干净的镜像备份（重要！）
git clone --mirror https://github.com/ChenfromChina123/claw-web.git claw-web-backup.git

# 2. 进入项目目录
cd d:\Users\Administrator\AistudyProject\claw-web

# 3. 使用 BFG 删除包含密码的提交
java -jar bfg.jar --replace-text passwords-to-remove.txt

# 4. 清理 Git 历史
git reflog expire --expire=now --all && git gc --prune=now --aggressive

# 5. 强制推送到 GitHub（这会重写历史！）
git push origin --force --all
git push origin --force --tags
```

**⚠️ 注意事项**:
- 这会重写 git 历史，所有协作者需要重新克隆仓库
- 确保其他协作者已经合并了他们的工作
- 建议在非工作时间执行

---

### 步骤 3: 撤销 GitHub Token（如果有）

如果你的 Anthropic API Token 或其他第三方 Token 也泄露了:

1. 访问对应服务的控制台
2. 撤销/删除旧的 API Key
3. 创建新的 API Key
4. 更新 `.env` 文件

---

### 步骤 4: 通知 GitHub 支持（可选）

如果你使用了 GitHub 的 Secret Scanning 功能:

1. 访问仓库设置: https://github.com/ChenfromChina123/claw-web/settings/security_analysis
2. 确保 "Secret scanning" 已启用
3. 在 "Security" -> "Code scanning alerts" 中关闭相关告警

---

## 🔒 安全建议

### 立即执行
- [x] 从 git 中移除 `.env` 文件（已完成）
- [ ] 创建 `.gitignore`（已完成）
- [ ] 轮换所有密码
- [ ] 清理 git 历史
- [ ] 更新所有使用该密码的服务

### 长期改进
- [ ] 使用密钥管理服务（如 AWS Secrets Manager、HashiCorp Vault）
- [ ] 启用 GitHub Secret Scanning
- [ ] 在 CI/CD 中添加密码扫描步骤
- [ ] 使用 `.env.vault` 或类似工具加密环境变量
- [ ] 定期轮换密码和密钥

---

## 📞 紧急联系

如果发现有未授权访问，请:
1. 立即更改所有密码
2. 检查数据库访问日志
3. 审查服务器日志
4. 考虑暂时下线服务

---

## 参考资源

- [BFG Repo-Cleaner 官方文档](https://rtyley.github.io/bfg-repo-cleaner/)
- [GitHub Secret Scanning](https://docs.github.com/en/code-security/secret-scanning)
- [Git 历史清理最佳实践](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)

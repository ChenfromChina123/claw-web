# SearXNG 搜索服务安全部署配置文档

## 一、当前问题分析

### 1. SSL 证书验证失败原因
- **问题**：CA 服务器无法访问 `http://search.aistudy.icu/.well-known/acme-challenge/`
- **错误代码**：`Timeout during connect (likely firewall problem)`
- **根本原因**：
  - 阿里云安全组未开放 80 端口
  - 或者 Nginx 未正确配置 80 端口监听
  - 或者 iptables 规则阻止了 80 端口访问

### 2. 当前配置状态
| 项目 | 状态 | 说明 |
|------|------|------|
| SearXNG 服务 | ✅ 正常 | 运行在 9080 端口 |
| 本地访问 | ✅ 正常 | `curl http://localhost:9080` 返回 200 |
| Nginx 配置 | ✅ 正常 | `nginx -t` 测试通过 |
| 防火墙服务 | ❌ 未运行 | `FirewallD is not running` |
| iptables 服务 | ✅ 运行 | 已配置防护规则 |
| 80 端口访问 | ❌ 异常 | 外网无法访问 |

---

## 二、解决方案

### 方案 1：阿里云安全组配置（推荐）

#### 1. 开放必要端口
登录阿里云控制台 → 安全组 → 配置规则：

| 端口 | 协议 | 授权对象 | 说明 |
|------|------|----------|------|
| 80 | TCP | 0.0.0.0/0 | HTTP 访问（SSL 证书验证必需） |
| 443 | TCP | 0.0.0.0/0 | HTTPS 访问 |
| 22 | TCP | 你的 IP | SSH 远程连接 |

#### 2. 验证安全组规则
```bash
# 在本地服务器测试 80 端口是否监听
netstat -tuln | grep :80

# 在另一台服务器测试外网访问
telnet 你的服务器 IP 80
```

---

### 方案 2：Nginx 配置优化

#### 1. 创建 SearXNG 站点配置

**宝塔面板操作**：
1. 进入「网站」→「添加站点」
2. 域名：`search.aistudy.icu`
3. 根目录：`/www/wwwroot/search_aistudy_icu`（任意目录）
4. PHP 版本：纯静态
5. 数据库：无需

**修改配置文件**（网站设置 → 配置文件）：

```nginx
server {
    listen 80;
    server_name search.aistudy.icu;
    
    # SSL 证书验证目录（必须允许访问）
    location /.well-known/acme-challenge/ {
        root /www/wwwroot/search_aistudy_icu;
        allow all;
    }
    
    # 代理到 SearXNG
    location / {
        proxy_pass http://127.0.0.1:9080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # 增加超时时间（SearXNG 首次启动较慢）
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        
        # 缓冲配置
        proxy_buffering off;
        proxy_cache off;
    }
    
    # 访问日志
    access_log /www/wwwlogs/search.aistudy.icu_access.log;
    error_log /www/wwwlogs/search.aistudy.icu_error.log;
}
```

#### 2. 重启 Nginx
```bash
# 宝塔面板：软件商店 → Nginx → 重启
# 或命令行
systemctl restart nginx
```

---

### 方案 3：iptables 规则调整

#### 1. 检查当前 80 端口规则
```bash
# 查看 80 端口的 iptables 规则
iptables -L INPUT -n -v --line-numbers | grep 80
```

#### 2. 添加 80 端口允许规则（如果有阻止）
```bash
# 在规则列表开头添加允许 80 端口
iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT

# 保存规则
iptables-save > /etc/sysconfig/iptables
```

#### 3. 验证规则
```bash
# 查看规则是否生效
iptables -L INPUT -n -v --line-numbers | head -20
```

---

### 方案 4：宝塔面板快速配置

#### 1. 使用宝塔「网站」功能
1. 进入宝塔面板 → 「网站」
2. 点击「添加站点」
3. 填写域名：`search.aistudy.icu`
4. 选择「反向代理」
5. 目标 URL：`http://127.0.0.1:9080`
6. 发送域名：`$host`
7. 点击「提交」

#### 2. 申请 SSL 证书
1. 进入网站设置 → 「SSL」
2. 选择「Let's Encrypt」
3. 确认域名：`search.aistudy.icu`
4. 点击「申请」
5. **注意**：申请前确保 80 端口已开放

---

## 三、完整部署流程

### 步骤 1：检查并开放 80 端口
```bash
# 1. 检查本地监听
netstat -tuln | grep :80

# 2. 如果没有监听，说明 Nginx 未启动 80 端口
# 检查 Nginx 配置
nginx -t

# 3. 重启 Nginx
systemctl restart nginx

# 4. 再次检查
netstat -tuln | grep :80
```

### 步骤 2：配置阿里云安全组
1. 登录阿里云控制台
2. 进入「云服务器 ECS」→「实例」
3. 找到你的实例 → 「更多」→「网络和安全组」→「安全组配置」
4. 点击「配置规则」→「入方向」→「手动添加」
5. 添加规则：
   - 端口范围：`80/80`
   - 授权对象：`0.0.0.0/0`
   - 协议：`TCP`
   - 策略：`允许`

### 步骤 3：配置 Nginx 反向代理
```bash
# 创建配置文件
vim /www/server/panel/vhost/nginx/search.aistudy.icu.conf
```

粘贴配置内容（见上方「方案 2」）

```bash
# 测试配置
nginx -t

# 重启 Nginx
systemctl restart nginx
```

### 步骤 4：验证访问
```bash
# 1. 本地测试
curl -I http://localhost:9080

# 2. 通过 Nginx 测试
curl -I http://127.0.0.1

# 3. 通过域名测试（需要 DNS 解析）
curl -I http://search.aistudy.icu

# 4. 外网测试（在另一台服务器）
curl -I http://你的服务器公网IP
```

### 步骤 5：申请 SSL 证书
1. 宝塔面板 → 「网站」
2. 选择 `search.aistudy.icu` → 「设置」→ 「SSL」
3. 选择「Let's Encrypt」
4. 点击「申请」
5. 成功后开启「强制 HTTPS」

---

## 四、安全防护配置优化

### 1.  iptables 规则优化（适配 SearXNG）

```bash
# 1. 允许 80 端口（HTTP）
iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT

# 2. 允许 443 端口（HTTPS）
iptables -I INPUT 2 -p tcp --dport 443 -j ACCEPT

# 3. 允许 9080 端口本地访问（SearXNG）
iptables -I INPUT 3 -p tcp -s 127.0.0.1 --dport 9080 -j ACCEPT

# 4. 阻止外网直接访问 9080
iptables -I INPUT 4 -p tcp --dport 9080 -j DROP

# 5. 保存规则
iptables-save > /etc/sysconfig/iptables
```

### 2. 验证规则
```bash
# 查看规则
iptables -L INPUT -n -v --line-numbers | head -15

# 测试本地访问 9080
curl http://127.0.0.1:9080

# 测试外网访问 9080（应该被阻止）
# 在另一台服务器执行
telnet 你的服务器 IP 9080
```

### 3. 宝塔面板防火墙配置
如果使用宝塔「系统防火墙」插件：

1. 进入「安全」→「系统防火墙」
2. 添加规则：
   - 端口：`80`
   - 备注：`HTTP 访问`
   - 操作：`放行`
3. 添加规则：
   - 端口：`443`
   - 备注：`HTTPS 访问`
   - 操作：`放行`
4. 删除或禁用 9080 端口的放行规则

---

## 五、故障排查流程

### 问题 1：SSL 证书验证失败
```bash
# 1. 检查 80 端口是否监听
netstat -tuln | grep :80

# 2. 检查 Nginx 配置
nginx -t

# 3. 检查安全组（阿里云控制台）
# 确认 80 端口已开放

# 4. 检查 iptables 规则
iptables -L INPUT -n -v | grep 80

# 5. 本地测试访问
curl http://localhost

# 6. 查看 Nginx 错误日志
tail -f /www/wwwlogs/search.aistudy.icu_error.log
```

### 问题 2：Nginx 无法访问
```bash
# 1. 检查 Nginx 状态
systemctl status nginx

# 2. 重启 Nginx
systemctl restart nginx

# 3. 查看 Nginx 日志
tail -50 /www/wwwlogs/nginx_error.log
```

### 问题 3：SearXNG 无法访问
```bash
# 1. 检查容器状态
docker ps | grep searxng

# 2. 查看容器日志
docker logs searxng

# 3. 测试本地访问
curl http://localhost:9080

# 4. 重启容器
docker-compose restart
```

---

## 六、一键部署脚本

创建部署脚本 `deploy_searxng.sh`：

```bash
#!/bin/bash

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 1. 检查 Docker
if ! docker ps &> /dev/null; then
    log_error "Docker 未运行"
    exit 1
fi

# 2. 启动 SearXNG
log_info "启动 SearXNG..."
./start-search-service.sh

# 3. 配置 iptables
log_info "配置 iptables 规则..."
iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT
iptables -I INPUT 2 -p tcp --dport 443 -j ACCEPT
iptables -I INPUT 3 -p tcp -s 127.0.0.1 --dport 9080 -j ACCEPT
iptables-save > /etc/sysconfig/iptables

# 4. 验证
sleep 5
if curl -s http://localhost:9080 > /dev/null; then
    log_info "SearXNG 启动成功"
else
    log_error "SearXNG 启动失败"
    exit 1
fi

echo ""
log_info "=========================================="
log_info "部署完成！"
log_info "SearXNG 地址：http://localhost:9080"
log_info "Nginx 代理：http://search.aistudy.icu"
log_info "=========================================="
```

使用：
```bash
chmod +x deploy_searxng.sh
./deploy_searxng.sh
```

---

## 七、配置检查清单

部署完成后，请逐项检查：

- [ ] 阿里云安全组已开放 80、443 端口
- [ ] iptables 规则已添加 80、443 端口放行
- [ ] Nginx 配置已添加反向代理
- [ ] SearXNG 容器正常运行
- [ ] 本地访问 `curl http://localhost:9080` 返回 200
- [ ] 通过域名访问 `curl http://search.aistudy.icu` 正常
- [ ] SSL 证书申请成功
- [ ] 9080 端口外网无法直接访问

---

## 八、常用命令速查

```bash
# 启动 SearXNG
./start-search-service.sh

# 停止 SearXNG
docker-compose down

# 查看 SearXNG 日志
docker logs -f searxng

# 重启 Nginx
systemctl restart nginx

# 查看 iptables 规则
iptables -L INPUT -n -v --line-numbers

# 保存 iptables 规则
iptables-save > /etc/sysconfig/iptables

# 查看当前连接数
netstat -ntu | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -nr | head -20

# 查看 Nginx 日志
tail -f /www/wwwlogs/search.aistudy.icu_error.log
```

---

## 九、后续优化建议

1. **启用 Redis 缓存**：提高 SearXNG 搜索速度
2. **配置 CDN**：加速静态资源访问
3. **定期备份**：备份 SearXNG 配置和 iptables 规则
4. **监控告警**：配置服务器监控，及时发现攻击
5. **日志分析**：定期分析 Nginx 和 iptables 日志，发现潜在威胁

---

**文档版本**：v1.0  
**更新时间**：2026-03-22  
**适用环境**：阿里云 CentOS/Ubuntu + 宝塔面板 + Docker

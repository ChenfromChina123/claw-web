# SearXNG API Key 安全配置指南（OCP 原则）

## ⚠️ 重要提示

**脚本不会破坏现有配置！**

- ✅ **自动备份**：运行脚本前会自动备份原配置
- ✅ **智能检测**：如果已有 API Key 验证，会跳过不重复添加
- ✅ **追加方式**：在现有配置基础上添加，不是覆盖
- ✅ **可回滚**：如有问题可立即恢复到备份版本

---

## 🎯 配置方案对比

### 方案 A：一键脚本（推荐）

**优点**：
- ✅ 自动化程度高
- ✅ 自动备份配置
- ✅ 智能检测，不重复添加
- ✅ 生成随机强密钥

**缺点**：
- ⚠️ 需要服务器 root 权限
- ⚠️ 依赖 awk 命令

**使用**：
```bash
chmod +x setup-searxng-apikey.sh
sudo ./setup-searxng-apikey.sh
```

---

### 方案 B：手动配置（完全控制）

**优点**：
- ✅ 完全掌控每个步骤
- ✅ 适合复杂环境
- ✅ 可自定义配置

**缺点**：
- ⚠️ 步骤较多
- ⚠️ 需要手动操作

---

## 📝 手动配置步骤

### 步骤 1：创建 Lua 验证脚本

```bash
# 创建目录
sudo mkdir -p /etc/nginx/lua

# 创建 API Keys 配置文件
sudo tee /etc/nginx/lua/api_keys.conf > /dev/null << 'EOF'
-- API Keys 配置文件
-- 可以添加多个有效的 API Key

local valid_api_keys = {
    "sk-aispring-2026-your-secure-key-here",  -- 主密钥
    -- "your-second-api-key-here",            -- 备用密钥（可选）
    -- 可以添加更多...
}

return valid_api_keys
EOF

# 设置权限（仅 root 可读）
sudo chmod 600 /etc/nginx/lua/api_keys.conf
```

### 步骤 2：创建验证脚本

```bash
sudo tee /etc/nginx/lua/api_key_check.lua > /dev/null << 'EOF'
-- SearXNG API Key 验证 Lua 脚本
local cjson = require "cjson"

-- 加载 API Keys 配置
local valid_api_keys = require "api_keys"

-- 从请求参数获取 API Key
local api_key = ngx.var.arg_apiKey

-- 如果参数中没有，尝试从请求头获取
if not api_key or api_key == "" then
    api_key = ngx.var.http_x_api_key
end

-- 验证 API Key
local is_valid = false
for _, key in ipairs(valid_api_keys) do
    if api_key == key then
        is_valid = true
        break
    end
end

-- 如果验证失败，返回 401
if not is_valid then
    ngx.status = 401
    ngx.header.content_type = "application/json"
    
    local response = {
        code = 401,
        message = "无效的 API Key",
        data = nil
    }
    
    ngx.say(cjson.encode(response))
    return ngx.exit(401)
end

-- 验证通过，继续处理
ngx.log(ngx.INFO, "API Key validated successfully")
EOF

# 设置权限
sudo chmod 644 /etc/nginx/lua/api_key_check.lua
```

### 步骤 3：修改 Nginx 配置（OCP 方式）

#### 3.1 备份现有配置

```bash
# 备份配置文件
sudo cp /www/server/panel/vhost/nginx/search.aistudy.icu.conf \
        /www/server/panel/vhost/nginx/search.aistudy.icu.conf.bak.$(date +%Y%m%d%H%M%S)

echo "配置已备份"
```

#### 3.2 编辑 Nginx 配置

```bash
# 使用编辑器打开
sudo vim /www/server/panel/vhost/nginx/search.aistudy.icu.conf
```

**在 `location /search {` 块中添加**：

```nginx
location /search {
    # 添加这一行（在其他配置之前）
    access_by_lua_file /etc/nginx/lua/api_key_check.lua;
    
    # 原有的 proxy_pass 等配置保持不变
    proxy_pass http://127.0.0.1:9080/search;
    # ... 其他配置
}
```

**完整示例**：

```nginx
server {
    listen 80;
    server_name search.aistudy.icu;
    
    # SSL 证书验证目录（不需要 API Key）
    location /.well-known/acme-challenge/ {
        root /www/wwwroot/search_aistudy_icu;
        allow all;
    }
    
    # 搜索接口（需要 API Key 验证）
    location /search {
        # ← 添加这一行
        access_by_lua_file /etc/nginx/lua/api_key_check.lua;
        
        proxy_pass http://127.0.0.1:9080/search;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        
        proxy_buffering off;
        proxy_cache off;
    }
    
    # 其他路径（不需要 API Key）
    location / {
        proxy_pass http://127.0.0.1:9080/;
        # ... 其他配置
    }
}
```

### 步骤 4：测试并重启 Nginx

```bash
# 测试配置
sudo nginx -t

# 如果测试通过，重启 Nginx
sudo systemctl restart nginx

# 或者使用宝塔命令
/etc/init.d/nginx restart
```

### 步骤 5：验证配置

```bash
# 测试带正确 API Key
curl "http://localhost/search?q=test&apiKey=sk-aispring-2026-your-secure-key-here"

# 测试带错误 API Key（应返回 401）
curl "http://localhost/search?q=test&apiKey=wrong-key"

# 测试不带 API Key（应返回 401）
curl "http://localhost/search?q=test"
```

---

## 🔍 验证脚本的 OCP 特性

### 脚本如何保证不破坏现有配置？

1. **自动备份**
   ```bash
   cp search.aistudy.icu.conf search.aistudy.icu.conf.bak.20260322123456
   ```

2. **智能检测**
   ```bash
   if ! grep -q "access_by_lua_file" search.aistudy.icu.conf; then
       # 只有不存在时才添加
   else
       # 已存在，跳过
   fi
   ```

3. **精确插入**
   - 使用 awk 定位 `location /search {`
   - 只在该块内添加一行
   - 不影响其他 location 块

4. **可回滚**
   ```bash
   # 如果出现问题，恢复备份
   cp search.aistudy.icu.conf.bak.20260322123456 search.aistudy.icu.conf
   nginx -t && systemctl restart nginx
   ```

---

## 🎯 不同场景的配置方案

### 场景 1：全新部署

**推荐**：使用一键脚本
```bash
sudo ./setup-searxng-apikey.sh
```

### 场景 2：已有配置，添加 API Key

**推荐**：手动配置或脚本（都会自动检测）
```bash
# 脚本会自动检测并只添加缺失的部分
sudo ./setup-searxng-apikey.sh
```

### 场景 3：复杂配置（多个 location）

**推荐**：手动配置，精确控制

编辑 Nginx 配置，只在需要的 location 添加：
```nginx
# 只对 /search 添加验证
location /search {
    access_by_lua_file /etc/nginx/lua/api_key_check.lua;
    # ...
}

# 其他 location 不受影响
location /static {
    # 没有 API Key 验证
    # ...
}
```

---

## ⚠️ 注意事项

### 1. 权限问题

```bash
# Lua 脚本需要 Nginx 用户可读
sudo chmod 644 /etc/nginx/lua/api_key_check.lua

# API Key 配置文件需要保护
sudo chmod 600 /etc/nginx/lua/api_keys.conf
```

### 2. Nginx Lua 模块

检查是否已安装：
```bash
nginx -V 2>&1 | grep -o lua
```

如未安装，需要：
- 使用 OpenResty
- 或安装 `libnginx-mod-http-lua`

### 3. 配置文件语法

确保 Nginx 配置语法正确：
```bash
# 测试配置
sudo nginx -t
```

### 4. 日志查看

```bash
# 查看 API Key 验证日志
sudo tail -f /www/wwwlogs/search.aistudy.icu_error.log | grep "API Key"

# 查看 Nginx 错误日志
sudo tail -f /var/log/nginx/error.log
```

---

## 🔄 回滚方案

### 如果配置后出现问题

**步骤 1：恢复备份**
```bash
# 找到最近的备份
ls -lt /www/server/panel/vhost/nginx/search.aistudy.icu.conf.bak.* | head -1

# 恢复配置
sudo cp /www/server/panel/vhost/nginx/search.aistudy.icu.conf.bak.20260322123456 \
        /www/server/panel/vhost/nginx/search.aistudy.icu.conf
```

**步骤 2：测试并重启**
```bash
sudo nginx -t && sudo systemctl restart nginx
```

**步骤 3：验证服务**
```bash
curl "http://localhost/search?q=test"
```

---

## 📊 配置检查清单

配置完成后，请逐项检查：

- [ ] Lua 脚本已创建：`/etc/nginx/lua/api_key_check.lua`
- [ ] API Keys 配置已创建：`/etc/nginx/lua/api_keys.conf`
- [ ] Nginx 配置已修改（添加了 `access_by_lua_file`）
- [ ] Nginx 配置测试通过：`nginx -t`
- [ ] Nginx 已重启
- [ ] 带正确 API Key 可以访问
- [ ] 带错误 API Key 返回 401
- [ ] 不带 API Key 返回 401
- [ ] 其他 location 不受影响

---

## 📚 相关文档

- [API Key 配置与使用指南](./API-KEY-GUIDE.md)
- [搜索服务部署总结](./SEARCH-SERVICE-SETUP.md)
- [SearXNG 部署配置文档](./DEPLOYMENT-GUIDE.md)

---

**文档版本**：v1.0  
**更新时间**：2026-03-22  
**适用环境**：宝塔面板 + Nginx + Lua

# 搜索服务部署完成总结

## ✅ 已完成的功能

### 1. 远程 SearXNG 服务集成
- **服务地址**：`https://search.aistudy.icu/search`
- **配置位置**：`SearchServiceImpl.java` 第 41 行
- **超时时间**：30 秒
- **返回结果数**：最多 5 条

### 2. API Key 认证模块（两层）

#### 第一层：Nginx 层（SearXNG 访问验证）
- **文件**：`searxng-nginx-full.conf`、`searxng-lua-apikey.lua`
- **方式**：通过 Nginx + Lua 脚本验证
- **支持**：`?apiKey=xxx` 或 `X-API-Key: xxx`

#### 第二层：后端层（搜索接口验证）
- **配置类**：`ApiKeyConfig.java`
- **控制器**：`SearchController.java`（已更新）
- **配置文件**：`application.yml`

### 3. 支持的认证方式
- **请求参数**：`?apiKey=YOUR_API_KEY`
- **请求头**：`X-API-Key: YOUR_API_KEY`

---

## 📋 部署清单

### 服务器端配置

#### 1. 安装 Nginx Lua 模块（如未安装）

```bash
# 检查是否已安装
nginx -V 2>&1 | grep -o lua

# 如未安装，需要安装 OpenResty 或 ngx_http_lua_module
```

#### 2. 配置 API Key（一键脚本）

```bash
# 上传并运行配置脚本
chmod +x setup-searxng-apikey.sh
sudo ./setup-searxng-apikey.sh
```

脚本会自动：
- ✅ 生成随机 API Key
- ✅ 配置 Nginx Lua 验证
- ✅ 重启 Nginx 服务
- ✅ 保存 API Key 到文件

#### 3. 手动配置（如果一键脚本失败）

**步骤 1：创建 Lua 验证脚本**
```bash
# 创建目录
mkdir -p /etc/nginx/lua

# 创建 API Keys 配置文件
cat > /etc/nginx/lua/api_keys.conf << EOF
local valid_api_keys = {
    "sk-aispring-2026-your-key-here",
}
return valid_api_keys
EOF

# 创建验证脚本
cat > /etc/nginx/lua/api_key_check.lua << 'EOF'
local cjson = require "cjson"
local valid_api_keys = require "api_keys"

local api_key = ngx.var.arg_apiKey
if not api_key or api_key == "" then
    api_key = ngx.var.http_x_api_key
end

local is_valid = false
for _, key in ipairs(valid_api_keys) do
    if api_key == key then
        is_valid = true
        break
    end
end

if not is_valid then
    ngx.status = 401
    ngx.header.content_type = "application/json"
    ngx.say(cjson.encode({code=401, message="无效的 API Key"}))
    return ngx.exit(401)
end
EOF
```

**步骤 2：配置 Nginx**
```nginx
# 在 server 块中添加
location /search {
    access_by_lua_file /etc/nginx/lua/api_key_check.lua;
    proxy_pass http://127.0.0.1:9080/search;
    # ... 其他 proxy 配置
}
```

**步骤 3：重启 Nginx**
```bash
nginx -t && systemctl restart nginx
```

#### 4. 验证配置

```bash
# 测试带正确 API Key
curl "http://localhost/search?q=test&apiKey=sk-aispring-2026-your-key-here"

# 测试带错误 API Key
curl "http://localhost/search?q=test&apiKey=wrong-key"

# 测试不带 API Key
curl "http://localhost/search?q=test"
```

### 客户端调用配置

#### 前端调用示例

**JavaScript (axios)**
```javascript
const API_KEY = 'sk-aispring-2026-your-key-here';

const response = await axios.get('/api/search', {
  params: {
    q: '人工智能',
    apiKey: API_KEY
  }
});
```

---

## 🔐 安全架构

```
用户请求
    ↓
┌─────────────────────────────────────────┐
│  1. Nginx 层（SearXNG 访问验证）       │
│     - 验证 API Key                      │
│     - 过滤无效请求                      │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│  2. SearXNG 服务（搜索功能）            │
│     - 处理搜索请求                      │
│     - 返回搜索结果                      │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│  3. 后端服务（应用层验证）              │
│     - JWT 认证                          │
│     - API Key 验证（可选）              │
└─────────────────────────────────────────┘
    ↓
用户收到响应
```

---

## 📚 相关文件

| 文件 | 说明 |
|------|------|
| `searxng-nginx-full.conf` | Nginx 完整配置（含 API Key 验证） |
| `searxng-lua-apikey.lua` | Lua 验证脚本（独立版） |
| `searxng-nginx-apikey.conf` | Nginx API Key 配置片段 |
| `setup-searxng-apikey.sh` | 一键配置脚本 |
| `API-KEY-GUIDE.md` | API Key 使用指南 |
| `SEARCH-SERVICE-SETUP.md` | 完整部署文档 |

---

## 🎯 使用示例

### 调用 SearXNG API（需要 Key）

```bash
# 方式 1：参数传递
curl "https://search.aistudy.icu/search?q=人工智能&apiKey=YOUR_API_KEY"

# 方式 2：请求头
curl -H "X-API-Key: YOUR_API_KEY" "https://search.aistudy.icu/search?q=人工智能"
```

### 调用后端 API（需要 JWT + 可选 Key）

```bash
# 方式 1：参数传递
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     "http://localhost:5000/api/search?q=人工智能&apiKey=YOUR_SEARCH_KEY"

# 方式 2：请求头
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -H "X-API-Key: YOUR_SEARCH_KEY" \
     "http://localhost:5000/api/search?q=人工智能"
```

---

## ⚠️ 注意事项

1. **API Key 保密**：不要将 API Key 提交到 Git
2. **定期更换**：建议每 3 个月更换一次
3. **监控日志**：定期查看访问日志，发现异常
4. **HTTPS 建议**：生产环境务必使用 HTTPS

---

## 🔧 故障排查

### 问题：返回 401 无效 API Key

1. 检查 API Key 是否正确
2. 检查 Nginx Lua 脚本是否生效
3. 查看 Nginx 错误日志

```bash
# 查看 API Key
cat /root/searxng_api_key.txt

# 查看 Nginx 错误日志
tail -f /www/wwwlogs/search.aistudy.icu_error.log

# 测试本地 SearXNG
curl "http://localhost:9080/search?q=test"
```

---

**部署版本**：v2.0  
**更新时间**：2026-03-22  
**服务地址**：https://search.aistudy.icu  
**后端端口**：5000

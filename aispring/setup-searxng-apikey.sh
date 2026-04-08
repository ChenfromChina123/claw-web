#!/bin/bash
#
# SearXNG API Key 配置脚本
# 功能：在服务器上配置 Nginx + Lua API Key 验证
#

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查是否以 root 运行
if [ "$EUID" -ne 0 ]; then 
    log_error "请使用 sudo 运行此脚本"
    exit 1
fi

log_info "=========================================="
log_info "  SearXNG API Key 配置工具"
log_info "=========================================="
echo ""

# 1. 生成随机 API Key
log_info "正在生成随机 API Key..."
API_KEY="sk-aispring-2026-$(openssl rand -hex 16)"
log_success "API Key 已生成：$API_KEY"
echo ""

# 2. 保存 API Key 到文件
log_info "保存 API Key 到配置文件..."
cat > /etc/nginx/lua/api_keys.conf << EOF
-- API Keys 配置文件
-- 可以添加多个有效的 API Key

local valid_api_keys = {
    "$API_KEY",  -- 主密钥
    -- "your-second-api-key-here",  -- 备用密钥（可选）
    -- 可以添加更多...
}

return valid_api_keys
EOF

log_success "API Key 配置文件已保存：/etc/nginx/lua/api_keys.conf"
echo ""

# 3. 更新 Lua 脚本
log_info "更新 Lua 验证脚本..."
cat > /etc/nginx/lua/api_key_check.lua << 'EOF'
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

log_success "Lua 验证脚本已更新"
echo ""

# 4. 配置 Nginx（OCP 原则：不修改已有配置，追加 API Key 验证）
log_info "配置 Nginx..."

# 检查是否已有 SearXNG 配置
if [ -f "/www/server/panel/vhost/nginx/search.aistudy.icu.conf" ]; then
    log_warning "检测到已有的 Nginx 配置"
    log_info "正在备份原配置..."
    cp /www/server/panel/vhost/nginx/search.aistudy.icu.conf \
       /www/server/panel/vhost/nginx/search.aistudy.icu.conf.bak.$(date +%Y%m%d%H%M%S)
    log_success "原配置已备份"
    
    # 使用 sed 在 /search 的 location 块中添加 API Key 验证（如果不存在）
    if ! grep -q "access_by_lua_file" /www/server/panel/vhost/nginx/search.aistudy.icu.conf; then
        log_info "正在添加 API Key 验证到 /search location..."
        
        # 创建临时文件
        TEMP_FILE=$(mktemp)
        
        # 使用 awk 在 location /search 块中添加 API Key 验证
        awk '
        /^    location \/search \{/ {
            print $0
            getline
            print $0  # 打印下一行（通常是 proxy_pass 之前的行）
            print "        # API Key 验证"
            print "        access_by_lua_file /etc/nginx/lua/api_key_check.lua;"
            next
        }
        { print }
        ' /www/server/panel/vhost/nginx/search.aistudy.icu.conf > "$TEMP_FILE"
        
        # 替换原文件
        mv "$TEMP_FILE" /www/server/panel/vhost/nginx/search.aistudy.icu.conf
        
        log_success "API Key 验证已添加到 /search location"
    else
        log_info "API Key 验证已存在，跳过"
    fi
else
    # 如果没有配置，创建新的
    log_info "创建新的 Nginx 配置..."
    cat > /www/server/panel/vhost/nginx/search.aistudy.icu.conf << 'NGINX_EOF'
server {
    listen 80;
    server_name search.aistudy.icu;
    
    charset utf-8;
    
    access_log /www/wwwlogs/search.aistudy.icu_access.log;
    error_log /www/wwwlogs/search.aistudy.icu_error.log;
    
    # SSL 证书验证目录（不需要 API Key）
    location /.well-known/acme-challenge/ {
        root /www/wwwroot/search_aistudy_icu;
        allow all;
    }
    
    # 搜索接口（需要 API Key 验证）
    location /search {
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
}
NGINX_EOF

    log_success "Nginx 配置已创建"
fi
echo ""

# 5. 测试 Nginx 配置
log_info "测试 Nginx 配置..."
if nginx -t; then
    log_success "Nginx 配置测试通过"
else
    log_error "Nginx 配置测试失败"
    exit 1
fi

# 6. 重启 Nginx
log_info "重启 Nginx 使配置生效..."
if command -v systemctl &> /dev/null; then
    systemctl restart nginx
else
    /etc/init.d/nginx restart
fi

if [ $? -eq 0 ]; then
    log_success "Nginx 已重启"
else
    log_error "Nginx 重启失败"
    exit 1
fi

echo ""
log_success "=========================================="
log_success "  API Key 配置完成！"
log_success "=========================================="
echo ""
log_info "API Key: $API_KEY"
echo ""
log_info "使用方法："
log_info "  1. 请求参数方式："
log_info "     curl \"https://search.aistudy.icu/search?q=test&apiKey=$API_KEY\""
echo ""
log_info "  2. 请求头方式："
log_info "     curl -H \"X-API-Key: $API_KEY\" \"https://search.aistudy.icu/search?q=test\""
echo ""
log_info "查看 API Key："
log_info "  cat /etc/nginx/lua/api_keys.conf"
echo ""
log_info "查看验证日志："
log_info "  tail -f /www/wwwlogs/search.aistudy.icu_error.log | grep \"API Key\""
echo ""

# 7. 保存 API Key 到文件（方便查看）
echo "$API_KEY" > /root/searxng_api_key.txt
chmod 600 /root/searxng_api_key.txt
log_info "API Key 已保存到：/root/searxng_api_key.txt"

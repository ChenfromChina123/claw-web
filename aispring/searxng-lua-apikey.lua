-- /etc/nginx/lua/api_key_check.lua
-- SearXNG API Key 验证 Lua 脚本

local cjson = require "cjson"

-- API Keys 配置（可以添加多个）
-- 生产环境建议使用环境变量或 Redis
local valid_api_keys = {
    "sk-aispring-2026-secure-key-xyz789",  -- 主密钥
    "your-second-api-key-here",            -- 备用密钥
    -- 可以添加更多...
}

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
-- 可以在这里添加日志记录
-- ngx.log(ngx.INFO, "API Key validated: ", api_key)

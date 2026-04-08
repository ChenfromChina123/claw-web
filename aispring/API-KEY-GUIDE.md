# API Key 配置与使用指南

## 一、功能概述

已为搜索服务添加 API Key 认证模块，支持两种方式的密钥验证：
- **请求参数方式**：`?apiKey=YOUR_API_KEY`
- **请求头方式**：`X-API-Key: YOUR_API_KEY`

## 二、配置 API Key

### 方法 1：application.yml 配置（推荐）

编辑 `application.yml` 文件，添加以下配置：

```yaml
search:
  api:
    key: "your-secret-api-key-here"
```

**示例**：
```yaml
# 生产环境配置
search:
  api:
    key: "sk-aispring-2026-secure-key-xyz789"
```

### 方法 2：环境变量配置

```bash
export SEARCH_API_KEY="your-secret-api-key-here"
```

### 方法 3：启动参数配置

```bash
java -jar target/zhixueyunjing-1.0.0.jar --search.api.key="your-secret-api-key-here"
```

## 三、API 使用方式

### 1. 不启用 API Key（默认）

如果未配置 `search.api.key`，则不需要提供密钥即可访问。

### 2. 启用 API Key 后

#### 方式 A：通过请求参数传递

```bash
curl "http://localhost:5000/api/search?q=人工智能&apiKey=your-secret-api-key-here"
```

#### 方式 B：通过请求头传递

```bash
curl -H "X-API-Key: your-secret-api-key-here" "http://localhost:5000/api/search?q=人工智能"
```

### 3. 前端调用示例

#### JavaScript (axios)

```javascript
// 方式 1：请求参数
axios.get('/api/search', {
  params: {
    q: '人工智能',
    apiKey: 'your-secret-api-key-here'
  }
});

// 方式 2：请求头
axios.get('/api/search', {
  params: {
    q: '人工智能'
  },
  headers: {
    'X-API-Key': 'your-secret-api-key-here'
  }
});
```

#### Python (requests)

```python
import requests

# 方式 1：请求参数
response = requests.get(
    'http://localhost:5000/api/search',
    params={'q': '人工智能', 'apiKey': 'your-secret-api-key-here'}
)

# 方式 2：请求头
response = requests.get(
    'http://localhost:5000/api/search',
    params={'q': '人工智能'},
    headers={'X-API-Key': 'your-secret-api-key-here'}
)
```

## 四、错误响应

### 无效的 API Key

```json
{
  "code": 401,
  "message": "无效的 API Key",
  "data": null
}
```

### 状态码说明

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 401 | 未提供 API Key 或 API Key 无效 |
| 500 | 服务器内部错误 |

## 五、安全建议

### 1. API Key 生成规则

推荐使用以下格式生成强密钥：

```
sk-zhixueyunjing-{年份}-{随机字符串}
```

**示例**：
```bash
# 使用 OpenSSL 生成随机密钥
openssl rand -hex 32

# 输出示例：
# a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
```

**示例**：
```bash
sk-zhixueyunjing-2026-$(openssl rand -hex 16)
```

### 2. 密钥存储

- ✅ **推荐**：使用环境变量或密钥管理服务（如阿里云 KMS）
- ❌ **不推荐**：直接写在代码或配置文件中提交到 Git

### 3. 密钥轮换

建议定期更换 API Key（如每 3 个月），并在更换后更新所有调用方。

### 4. 访问控制

- 仅允许信任的 IP 地址访问搜索接口
- 配置防火墙规则限制访问
- 使用 HTTPS 加密传输

## 六、服务器配置示例

### 阿里云服务器配置

编辑 `/www/project/new_pro/ai-tutor-system/aispring/application.yml`：

```yaml
search:
  api:
    key: "${SEARCH_API_KEY:sk-zhixueyunjing-2026-secure-key-xyz789}"
```

设置环境变量：

```bash
# 添加到 /etc/profile
export SEARCH_API_KEY="sk-aispring-2026-$(openssl rand -hex 16)"

# 使配置生效
source /etc/profile
```

### Docker 环境配置

```yaml
# docker-compose.yml
services:
  zhixueyunjing:
    image: zhixueyunjing:latest
    environment:
      - SEARCH_API_KEY=your-secret-api-key-here
```

## 七、测试验证

### 1. 测试 API Key 验证

```bash
# 正确的 API Key
curl "http://localhost:5000/api/search?q=test&apiKey=your-secret-api-key-here"

# 错误的 API Key（应返回 401）
curl "http://localhost:5000/api/search?q=test&apiKey=wrong-key"

# 未提供 API Key（如果已启用验证，应返回 401）
curl "http://localhost:5000/api/search?q=test"
```

### 2. 查看访问日志

```bash
# 查看 API Key 验证失败的日志
tail -f logs/application.log | grep "Invalid API Key"
```

## 八、故障排查

### 问题 1：API Key 验证不生效

**检查**：
```bash
# 查看配置是否加载
grep "search.api.key" logs/application.log
```

**解决**：
- 确认 application.yml 配置正确
- 重启应用使配置生效

### 问题 2：忘记 API Key

**解决**：
1. 查看 application.yml 配置文件
2. 或查看环境变量：`echo $SEARCH_API_KEY`
3. 生成新密钥并更新配置

### 问题 3：前端调用返回 401

**检查**：
- 确认 API Key 正确
- 检查请求参数或请求头名称
- 查看浏览器开发者工具的网络请求

## 九、最佳实践

1. **生产环境**：必须启用 API Key 验证
2. **开发环境**：可不启用以方便调试
3. **密钥管理**：使用密钥管理服务，不要硬编码
4. **监控告警**：配置 API Key 验证失败的告警
5. **日志审计**：定期审查搜索接口的访问日志

## 十、快速配置脚本

创建 `setup_api_key.sh`：

```bash
#!/bin/bash

# 生成随机 API Key
API_KEY="sk-zhixueyunjing-2026-$(openssl rand -hex 16)"

# 添加到环境变量
echo "export SEARCH_API_KEY=\"$API_KEY\"" >> ~/.bashrc
source ~/.bashrc

echo "API Key 已生成并配置："
echo $API_KEY
echo ""
echo "请重启应用使配置生效"
```

使用：
```bash
chmod +x setup_api_key.sh
./setup_api_key.sh
```

---

**文档版本**：v1.0  
**更新时间**：2026-03-22  
**适用版本**：智学云境 (AI LearnSphere) 1.0.0+

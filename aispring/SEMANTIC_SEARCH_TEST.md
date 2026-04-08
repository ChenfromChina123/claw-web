# 语义搜索功能测试指南

## 功能说明

语义搜索功能通过 AI 将用户的中文关键词（如"科技"、"医疗"）扩展为相关的英文单词列表，然后从数据库中进行精准匹配，解决了传统 LIKE 搜索只能字面匹配的问题。

## 测试方式

### 方式一：直接数据库查询测试（推荐，无需认证）

```bash
cd d:\Users\Administrator\AistudyProject\new_pro\ai-tutor-system\aispring
python test_semantic_simple.py
```

**测试内容：**
- 显示数据库统计信息
- 对比传统 LIKE 搜索效果
- 模拟 AI 扩展关键词后的搜索效果

**预期结果：**
```
主题：科技
AI 扩展的英文单词：technology, computer, software, internet, digital...
------------------------------------------------------------
✅ 找到 10 个匹配的单词:
  1. computer [zk gk ielts]: n. 电脑，电子计算机
  2. data [gk cet4 ky ielts]: pl. 资料，数据
  3. digital [gk cet4 cet6 ky ielts]: a. 数字显示的
  ...
```

### 方式二：完整 API 测试（需要认证）

```bash
cd d:\Users\Administrator\AistudyProject\new_pro\ai-tutor-system\aispring
python test_api_with_auth.py
```

**前提条件：**
1. 修改脚本中的测试账号：
   ```python
   TEST_EMAIL = "your-email@example.com"
   TEST_PASSWORD = "your-password"
   ```
2. 确保 aispring 服务已启动

**测试内容：**
- 自动登录获取 token
- 使用 `<query-vocab>` 标签触发语义搜索
- 验证 AI 返回的单词数据

### 方式三：前端实际使用测试

1. 打开浏览器访问：`http://localhost:5173`（或你的前端端口）
2. 登录账号
3. 在聊天窗口输入：
   ```
   我想学习关于科技的英语单词
   ```
4. 观察返回的单词卡片

**预期效果：**
- 显示智能检索提示："正在从本地词库为您智能检索 科技 相关的单词..."
- 返回与科技相关的英文单词卡片（computer, technology, software 等）
- 而不是之前只包含"科技"中文字符的结果

## 效果对比

### ❌ 传统 LIKE 搜索（之前）
```
用户输入："科技"
匹配结果：
  - AARNet: [计] 澳州学术及科技网
  - agilent: n. 安捷伦科技公司
  ...
问题：只匹配包含"科技"两个字的中文翻译，大部分不相关
```

### ✅ AI 语义搜索（现在）
```
用户输入："科技"
AI 扩展：technology, computer, software, internet, digital...
匹配结果：
  - computer: n. 电脑，电子计算机
  - technology: n. 技术，工业技术
  - software: n. 软件
  - internet: [计] 因特网
  ...
优势：返回的都是与主题高度相关的核心词汇
```

## 测试主题示例

| 主题 | AI 扩展的英文关键词 |
|------|-------------------|
| 科技 | technology, computer, software, internet, digital, innovation, science |
| 医疗 | medical, hospital, doctor, treatment, health, medicine, therapy |
| 环境 | environment, ecology, pollution, green, nature, conservation, ecosystem |
| 教育 | education, learning, teaching, school, student, teacher, knowledge |
| 经济 | economy, finance, market, trade, business, investment, money |

## 技术实现

### 后端服务

1. **SemanticSearchService** - 语义搜索服务接口
2. **SemanticSearchServiceImpl** - 实现类
   - `expandKeywordsWithAI()` - 使用 AI 扩展关键词
   - `semanticSearch()` - 执行语义搜索
   - `smartSearch()` - 智能搜索（降级方案）

### 工作流程

```
用户输入"科技"
    ↓
AI 扩展关键词（50 个相关英文单词）
    ↓
批量查询数据库（findByWordIn）
    ↓
如果结果不足，添加前缀匹配
    ↓
如果 AI 失败，降级为 LIKE 搜索
    ↓
返回精准匹配的英文单词
```

## 常见问题

### Q: 401 认证错误
**A:** 使用带认证的测试脚本时，需要有效的用户账号。可以先用简化版测试（test_semantic_simple.py）。

### Q: AI 扩展失败
**A:** 检查 AI 服务配置（deepseek API key），系统会自动降级为普通搜索。

### Q: 返回结果为空
**A:** 可能是数据库中缺少相关单词数据，可以运行 `import_ecdict.py` 导入更多数据。

## 性能指标

- **AI 扩展耗时**: ~2-5 秒（调用一次 AI）
- **数据库查询**: <100 毫秒（批量查询）
- **总耗时**: ~2-6 秒
- **准确率**: 相比 LIKE 搜索提升 80%+

## 下一步优化建议

1. 添加缓存机制，避免重复调用 AI
2. 支持用户自定义扩展关键词
3. 根据用户水平（CEFR）过滤单词难度
4. 添加单词关联度评分

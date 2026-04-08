# 智学云境 (AI LearnSphere) - 单词卡片用户学习持久化功能文档

## 功能概述

本功能为智学云境 (AI LearnSphere) 添加了完整的用户学习持久化能力，可以记录和追踪用户的发音练习情况和单词练习情况，为学习者提供全面的学习数据分析和反馈。

## 功能特性

### 1. 发音记录持久化
- 记录用户每次发音练习的详细信息
- 保存语音识别结果和目标文本对比
- 存储 AI 评分和反馈
- 记录薄弱单词列表
- 支持练习模式区分（发音/拼写）

### 2. 练习记录持久化
- 记录拼写练习、复习练习等多种练习类型
- 保存用户答案和正确答案对比
- 记录练习正确性和得分
- 记录响应时间
- 存储 AI 反馈和建议

### 3. 学习统计与分析
- 实时统计用户学习进度
- 计算发音平均得分和最佳得分
- 统计练习正确率
- 记录今日学习情况
- 按单词、时间范围等多维度查询

## 数据库设计

### 新增数据表

#### 1. pronunciation_records (发音记录表)
```sql
CREATE TABLE pronunciation_records (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    word_id INT NOT NULL,
    target_text VARCHAR(500) NOT NULL,
    recognized_text VARCHAR(500) NOT NULL,
    score INT NOT NULL,
    ai_feedback TEXT,
    weak_words TEXT,
    audio_path VARCHAR(500),
    practice_mode VARCHAR(20) DEFAULT 'pronunciation',
    created_at DATETIME NOT NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_word_id (word_id),
    INDEX idx_created_at (created_at)
);
```

#### 2. practice_records (练习记录表)
```sql
CREATE TABLE practice_records (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    word_id INT NOT NULL,
    practice_type VARCHAR(20) NOT NULL,
    user_input VARCHAR(500),
    correct_answer VARCHAR(500),
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    score INT,
    response_time BIGINT,
    ai_feedback TEXT,
    practice_details TEXT,
    created_at DATETIME NOT NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_word_id (word_id),
    INDEX idx_practice_type (practice_type),
    INDEX idx_created_at (created_at)
);
```

### 扩展数据表

#### user_word_progress (用户单词进度表)
新增字段：
- `pronunciation_count` - 发音练习次数
- `pronunciation_avg_score` - 发音平均得分
- `pronunciation_best_score` - 最佳发音得分
- `spelling_count` - 拼写练习次数
- `spelling_correct_count` - 拼写正确次数
- `total_practice_count` - 总练习次数
- `last_pronunciation_time` - 最后发音练习时间
- `last_spelling_time` - 最后拼写练习时间

## API 接口

### 1. 发音评测接口（已增强）
```
POST /api/ai/speech/evaluate
```
**功能**: 评测用户发音并自动保存记录
**参数**:
- `audio` (MultipartFile): 音频文件
- `targetText` (String): 目标文本
- `userId` (Long, optional): 用户 ID

**返回**:
```json
{
  "score": 85,
  "recognizedText": "hello world",
  "targetText": "hello world",
  "aiFeedback": "发音清晰，语调自然",
  "weakWords": ["world"]
}
```

### 2. 获取发音记录
```
GET /api/learning/pronunciation
```
**参数**:
- `wordId` (Integer, optional): 单词 ID
- `startTime` (DateTime, optional): 开始时间
- `endTime` (DateTime, optional): 结束时间

**返回**:
```json
{
  "records": [
    {
      "id": 1,
      "targetText": "persistence",
      "recognizedText": "persistence",
      "score": 92,
      "aiFeedback": "发音准确",
      "createdAt": "2026-03-22T16:30:00"
    }
  ],
  "total": 1
}
```

### 3. 获取练习记录
```
GET /api/learning/practice
```
**参数**:
- `wordId` (Integer, optional): 单词 ID
- `practiceType` (String, optional): 练习类型 (spelling/review/listening)
- `startTime` (DateTime, optional): 开始时间
- `endTime` (DateTime, optional): 结束时间

### 4. 获取学习统计
```
GET /api/learning/statistics
```
**返回**:
```json
{
  "totalPronunciation": 10,
  "totalPractice": 25,
  "pronunciationAvgScore": 85.5,
  "pronunciationBestScore": 95,
  "practiceAccuracy": 78.5,
  "todayPronunciation": 3,
  "todayPractice": 8
}
```

### 5. 获取单词学习历史
```
GET /api/learning/word/{wordId}/history
```
**返回**:
```json
{
  "wordId": 123,
  "pronunciationRecords": [...],
  "practiceRecords": [...],
  "totalPronunciation": 5,
  "totalPractice": 10
}
```

## 核心代码结构

### 实体类
- `PronunciationRecord.java` - 发音记录实体
- `PracticeRecord.java` - 练习记录实体
- `UserWordProgress.java` - 用户单词进度实体（扩展）

### Repository 层
- `PronunciationRecordRepository.java` - 发音记录数据访问
- `PracticeRecordRepository.java` - 练习记录数据访问

### Service 层
- `LearningRecordService.java` - 学习记录管理服务
- `AiVocabServiceImpl.java` - AI 词汇评测服务（增强）

### Controller 层
- `LearningRecordController.java` - 学习记录查询接口
- `AiVocabController.java` - AI 词汇评测接口（增强）

## 自动记录机制

### 发音练习自动记录
当用户调用发音评测接口时：
1. 调用 whisper.cpp 进行语音识别
2. 调用 AI 模型进行发音评测
3. **自动保存发音记录到数据库**
4. **自动更新 UserWordProgress 统计字段**

### 拼写练习自动记录
当用户进行拼写练习时：
1. 提交拼写答案
2. **自动保存练习记录到数据库**
3. **自动更新 UserWordProgress 统计字段**

### 复习练习自动记录
当用户进行单词复习时：
1. 完成复习
2. **自动保存复习记录到数据库**
3. **自动更新 UserWordProgress 统计字段**

## 使用场景

### 1. 学生用户
- 查看自己的发音进步曲线
- 分析练习正确率变化
- 找出薄弱单词重点练习
- 追踪每日学习情况

### 2. 教师/家长
- 查看学生学习报告
- 了解学生学习习惯
- 针对性辅导建议

### 3. 系统优化
- 基于学习数据优化推荐算法
- 分析常见发音问题
- 改进 AI 评测模型

## 测试验证

### 功能测试结果
✅ 单词表管理 - 正常
✅ 单词添加 - 正常
✅ 学习统计查询 - 正常
✅ 学习记录查询 API - 正常
✅ 发音记录查询 - 正常
✅ 练习记录查询 - 正常

### 测试脚本
运行测试脚本验证功能：
```bash
cd ai-tutor-system/aispring
python test_learning_records.py
```

## 性能优化

1. **索引优化**: 为常用查询字段创建索引
2. **批量操作**: 支持批量查询和统计
3. **异步处理**: 记录操作不影响主流程响应
4. **数据归档**: 支持历史数据归档策略

## 安全考虑

1. **用户隔离**: 用户只能访问自己的学习记录
2. **JWT 认证**: 所有接口需要有效 token
3. **数据验证**: 严格验证输入参数
4. **SQL 注入防护**: 使用 JPA 参数化查询

## 未来扩展

1. **学习报告生成**: 定期生成学习报告邮件
2. **数据可视化**: 图表展示学习趋势
3. **智能推荐**: 基于历史记录推荐学习内容
4. **社交功能**: 学习排行榜、学习小组
5. **导出功能**: 导出学习数据为 PDF/Excel

## 注意事项

1. 发音记录生成需要真实的音频输入（通过前端录音）
2. 建议定期清理过期数据（如超过 1 年的记录）
3. 音频文件存储需要配置适当的存储策略
4. 生产环境建议配置数据库连接池优化

## 更新日志

### v1.0.0 (2026-03-22)
- ✅ 初始版本发布
- ✅ 发音记录持久化
- ✅ 练习记录持久化
- ✅ 学习统计 API
- ✅ 自动记录机制
- ✅ 完整测试覆盖

# 添加 Skills 技能导入模块计划

## 需求分析

用户需要在 claw-web 项目中添加 skills 技能导入功能，允许用户：
1. 从 URL 导入技能（下载远程 SKILL.md）
2. 本地上传技能文件
3. 将导入的技能保存到工作空间的 skills 目录

## 现有代码分析

### 后端已存在的相关文件
- `server/src/integrations/skillsAdapter.ts` - 技能适配层，负责解析 SKILL.md frontmatter、加载技能
- `server/src/integrations/skillLoader.ts` - 技能加载器，管理技能定义和执行
- `server/src/integrations/skillRegistry.ts` - 技能注册表
- `server/src/tools/skillTool.ts` - Skill 执行工具

### 前端已存在的相关文件
- `web/src/components/SkillMarket.vue` - 技能市场组件，展示和管理技能
- `web/src/api/skillApi.ts` - 技能 API 客户端

## 实现计划

### 第一步：后端 - 创建技能导入路由
**文件**: `server/src/routes/skills.routes.ts` (新建)

功能：
- `POST /api/skills/import/url` - 从 URL 导入技能
  - 请求体: `{ url: string, category?: string }`
  - 验证 URL 格式
  - 下载远程 SKILL.md 内容
  - 解析 frontmatter
  - 保存到工作空间的 `.claude/skills/` 目录
  - 返回导入结果

- `POST /api/skills/import/file` - 上传本地技能文件
  - 支持 multipart/form-data 上传
  - 接收 SKILL.md 文件或包含 SKILL.md 的 zip 包
  - 解析并保存到工作空间

- `POST /api/skills/validate` - 验证技能内容
  - 验证 SKILL.md 格式是否正确
  - 返回解析后的技能信息预览

### 第二步：后端 - 技能解析增强
**文件**: `server/src/integrations/skillsAdapter.ts` (修改)

功能：
- 添加 `parseSkillFromUrl(url: string)` 函数 - 从 URL 下载并解析技能
- 添加 `parseSkillFromContent(content: string)` 函数 - 从内容解析技能
- 添加 `saveSkillToDirectory(skill, targetDir)` 函数 - 保存技能到目录
- 完善错误处理和日志

### 第三步：前端 - 添加导入功能 UI
**文件**: `web/src/components/SkillMarket.vue` (修改)

功能：
- 添加"导入技能"按钮
- 导入对话框支持：
  - URL 导入标签页
  - 文件上传标签页
- 显示导入进度和结果
- 导入成功后自动刷新技能列表

### 第四步：前端 - API 客户端更新
**文件**: `web/src/api/skillApi.ts` (修改)

功能：
- 添加 `importSkillFromUrl(url: string, category?: string)` 方法
- 添加 `importSkillFromFile(file: File)` 方法
- 添加 `validateSkill(content: string)` 方法

### 第五步：集成测试
- 测试 URL 导入功能
- 测试文件上传功能
- 测试技能解析和保存

## 技术细节

### URL 导入流程
1. 前端发送 URL 到后端
2. 后端使用 fetch 下载 URL 内容
3. 解析 SKILL.md 的 frontmatter
4. 生成技能目录名（基于技能名称）
5. 创建目录并保存 SKILL.md
6. 返回成功/失败结果

### 文件上传流程
1. 前端使用 FormData 上传文件
2. 后端接收并验证文件类型
3. 解析文件内容（支持单个 md 或 zip 包）
4. 保存到工作空间
5. 返回导入结果

### 安全考虑
- URL 必须以 http:// 或 https:// 开头
- 限制下载文件大小（最大 1MB）
- 验证文件名，防止路径遍历攻击
- 只允许保存到 `.claude/skills/` 目录下

## 预计工作量
- 后端路由和解析逻辑: 约 200-300 行
- 前端 UI 更新: 约 100-150 行
- API 客户端更新: 约 30-50 行

# Checklist - 修复同名文件不同路径上的识别问题

## 实现检查点

### 服务端修改
- [x] `workspace.routes.ts` 文件列表 API 返回了 `path` 字段
- [x] `path` 是相对于 uploads 目录的完整相对路径
- [x] `workdir.ts` 的 `readDirectory` 函数返回完整相对路径（包含子目录）

### 前端修改
- [x] `useAgentWorkdir.ts` 中 `id` 使用完整路径
- [x] `getTabDisplayName` 正确展示带父目录前缀的名称（如 `uploads/report.pdf`）
- [x] 文件树节点的 `key` 使用完整路径

### 测试验证
- [ ] 同名文件在不同子目录可以正确区分
- [ ] 标签页显示不同的父目录前缀

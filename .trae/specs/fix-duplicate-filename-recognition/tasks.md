# Tasks - 修复同名文件不同路径上的识别问题

## 任务列表

- [ ] Task 1: 修改服务端 API 返回完整相对路径
  - [ ] 修改 `server/src/routes/workspace.routes.ts` 的文件列表 API
  - [ ] 返回对象增加 `path` 字段（完整相对路径）
  - [ ] 使用 `relative()` 计算相对路径

- [ ] Task 2: 修改前端使用完整路径作为唯一标识
  - [ ] 确认前端 `useAgentWorkdir.ts` 中 `id` 使用完整路径
  - [ ] 确认 `getTabDisplayName` 正确展示带父目录前缀

- [ ] Task 3: 测试验证
  - [ ] 验证同名文件在不同子目录可以正确区分
  - [ ] 验证标签页显示正确

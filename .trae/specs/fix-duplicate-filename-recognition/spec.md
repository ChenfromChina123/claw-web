# 修复同名文件不同路径上的识别问题规范

## Why

当前系统存在**同名文件在不同路径上的识别问题**。

**问题场景**：
- 用户工作目录下有 `uploads/report.pdf` 和 `documents/report.pdf` 两个同名文件
- 服务端 API `/api/workspace/:sessionId/files` 只返回文件名（`name: e.name`），不返回完整相对路径
- 前端拿到的是两个同名 `report.pdf`，无法区分

**当前代码问题**（`workspace.routes.ts:100-101`）：
```typescript
return { name: e.name, size: fstat.size, lastModified: fstat.mtime.toISOString() }
```

这里 `e.name` 只是文件名（如 `uuid.pdf`），不是相对路径（如 `uploads/uuid.pdf`）。

## What Changes

### 1. 修改服务端 API 返回完整相对路径

**修改前**：
```typescript
return { name: e.name, size: fstat.size, lastModified: fstat.mtime.toISOString() }
```

**修改后**：
```typescript
return {
  name: e.name,           // 文件名（用于显示）
  path: relative(uploadsDir, path.join(uploadsDir, e.name)),  // 完整相对路径（用于唯一标识）
  size: fstat.size,
  lastModified: fstat.mtime.toISOString()
}
```

### 2. 前端使用完整路径作为唯一标识

**修改前**：
- `id: path` → `id: '/uploads/report.pdf'`

**修改后**：
- `id: path` → `id: '/uploads/550e8400-e29b-41d4-a716-446655440000.pdf'`
- 完整路径包含 UUID，确保唯一性

### 3. 前端展示优化

当存在同名文件时，`getTabDisplayName` 应展示父目录以区分：
- `/uploads/report.pdf` → 显示为 `uploads/report.pdf`
- `/documents/report.pdf` → 显示为 `documents/report.pdf`

## Impact

- 受影响文件：
  - `server/src/routes/workspace.routes.ts` - 返回完整相对路径
  - `web/src/composables/useAgentWorkdir.ts` - 使用完整路径作为唯一标识

## ADDED Requirements

### Requirement: 文件列表返回完整相对路径

API `/api/workspace/:sessionId/files` SHALL 返回文件的完整相对路径（相对于工作区根目录），而不是仅返回文件名。

#### Scenario: 同名文件在不同子目录
- **GIVEN** 工作区存在 `/uploads/report.pdf` 和 `/documents/report.pdf`
- **WHEN** 前端调用文件列表 API
- **THEN** 返回的记录应包含完整相对路径：
  - `{ name: "uuid1.pdf", path: "uploads/uuid1.pdf", ... }`
  - `{ name: "uuid2.pdf", path: "documents/uuid2.pdf", ... }`

### Requirement: 前端使用完整路径作为唯一标识

前端 SHALL 使用完整路径（而非仅文件名）作为文件的唯一标识符。

#### Scenario: 同名文件标签页
- **GIVEN** 用户打开了 `/uploads/report.pdf` 和 `/documents/report.pdf`
- **WHEN** 系统渲染标签页
- **THEN** 每个标签页使用完整路径作为 `id`
- **AND** 显示名称时展示父目录前缀以区分

## MODIFIED Requirements

### Requirement: workspace.routes.ts 文件列表返回

**修改点**：
- 返回对象增加 `path` 字段
- `path` 为相对于 uploads 目录的完整相对路径

### Requirement: useAgentWorkdir.ts 文件标识

**修改点**：
- `openFileFromExplorer` 使用完整路径作为 `id`
- `getTabDisplayName` 正确显示带父目录前缀的名称

## REMOVED Requirements

无。

## Implementation Notes

### 核心修改点

1. **服务端**：
   - `readdir` 遍历时记录完整相对路径
   - 返回数据增加 `path` 字段

2. **前端**：
   - `OpenFileEntry.id` 使用完整路径
   - `getTabDisplayName` 展示时添加父目录前缀

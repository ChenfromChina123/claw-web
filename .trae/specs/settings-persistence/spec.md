# 前端设置持久化 Spec

## Why
当前设置页面的配置（主题、用户信息等）没有进行持久化保存，用户刷新页面后所有设置都会丢失。需要实现设置数据的本地持久化存储，提升用户体验。

## What Changes
- 创建统一的设置存储模块（settings store）
- 实现主题设置的持久化（已部分实现，需整合到 settings store）
- 实现用户偏好设置的持久化（语言、模型、温度等）
- 更新 Settings 页面，使用持久化存储
- 添加设置导入/导出功能（可选）

## Impact
- 影响 specs: 设置管理能力、主题管理能力
- 影响代码: `src/stores/`, `src/views/Settings.vue`, `src/composables/useTheme.ts`

## ADDED Requirements

### Requirement: 设置持久化存储
系统 SHALL 使用 localStorage 存储用户设置数据，包括：
- 主题设置（theme）
- 语言设置（language）
- 模型设置（model、temperature、maxTokens）
- 界面偏好（streamResponse、soundEnabled）

### Requirement: 设置 Store
系统 SHALL 提供 Pinia store 来集中管理设置状态：
- 响应式读取设置
- 自动持久化到 localStorage
- 提供设置更新方法

### Requirement: 主题持久化整合
系统 SHALL 将现有的 useTheme hook 与 settings store 整合：
- 主题切换时自动保存到 settings store
- 初始化时从 settings store 读取主题

### Requirement: 用户信息持久化
系统 SHALL 在 auth store 中持久化用户基本信息：
- 用户 ID、用户名、邮箱
- 头像 URL
- 偏好设置引用

## MODIFIED Requirements

### Requirement: Settings 页面
设置页面 SHALL 从 settings store 读取数据，并通过 store 的方法进行更新：
- 所有表单项绑定到 store 的状态
- 修改后自动保存到 localStorage
- 无需手动点击保存按钮（可选实时保存）

## REMOVED Requirements
无

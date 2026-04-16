/**
 * UI 状态相关类型定义
 */

export type ThemeMode = 'light' | 'dark' | 'system'
export type MessageDensity = 'comfortable' | 'compact' | 'cozy'
export type Language = 'zh-CN' | 'en-US' | 'ja-JP' | 'ko-KR'

export interface ThemeConfig {
  mode: ThemeMode
  primaryColor: string
  fontSize: 'small' | 'medium' | 'large'
  messageDensity: MessageDensity
  codeFontFamily: string
}

export interface UIState {
  sidebarCollapsed: boolean
  commandPaletteOpen: boolean
  settingsPanelOpen: boolean
  isLoading: boolean
  activeModal: string | null
  notifications: Notification[]
}

export interface Notification {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message?: string
  duration?: number
  timestamp: Date
  read: boolean
}

export interface CommandPaletteItem {
  id: string
  label: string
  description: string
  category: string
  shortcut?: string
  icon?: string
  action: () => void
}

export interface CommandCategory {
  label: string
  items: CommandPaletteItem[]
}

export interface KeyboardShortcut {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  description: string
  category: 'global' | 'chat' | 'navigation' | 'editing'
  action: () => void
}

export interface ContextMenuAction {
  id: string
  label: string
  icon?: string
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  divider?: boolean
  action: () => void
}

export interface PaginationState {
  page: number
  pageSize: number
  total: number
  hasMore: boolean
}

export interface SortState {
  field: string
  direction: 'asc' | 'desc'
}

export interface FilterState {
  search: string
  categories: string[]
  dateRange?: {
    start: Date
    end: Date
  }
}

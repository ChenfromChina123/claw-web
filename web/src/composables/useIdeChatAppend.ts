import { inject, provide, type InjectionKey } from 'vue'

/** 编辑器选中 → 对话：结构化引用（输入框显示芯片，发送时带路径+行号+片段） */
export interface IdeCodeRefPayload {
  filePath: string
  fileName: string
  startLine: number
  endLine: number
  language?: string
  snippet: string
}

/** 终端输出 → 对话：结构化引用（输入框显示芯片，发送时带完整内容） */
export interface IdeTerminalRefPayload {
  /** 终端内容预览（用于芯片显示） */
  preview: string
  /** 完整的终端内容（可能被截断） */
  content: string
  /** 原始字符数（截断前） */
  originalLength: number
}

export interface IdeAppendToChatOptions {
  language?: string
  sourceLabel?: string
  codeRef?: IdeCodeRefPayload
  terminalRef?: IdeTerminalRefPayload
}

export type IdeAppendToChatFn = (text: string, options?: IdeAppendToChatOptions) => void

export const IDE_APPEND_TO_CHAT_KEY: InjectionKey<IdeAppendToChatFn> = Symbol('ide-append-to-chat')

export function provideIdeAppendToChat(fn: IdeAppendToChatFn): void {
  provide(IDE_APPEND_TO_CHAT_KEY, fn)
}

export function useIdeAppendToChat(): IdeAppendToChatFn | undefined {
  return inject(IDE_APPEND_TO_CHAT_KEY, undefined)
}

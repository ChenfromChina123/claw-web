import { inject, provide, type InjectionKey, ref } from 'vue'

/**
 * 提示词模板库打开函数类型
 */
export type OpenPromptLibraryFn = () => void

export const OPEN_PROMPT_LIBRARY_KEY: InjectionKey<OpenPromptLibraryFn> = Symbol('open-prompt-library')

/**
 * 提供打开模板库的方法
 */
export function provideOpenPromptLibrary(fn: OpenPromptLibraryFn): void {
  provide(OPEN_PROMPT_LIBRARY_KEY, fn)
}

/**
 * 使用打开模板库的方法
 */
export function useOpenPromptLibrary(): OpenPromptLibraryFn | undefined {
  return inject(OPEN_PROMPT_LIBRARY_KEY, undefined)
}

/**
 * 创建模板库状态管理
 */
export function usePromptTemplateLibraryState() {
  const isOpen = ref(false)

  function open(): void {
    isOpen.value = true
  }

  function close(): void {
    isOpen.value = false
  }

  function toggle(): void {
    isOpen.value = !isOpen.value
  }

  return {
    isOpen,
    open,
    close,
    toggle,
  }
}

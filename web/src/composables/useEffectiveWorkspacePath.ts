/**
 * useEffectiveWorkspacePath - 获取当前会话对应的有效工作区路径
 * 与 Agent Bash 的 cwd 保持一致（workspaces/users/{userId}）
 */

import { ref, watch, type Ref } from 'vue'
import apiClient from '@/api/client'
import type { ApiResponse } from '@/types'

export function useEffectiveWorkspacePath(sessionIdRef: Ref<string>) {
  const workspacePath = ref<string>('')
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchWorkspacePath(sid: string): Promise<string> {
    if (!sid) {
      workspacePath.value = ''
      return ''
    }

    loading.value = true
    error.value = null

    try {
      const res = await apiClient.get<{ path: string }>(
        '/agent/session/effective-workspace',
        { params: { sessionId: sid } }
      )
      // 后端 createSuccessResponse → { success: true, data: { path } }；axios 的 data 即整段 JSON
      const body = res.data as ApiResponse<{ path: string }>
      workspacePath.value = body.data?.path?.trim() || ''
      return workspacePath.value
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn('[useEffectiveWorkspacePath] 获取失败:', msg)
      error.value = msg
      return ''
    } finally {
      loading.value = false
    }
  }

  // 初次 + sessionId 变化时拉取
  watch(sessionIdRef, async (sid) => {
    if (sid) await fetchWorkspacePath(sid)
  }, { immediate: true })

  return { workspacePath, loading, error, refresh: fetchWorkspacePath }
}

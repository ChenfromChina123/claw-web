/**
 * 浏览器侧 API 根路径。禁止指向 Docker 内部主机名（浏览器无法解析）。
 */
export function resolveBrowserApiBase(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()
  if (!raw) return '/api'
  if (/^https?:\/\/(backend|mysql|frontend|redis)(:\d+)?/i.test(raw)) {
    return '/api'
  }
  return raw.replace(/\/$/, '') || '/api'
}

/**
 * SchedulingPolicy - 智能调度策略
 *
 * 功能：
 * - 用户等级识别与差异化处理
 * - 容器分配优先级队列
 * - 资源感知的调度决策
 * - 降级策略与优雅降级
 *
 * 用户等级说明：
 * - VIP用户：独占容器，不回收，最高优先级
 * - 高级用户：共享容器池但优先分配，较长空闲超时
 * - 普通用户：标准容器池，默认超时时间
 * - 新用户/体验用户：受限资源，较短超时
 */

import { getContainerOrchestrator, type ContainerInstance } from './containerOrchestrator'
import type { UserContainerMapping } from './userContainerMapper'

// ==================== 类型定义 ====================

/**
 * 用户等级枚举
 */
export enum UserTier {
  VIP = 'vip',
  PREMIUM = 'premium',
  REGULAR = 'regular',
  TRIAL = 'trial'
}

/**
 * 等级配置
 */
export interface TierConfig {
  /** 是否允许独占容器 */
  allowExclusiveContainer: boolean
  /** 最大会话数 */
  maxSessions: number
  /** 存储配额 (MB) */
  storageQuotaMB: number
  /** 最大PTY进程数 */
  maxPtyProcesses: number
  /** 空闲超时时间（毫秒），0表示永不回收 */
  idleTimeoutMs: number
  /** 请求优先级（数值越小越优先）*/
  priority: number
  /** API调用频率限制（次/分钟）*/
  rateLimitPerMinute: number
  /** 是否允许使用高级功能 */
  allowAdvancedFeatures: boolean
}

/**2026-04-14 23:00:53.056 | [WS] Client disconnected: 7224cad4-dd65-4122-8c2f-e3b7223781f9
2026-04-14 23:00:53.180 | [RequestRouter] 代理请求失败 (http://localhost:3100/api/auth/me): 108 |     headers.set('X-Forwarded-For', 'localhost')
2026-04-14 23:00:53.180 | 109 |     headers.set('X-Proxy-Origin', 'claw-web-master')
2026-04-14 23:00:53.180 | 110 |     headers.set('Host', `localhost:${targetPort}`)
2026-04-14 23:00:53.180 | 111 | 
2026-04-14 23:00:53.180 | 112 |     // 转发请求
2026-04-14 23:00:53.180 | 113 |     const response = await fetch(targetUrl, {
2026-04-14 23:00:53.180 |                                  ^
2026-04-14 23:00:53.180 | error: Unable to connect. Is the computer able to access the url?
2026-04-14 23:00:53.180 |   path: "http://localhost:3100/api/auth/me",
2026-04-14 23:00:53.180 |  errno: 0,
2026-04-14 23:00:53.180 |   code: "ConnectionRefused"
2026-04-14 23:00:53.180 | 
2026-04-14 23:00:53.180 |       at async proxyToWorkerContainer (/app/src/server/httpServer.ts:113:28)
2026-04-14 23:00:53.180 |       at async fetch (/app/src/server/httpServer.ts:365:28)
2026-04-14 23:00:53.180 | 
2026-04-14 23:00:53.209 | [WS] Message from aaf2b38b-ebb6-4147-a74f-cad3714c548c: ping
2026-04-14 23:00:53.507 | [WS] Client connected: 41b0d202-3dfa-4172-bce1-34f225ddd83d
2026-04-14 23:00:53.509 | [RequestRouter] 代理请求失败 (http://localhost:3100/api/agent/session/effective-workspace): 108 |     headers.set('X-Forwarded-For', 'localhost')
2026-04-14 23:00:53.509 | 109 |     headers.set('X-Proxy-Origin', 'claw-web-master')
2026-04-14 23:00:53.509 | 110 |     headers.set('Host', `localhost:${targetPort}`)
2026-04-14 23:00:53.509 | 111 | 
2026-04-14 23:00:53.509 | 112 |     // 转发请求
2026-04-14 23:00:53.509 | 113 |     const response = await fetch(targetUrl, {
2026-04-14 23:00:53.509 |                                  ^
2026-04-14 23:00:53.509 | error: Unable to connect. Is the computer able to access the url?
2026-04-14 23:00:53.509 |   path: "http://localhost:3100/api/agent/session/effective-workspace",
2026-04-14 23:00:53.509 |  errno: 0,
2026-04-14 23:00:53.509 |   code: "ConnectionRefused"
2026-04-14 23:00:53.509 | 
2026-04-14 23:00:53.509 |       at async proxyToWorkerContainer (/app/src/server/httpServer.ts:113:28)
2026-04-14 23:00:53.509 |       at async fetch (/app/src/server/httpServer.ts:365:28)
2026-04-14 23:00:53.509 | 
2026-04-14 23:00:53.520 | [WS] Message from 41b0d202-3dfa-4172-bce1-34f225ddd83d: login
2026-04-14 23:00:53.521 | [WS] User logged in via token: 2fb3f37b-c043-4599-801c-774dd5102b39
2026-04-14 23:00:53.524 | [WS] Message from 41b0d202-3dfa-4172-bce1-34f225ddd83d: list_sessions
2026-04-14 23:00:53.524 | [WS] list_sessions: userId=2fb3f37b-c043-4599-801c-774dd5102b39
2026-04-14 23:00:53.524 | [SessionRepo] findByUserId: userId=2fb3f37b-c043-4599-801c-774dd5102b39
2026-04-14 23:00:53.526 | [SessionRepo] findByUserId: found 5 sessions for user 2fb3f37b-c043-4599-801c-774dd5102b39, rows: [
2026-04-14 23:00:53.526 |   {
2026-04-14 23:00:53.526 |     "id": "a305fe6f-fc6f-4608-a56d-7c6b37a034d7",
2026-04-14 23:00:53.526 |     "user_id": "2fb3f37b-c043-4599-801c-774dd5102b39",
2026-04-14 23:00:53.526 |     "title": "新对话",
2026-04-14 23:00:53.526 |     "model": "qwen-plus",
2026-04-14 23:00:53.526 |     "is_pinned": 0,
2026-04-14 23:00:53.526 |     "is_master": 0,
2026-04-14 23:00:53.526 |     "created_at": "2026-04-14T14:56:57.000Z",
2026-04-14 23:00:53.526 |     "updated_at": "2026-04-14T14:58:35.000Z"
2026-04-14 23:00:53.526 |   },
2026-04-14 23:00:53.526 |   {
2026-04-14 23:00:53.526 |     "id": "192dd7d3-3483-4f05-a57d-3dbc4e1096d8",
2026-04-14 23:00:53.526 |     "user_id": "2fb3f37b-c043-4599-801c-774dd5102b39",
2026-04-14 23:00:53.526 |     "title": "探索电脑环境",
2026-04-14 23:00:53.526 |     "model": "qwen-plus",
2026-04-14 23:00:53.526 |     "is_pinned": 0,
2026-04-14 23:00:53.526 |     "is_master": 0,
2026-04-14 23:00:53.526 |     "created_at": "2026-04-14T08:12:24.000Z",
2026-04-14 23:00:53.526 |     "updated_at": "2026-04-14T12:50:58.000Z"
2026-04-14 23:00:53.526 |   },
2026-04-14 23:00:53.526 |   {
2026-04-14 23:00:53.526 |     "id": "ccafe5c6-fe36-49a0-928f-1f53afdb583a",
2026-04-14 23:00:53.526 |     "user_id": "2fb3f37b-c043-4599-801c-774dd5102b39",
2026-04-14 23:00:53.526 |     "title": "探索环境",
2026-04-14 23:00:53.526 |     "model": "qwen-plus",
2026-04-14 23:00:53.526 |     "is_pinned": 0,
2026-04-14 23:00:53.526 |     "is_master": 0,
2026-04-14 23:00:53.526 |     "created_at": "2026-04-13T16:12:13.000Z",
2026-04-14 23:00:53.526 |     "updated_at": "2026-04-13T16:16:47.000Z"
2026-04-14 23:00:53.526 |   },
2026-04-14 23:00:53.526 |   {
2026-04-14 23:00:53.526 |     "id": "529afee2-5387-4479-9aff-a497b0628314",
2026-04-14 23:00:53.526 |     "user_id": "2fb3f37b-c043-4599-801c-774dd5102b39",
2026-04-14 23:00:53.526 |     "title": "nih",
2026-04-14 23:00:53.526 |     "model": "qwen-plus",
2026-04-14 23:00:53.526 |     "is_pinned": 0,
2026-04-14 23:00:53.526 |     "is_master": 0,
2026-04-14 23:00:53.526 |     "created_at": "2026-04-11T07:42:30.000Z",
2026-04-14 23:00:53.526 |     "updated_at": "2026-04-13T04:43:30.000Z"
2026-04-14 23:00:53.526 |   },
2026-04-14 23:00:53.526 |   {
2026-04-14 23:00:53.526 |     "id": "53eae232-f940-4429-a6d8-94a77c0a7bd0",
2026-04-14 23:00:53.526 |     "user_id": "2fb3f37b-c043-4599-801c-774dd5102b39",
2026-04-14 23:00:53.526 |     "title": "主会话",
2026-04-14 23:00:53.526 |     "model": "qwen-plus",
2026-04-14 23:00:53.526 |     "is_pinned": 0,
2026-04-14 23:00:53.526 |     "is_master": 1,
2026-04-14 23:00:53.526 |     "created_at": "2026-04-11T07:42:30.000Z",
2026-04-14 23:00:53.526 |     "updated_at": "2026-04-11T07:42:30.000Z"
2026-04-14 23:00:53.526 |   }
2026-04-14 23:00:53.526 | ]
2026-04-14 23:00:53.526 | [WS] list_sessions: found 5 sessions for user 2fb3f37b-c043-4599-801c-774dd5102b39
2026-04-14 23:00:53.575 | [WS] Message from 41b0d202-3dfa-4172-bce1-34f225ddd83d: get_master_session
2026-04-14 23:00:53.575 | [WS] Message handling error: sessionManager.getOrCreateMasterSession is not a function. (In 'sessionManager.getOrCreateMasterSession(userId)', 'sessionManager.getOrCreateMasterSession' is undefined)
2026-04-14 23:00:53.576 | [WS] Message from 41b0d202-3dfa-4172-bce1-34f225ddd83d: load_session
2026-04-14 23:00:53.577 | [SessionManager] loadSession called for session a305fe6f-fc6f-4608-a56d-7c6b37a034d7
2026-04-14 23:00:53.579 | [SessionManager] Retrieved from DB - messages: 0, toolCalls: 0
2026-04-14 23:00:53.579 | [SessionManager] After filtering tool_result messages: 0 (removed 0 internal messages)
2026-04-14 23:00:53.579 | [SessionManager] Loaded session a305fe6f-fc6f-4608-a56d-7c6b37a034d7 successfully: {
2026-04-14 23:00:53.579 |   messageCount: 0,
2026-04-14 23:00:53.579 |   toolCallCount: 0,
2026-04-14 23:00:53.579 |   dirty: false,
2026-04-14 23:00:53.579 | }
2026-04-14 23:00:53.579 | [WS] Session loaded: a305fe6f-fc6f-4608-a56d-7c6b37a034d7, messages: 0
2026-04-14 23:00:53.595 | [WS] Message from 41b0d202-3dfa-4172-bce1-34f225ddd83d: rpc_call
2026-04-14 23:00:53.596 | [WS RPC] pty.create id=1776178853594-idos57xxn conn=41b0d202-3dfa-4172-bce1-34f225ddd83d
2026-04-14 23:00:53.596 | [PTY] Creating session c37feaeb-01ac-4ff4-aa0c-40d9ea49f124 with shell: /bin/bash, cwd: /app
2026-04-14 23:00:53.596 | [PTY] Unix 平台：使用 Bun.Terminal
2026-04-14 23:00:53.597 | [PTY] Bun.spawn success, pid: 875
2026-04-14 23:00:53.597 | [PTY] Session c37feaeb-01ac-4ff4-aa0c-40d9ea49f124 created successfully
2026-04-14 23:00:53.597 | [PTY] Bun.Terminal data callback: data.length=108, text="stty -echo\r\n\r\nset +v\r\n\r\nexport PS1='2fb3f37b-c043-4599-801c-774dd5102b39@\\H:\\w\\$ '\r\n\r\ncd \"/app\"\r\n\r\nc"
2026-04-14 23:00:53.597 | [PTY] Calling handleOutput with filteredText.length=108
2026-04-14 23:00:53.597 | [PTY] handleOutput: sessionId=c37feaeb-01ac-4ff4-aa0c-40d9ea49f124, type=stdout, data.length=108, data="stty -echo\r\n\r\nset +v\r\n\r\nexport PS1='2fb3f37b-c043-4599-801c-774dd5102b39@\\H:\\w\\$ '\r\n\r\ncd \"/app\"\r\n\r\nclear\r\n\r\n"
2026-04-14 23:00:53.597 | [PTY] Output callback called for sessionId=c37feaeb-01ac-4ff4-aa0c-40d9ea49f124
2026-04-14 23:00:53.599 | [PTY] Bun.Terminal data callback: data.length=113, text="bash: cannot set terminal process group (1): Inappropriate ioctl for device\r\nbash: no job control in"
2026-04-14 23:00:53.599 | [PTY] Filtered text is empty, skipping
2026-04-14 23:00:53.600 | [PTY] Bun.Terminal data callback: data.length=61, text="\u001b[?2004h2fb3f37b-c043-4599-801c-774dd5102b39@b33cd167ce9d:~# "
2026-04-14 23:00:53.600 | [PTY] Calling handleOutput with filteredText.length=61
2026-04-14 23:00:53.600 | [PTY] handleOutput: sessionId=c37feaeb-01ac-4ff4-aa0c-40d9ea49f124, type=stdout, data.length=61, data="\u001b[?2004h2fb3f37b-c043-4599-801c-774dd5102b39@b33cd167ce9d:~# "
2026-04-14 23:00:53.600 | [PTY] Output callback called for sessionId=c37feaeb-01ac-4ff4-aa0c-40d9ea49f124
2026-04-14 23:00:53.600 | [PTY] Bun.Terminal data callback: data.length=21, text="stty -echo\r\n\u001b[?2004l\r"
2026-04-14 23:00:53.600 | [PTY] Calling handleOutput with filteredText.length=21
2026-04-14 23:00:53.600 | [PTY] handleOutput: sessionId=c37feaeb-01ac-4ff4-aa0c-40d9ea49f124, type=stdout, data.length=21, data="stty -echo\r\n\u001b[?2004l\r"
2026-04-14 23:00:53.600 | [PTY] Output callback called for sessionId=c37feaeb-01ac-4ff4-aa0c-40d9ea49f124
2026-04-14 23:00:53.602 | [PTY] Bun.Terminal data callback: data.length=72, text="\u001b[?2004h2fb3f37b-c043-4599-801c-774dd5102b39@b33cd167ce9d:~# \u001b[?2004l\r\r\n"
2026-04-14 23:00:53.602 | [PTY] Calling handleOutput with filteredText.length=72
2026-04-14 23:00:53.602 | [PTY] handleOutput: sessionId=c37feaeb-01ac-4ff4-aa0c-40d9ea49f124, type=stdout, data.length=72, data="\u001b[?2004h2fb3f37b-c043-4599-801c-774dd5102b39@b33cd167ce9d:~# \u001b[?2004l\r\r\n"
2026-04-14 23:00:53.602 | [PTY] Output callback called for sessionId=c37feaeb-01ac-4ff4-aa0c-40d9ea49f124
2026-04-14 23:00:53.602 | [PTY] Bun.Terminal data callback: data.length=144, text="\u001b[?2004h2fb3f37b-c043-4599-801c-774dd5102b39@b33cd167ce9d:~# \u001b[?2004l\r\r\n\u001b[?2004h2fb3f37b-c043-4599-8"
2026-04-14 23:00:53.602 | [PTY] Calling handleOutput with filteredText.length=144
2026-04-14 23:00:53.602 | [PTY] handleOutput: sessionId=c37feaeb-01ac-4ff4-aa0c-40d9ea49f124, type=stdout, data.length=144, data="\u001b[?2004h2fb3f37b-c043-4599-801c-774dd5102b39@b33cd167ce9d:~# \u001b[?2004l\r\r\n\u001b[?2004h2fb3f37b-c043-4599-801c-774dd5102b39@b33cd167ce9d:~# \u001b[?2004l\r\r\n"
2026-04-14 23:00:53.602 | [PTY] Output callback called for sessionId=c37feaeb-01ac-4ff4-aa0c-40d9ea49f124
2026-04-14 23:00:53.602 | [PTY] Bun.Terminal data callback: data.length=61, text="\u001b[?2004h2fb3f37b-c043-4599-801c-774dd5102b39@b33cd167ce9d:~# "
2026-04-14 23:00:53.602 | [PTY] Calling handleOutput with filteredText.length=61
2026-04-14 23:00:53.602 | [PTY] handleOutput: sessionId=c37feaeb-01ac-4ff4-aa0c-40d9ea49f124, type=stdout, data.length=61, data="\u001b[?2004h2fb3f37b-c043-4599-801c-774dd5102b39@b33cd167ce9d:~# "
2026-04-14 23:00:53.602 | [PTY] Output callback called for sessionId=c37feaeb-01ac-4ff4-aa0c-40d9ea49f124
2026-04-14 23:00:53.602 | [PTY] Bun.Terminal data callback: data.length=83, text="\u001b[?2004l\r\r\n\u001b[?2004h2fb3f37b-c043-4599-801c-774dd5102b39@b33cd167ce9d:~# \u001b[?2004l\r\r\n"
2026-04-14 23:00:53.603 | [PTY] Calling handleOutput with filteredText.length=83
2026-04-14 23:00:53.603 | [PTY] handleOutput: sessionId=c37feaeb-01ac-4ff4-aa0c-40d9ea49f124, type=stdout, data.length=83, data="\u001b[?2004l\r\r\n\u001b[?2004h2fb3f37b-c043-4599-801c-774dd5102b39@b33cd167ce9d:~# \u001b[?2004l\r\r\n"
2026-04-14 23:00:53.603 | [PTY] Output callback called for sessionId=c37feaeb-01ac-4ff4-aa0c-40d9ea49f124
2026-04-14 23:00:53.603 | [PTY] Bun.Terminal data callback: data.length=144, text="\u001b[?2004h2fb3f37b-c043-4599-801c-774dd5102b39@b33cd167ce9d:~# \u001b[?2004l\r\r\n\u001b[?2004h2fb3f37b-c043-4599-8"
2026-04-14 23:00:53.603 | [PTY] Calling handleOutput with filteredText.length=144
2026-04-14 23:00:53.603 | [PTY] handleOutput: sessionId=c37feaeb-01ac-4ff4-aa0c-40d9ea49f124, type=stdout, data.length=144, data="\u001b[?2004h2fb3f37b-c043-4599-801c-774dd5102b39@b33cd167ce9d:~# \u001b[?2004l\r\r\n\u001b[?2004h2fb3f37b-c043-4599-801c-774dd5102b39@b33cd167ce9d:~# \u001b[?2004l\r\r\n"
2026-04-14 23:00:53.603 | [PTY] Output callback called for sessionId=c37feaeb-01ac-4ff4-aa0c-40d9ea49f124
2026-04-14 23:00:53.603 | [PTY] Bun.Terminal data callback: data.length=72, text="\u001b[?2004h2fb3f37b-c043-4599-801c-774dd5102b39@b33cd167ce9d:~# \u001b[?2004l\r\r\n"
2026-04-14 23:00:53.603 | [PTY] Calling handleOutput with filteredText.length=72
2026-04-14 23:00:53.603 | [PTY] handleOutput: sessionId=c37feaeb-01ac-4ff4-aa0c-40d9ea49f124, type=stdout, data.length=72, data="\u001b[?2004h2fb3f37b-c043-4599-801c-774dd5102b39@b33cd167ce9d:~# \u001b[?2004l\r\r\n"
2026-04-14 23:00:53.603 | [PTY] Output callback called for sessionId=c37feaeb-01ac-4ff4-aa0c-40d9ea49f124
2026-04-14 23:00:53.606 | [PTY] Bun.Terminal data callback: data.length=11, text="\u001b[H\u001b[2J\u001b[3J"
2026-04-14 23:00:53.606 | [PTY] Calling handleOutput with filteredText.length=11
2026-04-14 23:00:53.606 | [PTY] handleOutput: sessionId=c37feaeb-01ac-4ff4-aa0c-40d9ea49f124, type=stdout, data.length=11, data="\u001b[H\u001b[2J\u001b[3J"
2026-04-14 23:00:53.606 | [PTY] Output callback called for sessionId=c37feaeb-01ac-4ff4-aa0c-40d9ea49f124
2026-04-14 23:00:53.607 | [PTY] Bun.Terminal data callback: data.length=133, text="\u001b[?2004h2fb3f37b-c043-4599-801c-774dd5102b39@b33cd167ce9d:~# \u001b[?2004l\r\r\n\u001b[?2004h2fb3f37b-c043-4599-8"
2026-04-14 23:00:53.607 | [PTY] Calling handleOutput with filteredText.length=133
2026-04-14 23:00:53.607 | [PTY] handleOutput: sessionId=c37feaeb-01ac-4ff4-aa0c-40d9ea49f124, type=stdout, data.length=133, data="\u001b[?2004h2fb3f37b-c043-4599-801c-774dd5102b39@b33cd167ce9d:~# \u001b[?2004l\r\r\n\u001b[?2004h2fb3f37b-c043-4599-801c-774dd5102b39@b33cd167ce9d:~# "
2026-04-14 23:00:53.607 | [PTY] Output callback called for sessionId=c37feaeb-01ac-4ff4-aa0c-40d9ea49f124
2026-04-14 23:00:53.621 | [RequestRouter] 代理请求失败 (http://localhost:3100/api/agent/workdir/list): 108 |     headers.set('X-Forwarded-For', 'localhost')
2026-04-14 23:00:53.621 | 109 |     headers.set('X-Proxy-Origin', 'claw-web-master')
2026-04-14 23:00:53.621 | 110 |     headers.set('Host', `localhost:${targetPort}`)
2026-04-14 23:00:53.621 | 111 | 
2026-04-14 23:00:53.621 | 112 |     // 转发请求
2026-04-14 23:00:53.621 | 113 |     const response = await fetch(targetUrl, {
2026-04-14 23:00:53.621 |                                  ^
2026-04-14 23:00:53.621 | error: Unable to connect. Is the computer able to access the url?
2026-04-14 23:00:53.621 |   path: "http://localhost:3100/api/agent/workdir/list",
2026-04-14 23:00:53.621 |  errno: 0,
2026-04-14 23:00:53.621 |   code: "ConnectionRefused"
2026-04-14 23:00:53.621 | 
2026-04-14 23:00:53.621 |       at async proxyToWorkerContainer (/app/src/server/httpServer.ts:113:28)
2026-04-14 23:00:53.621 |       at async fetch (/app/src/server/httpServer.ts:365:28)
2026-04-14 23:00:53.621 | 
2026-04-14 23:00:54.217 | [RequestRouter] 代理请求失败 (http://localhost:3100/api/auth/me): 108 |     headers.set('X-Forwarded-For', 'localhost')
2026-04-14 23:00:54.217 | 109 |     headers.set('X-Proxy-Origin', 'claw-web-master')
2026-04-14 23:00:54.217 | 110 |     headers.set('Host', `localhost:${targetPort}`)
2026-04-14 23:00:54.217 | 111 | 
2026-04-14 23:00:54.217 | 112 |     // 转发请求
2026-04-14 23:00:54.217 | 113 |     const response = await fetch(targetUrl, {
2026-04-14 23:00:54.217 |                                  ^
2026-04-14 23:00:54.217 | error: Unable to connect. Is the computer able to access the url?
2026-04-14 23:00:54.217 |   path: "http://localhost:3100/api/auth/me",
2026-04-14 23:00:54.217 |  errno: 0,
2026-04-14 23:00:54.217 |   code: "ConnectionRefused"
2026-04-14 23:00:54.217 | 
2026-04-14 23:00:54.217 |       at async proxyToWorkerContainer (/app/src/server/httpServer.ts:113:28)
2026-04-14 23:00:54.217 |       at async fetch (/app/src/server/httpServer.ts:365:28)
2026-04-14 23:00:54.217 | 
2026-04-14 23:00:55.155 | [WS] Message from aaf2b38b-ebb6-4147-a74f-cad3714c548c: pong
2026-04-14 23:00:55.155 | [WS] Message from 41b0d202-3dfa-4172-bce1-34f225ddd83d: pong
2026-04-14 23:00:55.206 | [RequestRouter] 代理请求失败 (http://localhost:3100/api/agent/session/effective-workspace): 108 |     headers.set('X-Forwarded-For', 'localhost')
2026-04-14 23:00:55.207 | 109 |     headers.set('X-Proxy-Origin', 'claw-web-master')
2026-04-14 23:00:55.207 | 110 |     headers.set('Host', `localhost:${targetPort}`)
2026-04-14 23:00:55.207 | 111 | 
2026-04-14 23:00:55.207 | 112 |     // 转发请求
2026-04-14 23:00:55.207 | 113 |     const response = await fetch(targetUrl, {
2026-04-14 23:00:55.207 |                                  ^
2026-04-14 23:00:55.207 | error: Unable to connect. Is the computer able to access the url?
2026-04-14 23:00:55.207 |   path: "http://localhost:3100/api/agent/session/effective-workspace",
2026-04-14 23:00:55.207 |  errno: 0,
2026-04-14 23:00:55.207 |   code: "ConnectionRefused"
2026-04-14 23:00:55.207 | 
2026-04-14 23:00:55.207 |       at async proxyToWorkerContainer (/app/src/server/httpServer.ts:113:28)
2026-04-14 23:00:55.207 |       at async fetch (/app/src/server/httpServer.ts:365:28)
2026-04-14 23:00:55.207 | 
2026-04-14 23:00:55.207 | [RequestRouter] 代理请求失败 (http://localhost:3100/api/agent/workdir/list): 108 |     headers.set('X-Forwarded-For', 'localhost')
2026-04-14 23:00:55.207 | 109 |     headers.set('X-Proxy-Origin', 'claw-web-master')
2026-04-14 23:00:55.207 | 110 |     headers.set('Host', `localhost:${targetPort}`)
2026-04-14 23:00:55.207 | 111 | 
2026-04-14 23:00:55.207 | 112 |     // 转发请求
2026-04-14 23:00:55.207 | 113 |     const response = await fetch(targetUrl, {
2026-04-14 23:00:55.207 |                                  ^
2026-04-14 23:00:55.207 | error: Unable to connect. Is the computer able to access the url?
2026-04-14 23:00:55.207 |   path: "http://localhost:3100/api/agent/workdir/list",
2026-04-14 23:00:55.207 |  errno: 0,
2026-04-14 23:00:55.207 |   code: "ConnectionRefused"
2026-04-14 23:00:55.207 | 
2026-04-14 23:00:55.207 |       at async proxyToWorkerContainer (/app/src/server/httpServer.ts:113:28)
2026-04-14 23:00:55.207 |       at async fetch (/app/src/server/httpServer.ts:365:28)
2026-04-14 23:00:55.207 | 
 * 调度结果
 */
export interface SchedulingResult {
  success: boolean
  container?: ContainerInstance
  mapping?: UserContainerMapping
  tier?: UserTier
  strategy?: string
  waitTimeMs?: number
  error?: string
  code?: string
  fallbackAction?: FallbackAction
}

/**
 * 降级行动
 */
export enum FallbackAction {
  QUEUE_REQUEST = 'queue_request',       // 排队等待
  REDUCE_RESOURCES = 'reduce_resources', // 降低资源配额
  RETURN_ERROR = 'return_error',         // 返回错误
  USE_SHARED_MODE = 'use_shared_mode'    // 回退到共享模式
}

/**
 * 资源状态快照
 */
export interface ResourceSnapshot {
  totalMemoryMB: number
  usedMemoryMB: number
  memoryUtilizationPercent: number
  activeContainers: number
  availableContainers: number
  queuedRequests: number
  timestamp: Date
}

// ==================== 默认等级配置 ====================

const DEFAULT_TIER_CONFIGS: Record<UserTier, TierConfig> = {
  [UserTier.VIP]: {
    allowExclusiveContainer: true,
    maxSessions: 20,
    storageQuotaMB: 2000,
    maxPtyProcesses: 10,
    idleTimeoutMs: 0,           // 永不回收
    priority: 1,
    rateLimitPerMinute: 1000,
    allowAdvancedFeatures: true
  },
  [UserTier.PREMIUM]: {
    allowExclusiveContainer: false,
    maxSessions: 15,
    storageQuotaMB: 1000,
    maxPtyProcesses: 8,
    idleTimeoutMs: 1800000,     // 30分钟
    priority: 2,
    rateLimitPerMinute: 500,
    allowAdvancedFeatures: true
  },
  [UserTier.REGULAR]: {
    allowExclusiveContainer: false,
    maxSessions: 10,
    storageQuotaMB: 500,
    maxPtyProcesses: 5,
    idleTimeoutMs: 300000,      // 5分钟
    priority: 3,
    rateLimitPerMinute: 200,
    allowAdvancedFeatures: false
  },
  [UserTier.TRIAL]: {
    allowExclusiveContainer: false,
    maxSessions: 3,
    storageQuotaMB: 200,
    maxPtyProcesses: 2,
    idleTimeoutMs: 120000,      // 2分钟
    priority: 4,
    rateLimitPerMinute: 50,
    allowAdvancedFeatures: false
  }
}

// ==================== SchedulingPolicy 类 ====================

class SchedulingPolicy {
  private tierConfigs: Record<UserTier, TierConfig>
  private requestQueue: Array<{
    userId: string
    username?: string
    tier: UserTier
    resolve: (result: SchedulingResult) => void
    reject: (error: Error) => void
    timestamp: Date
  }> = []
  private isProcessingQueue: boolean = false
  private resourceHistory: ResourceSnapshot[] = []

  constructor(customConfigs?: Partial<Record<UserTier, Partial<TierConfig>>>) {
    this.tierConfigs = this.mergeConfigs(DEFAULT_TIER_CONFIGS, customConfigs || {})
    console.log('[SchedulingPolicy] 初始化完成，等级配置已加载')
  }

  /**
   * 根据用户信息确定用户等级
   * @param userData 用户数据（包含角色、注册时间等）
   * @returns 用户等级
   */
  determineUserTier(userData: {
    role?: string
    email?: string
    createdAt?: Date
    subscriptionLevel?: string
    requestCount?: number
  }): UserTier {
    const role = userData.role?.toLowerCase()
    const subscription = userData.subscriptionLevel?.toLowerCase()

    // 超级管理员和管理员 -> VIP
    if (role === 'superadmin' || role === 'admin') {
      return UserTier.VIP
    }

    // 订阅等级判断
    if (subscription === 'vip' || subscription === 'enterprise') {
      return UserTier.VIP
    }
    if (subscription === 'premium' || subscription === 'pro') {
      return UserTier.PREMIUM
    }
    if (subscription === 'trial' || subscription === 'free') {
      return UserTier.TRIAL
    }

    // 默认普通用户
    return UserTier.REGULAR
  }

  /**
   * 执行智能调度（核心方法）
   * @param userId 用户ID
   * @param username 用户名
   * @param userData 用户数据（用于判断等级）
   * @returns 调度结果
   */
  async scheduleContainer(
    userId: string,
    username?: string,
    userData?: any
  ): Promise<SchedulingResult> {
    const startTime = Date.now()

    try {
      // 1. 确定用户等级
      const tier = this.determineUserTier(userData || {})
      const config = this.tierConfigs[tier]

      console.log(`[SchedulingPolicy] 开始调度: user=${userId}, tier=${tier}, priority=${config.priority}`)

      // 2. 检查当前系统资源状况
      const resourceStatus = await this.checkResourceStatus()

      // 3. 根据等级和资源状况选择策略
      let result: SchedulingResult

      if (tier === UserTier.VIP && config.allowExclusiveContainer) {
        // VIP用户：尝试独占容器
        result = await this.scheduleForVIP(userId, username, config)
      } else if (resourceStatus.availableContainers > 0) {
        // 有可用容器：直接分配
        result = await this.scheduleFromPool(userId, username, tier, config)
      } else if (resourceStatus.memoryUtilizationPercent < 85) {
        // 内存充足但无空闲容器：创建新容器
        result = await this.scheduleNewContainer(userId, username, tier, config)
      } else {
        // 资源紧张：执行降级策略
        result = await this.handleResourceExhaustion(userId, username, tier, config, resourceStatus)
      }

      // 计算等待时间
      result.waitTimeMs = Date.now() - startTime
      result.tier = tier

      console.log(
        `[SchedulingPolicy] 调度完成: user=${userId}, ` +
        `success=${result.success}, ` +
        `strategy=${result.strategy}, ` +
        `waitTime=${result.waitTimeMs}ms`
      )

      return result

    } catch (error) {
      console.error(`[SchedulingPolicy] 调度异常 (${userId}):`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '调度失败',
        code: 'SCHEDULING_ERROR'
      }
    }
  }

  /**
   * 将请求加入排队队列（当资源不足时）
   * @param userId 用户ID
   * @param username 用户名
   * @param tier 用户等级
   * @returns Promise，将在资源可用时resolve
   */
  enqueueRequest(
    userId: string,
    username?: string,
    tier: UserTier = UserTier.REGULAR
  ): Promise<SchedulingResult> {
    return new Promise((resolve, reject) => {
      const queueItem = {
        userId,
        username,
        tier,
        resolve,
        reject,
        timestamp: new Date()
      }

      // 按优先级插入队列（优先级高的在前）
      const insertIndex = this.requestQueue.findIndex(
        item => this.tierConfigs[item.tier].priority > this.tierConfigs[tier].priority
      )

      if (insertIndex === -1) {
        this.requestQueue.push(queueItem)
      } else {
        this.requestQueue.splice(insertIndex, 0, queueItem)
      }

      console.log(
        `[SchedulingPolicy] 请求已排队: user=${userId}, tier=${tier}, ` +
        `queuePosition=${this.requestQueue.indexOf(queueItem)}`
      )

      // 触发队列处理
      this.processQueueIfNeeded()
    })
  }

  /**
   * 获取当前队列状态
   */
  getQueueStatus(): {
    length: number
    byTier: Record<UserTier, number>
    oldestWaitTimeMs: number | null
  } {
    const byTier: Record<string, number> = {
      [UserTier.VIP]: 0,
      [UserTier.PREMIUM]: 0,
      [UserTier.REGULAR]: 0,
      [UserTier.TRIAL]: 0
    }

    for (const item of this.requestQueue) {
      byTier[item.tier]++
    }

    const oldestWaitTimeMs = this.requestQueue.length > 0
      ? Date.now() - this.requestQueue[0].timestamp.getTime()
      : null

    return {
      length: this.requestQueue.length,
      byTier: byTier as unknown as Record<UserTier, number>,
      oldestWaitTimeMs
    }
  }

  /**
   * 获取等级配置
   * @param tier 用户等级（可选，不传返回全部）
   */
  getTierConfig(tier?: UserTier): TierConfig | Record<UserTier, TierConfig> {
    if (tier) {
      return { ...this.tierConfigs[tier] }
    }
    return JSON.parse(JSON.stringify(this.tierConfigs))
  }

  /**
   * 更新等级配置（运行时动态调整）
   * @param tier 要更新的等级
   * @param updates 配置更新项
   */
  updateTierConfig(tier: UserTier, updates: Partial<TierConfig>): void {
    Object.assign(this.tierConfigs[tier], updates)
    console.log(`[SchedulingPolicy] 已更新 ${tier} 等级配置`)
  }

  // ==================== 私有调度策略方法 ====================

  /**
   * VIP用户调度策略（独占容器）
   */
  private async scheduleForVIP(
    userId: string,
    username: string | undefined,
    config: TierConfig
  ): Promise<SchedulingResult> {
    const orchestrator = getContainerOrchestrator()

    // 检查是否已有容器
    const existingMapping = orchestrator.getUserMapping(userId)
    if (existingMapping) {
      return {
        success: true,
        container: existingMapping.container,
        mapping: existingMapping,
        strategy: 'reuse_existing_vip'
      }
    }

    // 尝试获取或创建独占容器
    const assignResult = await orchestrator.assignContainerToUser(userId, username)

    if (!assignResult.success) {
      // VIP用户即使失败也尝试强制创建
      console.warn(`[SchedulingPolicy] VIP用户 ${userId} 分配失败，尝试备用方案`)

      // 可以选择排队等待或降低服务级别
      return {
        success: false,
        error: assignResult.error || '无法为VIP用户分配容器',
        code: 'VIP_ALLOCATION_FAILED',
        fallbackAction: FallbackAction.QUEUE_REQUEST
      }
    }

    return {
      success: true,
      container: assignResult.data!.container,
      mapping: assignResult.data!,
      strategy: 'exclusive_container'
    }
  }

  /**
   * 从热池分配容器
   */
  private async scheduleFromPool(
    userId: string,
    username: string | undefined,
    tier: UserTier,
    config: TierConfig
  ): Promise<SchedulingResult> {
    const orchestrator = getContainerOrchestrator()

    // 先检查是否已有映射
    const existingMapping = orchestrator.getUserMapping(userId)
    if (existingMapping) {
      return {
        success: true,
        container: existingMapping.container,
        mapping: existingMapping,
        strategy: 'reuse_existing'
      }
    }

    // 从热池获取
    const assignResult = await orchestrator.assignContainerToUser(userId, username)

    if (assignResult.success) {
      return {
        success: true,
        container: assignResult.data!.container,
        mapping: assignResult.data!,
        strategy: 'from_warm_pool'
      }
    }

    // 热池分配失败，尝试创建新容器
    return this.scheduleNewContainer(userId, username, tier, config)
  }

  /**
   * 创建新容器
   */
  private async scheduleNewContainer(
    userId: string,
    username: string | undefined,
    tier: UserTier,
    config: TierConfig
  ): Promise<SchedulingResult> {
    const orchestrator = getContainerOrchestrator()

    const assignResult = await orchestrator.assignContainerToUser(userId, username)

    if (assignResult.success) {
      return {
        success: true,
        container: assignResult.data!.container,
        mapping: assignResult.data!,
        strategy: 'new_container_created'
      }
    }

    // 创建失败，执行降级
    return {
      success: false,
      error: '无法创建新容器，资源可能已耗尽',
      code: 'CONTAINER_CREATION_FAILED',
      fallbackAction: this.determineFallbackAction(tier)
    }
  }

  /**
   * 处理资源耗尽情况
   */
  private async handleResourceExhaustion(
    userId: string,
    username: string | undefined,
    tier: UserTier,
    config: TierConfig,
    resourceStatus: ResourceSnapshot
  ): Promise<SchedulingResult> {
    console.warn(
      `[SchedulingPolicy] 资源紧张: memory=${resourceStatus.memoryUtilizationPercent}%, ` +
      `available=${resourceStatus.availableContainers}`
    )

    const fallbackAction = this.determineFallbackAction(tier)

    switch (fallbackAction) {
      case FallbackAction.QUEUE_REQUEST:
        console.log(`[SchedulingPolicy] 将用户 ${userId} 加入等待队列`)
        return this.enqueueRequest(userId, username, tier)

      case FallbackAction.REDUCE_RESOURCES:
        // 尝试回收低优先级的空闲容器后重试一次
        console.log(`[SchedulingPolicy] 尝试回收资源后重新调度`)
        const orchestrator = getContainerOrchestrator()
        // 这里可以添加具体的回收逻辑
        const retryResult = await orchestrator.assignContainerToUser(userId, username)
        if (retryResult.success) {
          return {
            success: true,
            container: retryResult.data!.container,
            mapping: retryResult.data!,
            strategy: 'after_resource_recovery'
          }
        }
        break

      case FallbackAction.USE_SHARED_MODE:
        // 回退到共享模式（如果支持的话）
        console.log(`[SchedulingPolicy] 用户 ${userId} 回退到共享模式`)
        return {
          success: false,
          error: '当前负载较高，建议稍后再试',
          code: 'HIGH_LOAD_FALLBACK',
          fallbackAction: FallbackAction.RETURN_ERROR
        }

      case FallbackAction.RETURN_ERROR:
      default:
        return {
          success: false,
          error: '服务器当前繁忙，请稍后再试',
          code: 'SERVER_BUSY',
          fallbackAction
        }
    }

    return {
      success: false,
      error: '资源不足且无法降级',
      code: 'RESOURCE_EXHAUSTED',
      fallbackAction: FallbackAction.RETURN_ERROR
    }
  }

  /**
   * 确定降级行动
   */
  private determineFallbackAction(tier: UserTier): FallbackAction {
    switch (tier) {
      case UserTier.VIP:
        return FallbackAction.QUEUE_REQUEST  // VIP用户排队等待
      case UserTier.PREMIUM:
        return FallbackAction.REDUCE_RESOURCES  // 尝试回收资源
      case UserTier.REGULAR:
        return FallbackAction.QUEUE_REQUEST  // 普通用户排队
      case UserTier.TRIAL:
        return FallbackAction.RETURN_ERROR  // 试用用户直接拒绝
      default:
        return FallbackAction.RETURN_ERROR
    }
  }

  /**
   * 检查当前资源状态
   */
  private async checkResourceStatus(): Promise<ResourceSnapshot> {
    const orchestrator = getContainerOrchestrator()
    const poolStats = orchestrator.getPoolStatus()

    // 模拟内存统计（实际应从系统API获取）
    const totalMemoryMB = 16384  // 假设16GB总内存
    const usedMemoryMB = Math.round(totalMemoryMB * (0.5 + poolStats.activeUsers * 0.02))

    const snapshot: ResourceSnapshot = {
      totalMemoryMB,
      usedMemoryMB,
      memoryUtilizationPercent: Math.round((usedMemoryMB / totalMemoryMB) * 10000) / 100,
      activeContainers: poolStats.activeUsers,
      availableContainers: poolStats.idleContainers,
      queuedRequests: this.requestQueue.length,
      timestamp: new Date()
    }

    // 保存历史记录（保留最近100条）
    this.resourceHistory.push(snapshot)
    if (this.resourceHistory.length > 100) {
      this.resourceHistory.shift()
    }

    return snapshot
  }

  /**
   * 处理排队队列
   */
  private async processQueueIfNeeded(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return
    }

    this.isProcessingQueue = true
    console.log('[SchedulingPolicy] 开始处理排队队列...')

    try {
      while (this.requestQueue.length > 0) {
        const nextRequest = this.requestQueue[0]
        const resourceStatus = await this.checkResourceStatus()

        // 检查是否有足够资源
        if (resourceStatus.availableContainers > 0 ||
            resourceStatus.memoryUtilizationPercent < 85) {

          // 从队列中移除
          this.requestQueue.shift()

          // 尝试调度
          try {
            const result = await this.scheduleContainer(
              nextRequest.userId,
              nextRequest.username,
              { /* 使用缓存的用户数据 */ }
            )
            nextRequest.resolve(result)
          } catch (error) {
            nextRequest.reject(error as Error)
          }
        } else {
          // 资源仍然不足，停止处理
          console.log('[SchedulingPolicy] 队列处理暂停：资源不足')
          break
        }
      }
    } finally {
      this.isProcessingQueue = false
    }
  }

  /**
   * 合并配置
   */
  private mergeConfigs(
    base: Record<UserTier, TierConfig>,
    custom: Partial<Record<UserTier, Partial<TierConfig>>>
  ): Record<UserTier, TierConfig> {
    const merged = { ...base }
    for (const [tier, customConfig] of Object.entries(custom)) {
      if (customConfig && tier in merged) {
        merged[tier as UserTier] = { ...merged[tier as UserTier], ...customConfig }
      }
    }
    return merged
  }
}

// ==================== 单例模式 ====================

let schedulingPolicy: SchedulingPolicy | null = null

/**
 * 获取SchedulingPolicy单例实例
 * @param customConfigs 可选的自定义等级配置
 * @returns 调度策略实例
 */
export function getSchedulingPolicy(customConfigs?: Partial<Record<UserTier, Partial<TierConfig>>>): SchedulingPolicy {
  if (!schedulingPolicy) {
    schedulingPolicy = new SchedulingPolicy(customConfigs)
  }
  return schedulingPolicy
}

export default SchedulingPolicy

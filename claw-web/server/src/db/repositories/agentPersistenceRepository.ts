/**
 * Agent 持久化 Repository
 * 
 * 提供 Agent 相关数据的数据库持久化操作
 */

import { getPool } from '../mysql'

/**
 * Agent 实例数据
 */
export interface PersistedAgentInstance {
  id: string
  agentType: string
  status: 'created' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled'
  parentAgentId?: string
  teamName?: string
  memberName?: string
  result?: string
  error?: string
  createdAt: Date
  updatedAt: Date
  lastActivityAt: Date
}

/**
 * Agent 消息数据
 */
export interface PersistedAgentMessage {
  id: string
  agentId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  fromAgentId?: string
  timestamp: Date
}

/**
 * Mailbox 消息数据
 */
export interface PersistedMailboxMessage {
  id: string
  fromAgentId: string
  toAgentId: string
  content: string
  threadId?: string
  isRead: boolean
  timestamp: Date
}

/**
 * 团队数据
 */
export interface PersistedTeam {
  id: string
  teamName: string
  description?: string
  orchestratorType?: string
  orchestratorAgentId?: string
  overallStatus: 'created' | 'initializing' | 'ready' | 'executing' | 'completed' | 'failed'
  createdAt: Date
  updatedAt: Date
}

/**
 * 团队成员数据
 */
export interface PersistedTeamMember {
  id: string
  teamId: string
  memberName: string
  agentType: string
  agentId?: string
  role: 'orchestrator' | 'worker' | 'reviewer' | 'specialist'
  status: 'idle' | 'assigned' | 'working' | 'completed' | 'blocked' | 'failed'
  currentTask?: string
  skills: string[]
  createdAt: Date
  updatedAt: Date
}

/**
 * 团队任务数据
 */
export interface PersistedTeamTask {
  id: string
  teamId: string
  title: string
  description?: string
  assignedTo?: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  priority: number
  result?: string
  error?: string
  dependsOn?: string[]
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
}

/**
 * 隔离上下文数据
 */
export interface PersistedIsolationContext {
  id: string
  name: string
  mode: 'worktree' | 'remote'
  description?: string
  workingDirectory?: string
  environment?: Record<string, string>
  maxMemory?: number
  maxCpu?: number
  timeout?: number
  cleanupPolicy: 'immediate' | 'delayed' | 'manual'
  worktreeConfig?: Record<string, unknown>
  remoteConfig?: Record<string, unknown>
  status: 'initializing' | 'ready' | 'running' | 'paused' | 'terminated' | 'error'
  executionCount: number
  totalDuration: number
  createdAt: Date
  updatedAt: Date
  lastActivityAt: Date
}

/**
 * Agent 持久化 Repository 类
 */
export class AgentPersistenceRepository {
  /**
   * 保存 Agent 实例
   */
  async saveAgentInstance(data: PersistedAgentInstance): Promise<void> {
    const pool = getPool()
    await pool.query(
      `INSERT INTO agent_instances 
       (id, agent_type, status, parent_agent_id, team_name, member_name, result, error, created_at, updated_at, last_activity_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       team_name = VALUES(team_name),
       member_name = VALUES(member_name),
       result = VALUES(result),
       error = VALUES(error),
       updated_at = VALUES(updated_at),
       last_activity_at = VALUES(last_activity_at)`,
      [
        data.id,
        data.agentType,
        data.status,
        data.parentAgentId || null,
        data.teamName || null,
        data.memberName || null,
        data.result || null,
        data.error || null,
        data.createdAt,
        data.updatedAt,
        data.lastActivityAt
      ]
    )
  }

  /**
   * 获取所有未完成的 Agent 实例
   */
  async getActiveAgentInstances(): Promise<PersistedAgentInstance[]> {
    const pool = getPool()
    const [rows] = await pool.query(
      `SELECT * FROM agent_instances 
       WHERE status IN ('created', 'running', 'waiting')
       ORDER BY created_at DESC`
    ) as [PersistedAgentInstance[], unknown]
    return rows.map(this.mapToAgentInstance)
  }

  /**
   * 获取 Agent 实例的消息历史
   */
  async getAgentMessages(agentId: string): Promise<PersistedAgentMessage[]> {
    const pool = getPool()
    const [rows] = await pool.query(
      `SELECT * FROM agent_messages 
       WHERE agent_id = ?
       ORDER BY timestamp ASC`,
      [agentId]
    ) as [PersistedAgentMessage[], unknown]
    return rows.map(this.mapToAgentMessage)
  }

  /**
   * 保存 Agent 消息
   */
  async saveAgentMessage(data: PersistedAgentMessage): Promise<void> {
    const pool = getPool()
    await pool.query(
      `INSERT INTO agent_messages (id, agent_id, role, content, from_agent_id, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.id, data.agentId, data.role, data.content, data.fromAgentId || null, data.timestamp]
    )
  }

  /**
   * 批量保存 Agent 消息
   */
  async saveAgentMessagesBatch(messages: PersistedAgentMessage[]): Promise<void> {
    if (messages.length === 0) return
    const pool = getPool()
    const values = messages.map(m => [m.id, m.agentId, m.role, m.content, m.fromAgentId || null, m.timestamp])
    await pool.query(
      `INSERT INTO agent_messages (id, agent_id, role, content, from_agent_id, timestamp) VALUES ?`,
      [values]
    )
  }

  /**
   * 保存 Mailbox 消息
   */
  async saveMailboxMessage(data: PersistedMailboxMessage): Promise<void> {
    const pool = getPool()
    await pool.query(
      `INSERT INTO agent_mailbox_messages (id, from_agent_id, to_agent_id, content, thread_id, is_read, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.id, data.fromAgentId, data.toAgentId, data.content, data.threadId || null, data.isRead, data.timestamp]
    )
  }

  /**
   * 获取 Agent 的 Mailbox 消息
   */
  async getMailboxMessages(toAgentId: string, limit: number = 100): Promise<PersistedMailboxMessage[]> {
    const pool = getPool()
    const [rows] = await pool.query(
      `SELECT * FROM agent_mailbox_messages 
       WHERE to_agent_id = ? AND is_read = FALSE
       ORDER BY timestamp DESC
       LIMIT ?`,
      [toAgentId, limit]
    ) as [PersistedMailboxMessage[], unknown]
    return rows.map(this.mapToMailboxMessage)
  }

  /**
   * 标记 Mailbox 消息为已读
   */
  async markMailboxMessageAsRead(messageId: string): Promise<void> {
    const pool = getPool()
    await pool.query(
      `UPDATE agent_mailbox_messages SET is_read = TRUE WHERE id = ?`,
      [messageId]
    )
  }

  /**
   * 保存团队
   */
  async saveTeam(data: PersistedTeam): Promise<void> {
    const pool = getPool()
    await pool.query(
      `INSERT INTO agent_teams 
       (id, team_name, description, orchestrator_type, orchestrator_agent_id, overall_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       description = VALUES(description),
       orchestrator_agent_id = VALUES(orchestrator_agent_id),
       overall_status = VALUES(overall_status),
       updated_at = VALUES(updated_at)`,
      [
        data.id,
        data.teamName,
        data.description || null,
        data.orchestratorType || null,
        data.orchestratorAgentId || null,
        data.overallStatus,
        data.createdAt,
        data.updatedAt
      ]
    )
  }

  /**
   * 获取所有活跃团队
   */
  async getActiveTeams(): Promise<PersistedTeam[]> {
    const pool = getPool()
    const [rows] = await pool.query(
      `SELECT * FROM agent_teams 
       WHERE overall_status NOT IN ('completed', 'failed')
       ORDER BY created_at DESC`
    ) as [PersistedTeam[], unknown]
    return rows.map(this.mapToTeam)
  }

  /**
   * 保存团队成员
   */
  async saveTeamMember(data: PersistedTeamMember): Promise<void> {
    const pool = getPool()
    await pool.query(
      `INSERT INTO agent_team_members 
       (id, team_id, member_name, agent_type, agent_id, role, status, current_task, skills, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       agent_id = VALUES(agent_id),
       status = VALUES(status),
       current_task = VALUES(current_task),
       skills = VALUES(skills),
       updated_at = VALUES(updated_at)`,
      [
        data.id,
        data.teamId,
        data.memberName,
        data.agentType,
        data.agentId || null,
        data.role,
        data.status,
        data.currentTask || null,
        JSON.stringify(data.skills),
        data.createdAt,
        data.updatedAt
      ]
    )
  }

  /**
   * 获取团队成员
   */
  async getTeamMembers(teamId: string): Promise<PersistedTeamMember[]> {
    const pool = getPool()
    const [rows] = await pool.query(
      `SELECT * FROM agent_team_members WHERE team_id = ?`,
      [teamId]
    ) as [PersistedTeamMember[], unknown]
    return rows.map(this.mapToTeamMember)
  }

  /**
   * 保存团队任务
   */
  async saveTeamTask(data: PersistedTeamTask): Promise<void> {
    const pool = getPool()
    await pool.query(
      `INSERT INTO agent_team_tasks 
       (id, team_id, title, description, assigned_to, status, priority, result, error, depends_on, created_at, started_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       assigned_to = VALUES(assigned_to),
       status = VALUES(status),
       result = VALUES(result),
       error = VALUES(error),
       started_at = VALUES(started_at),
       completed_at = VALUES(completed_at)`,
      [
        data.id,
        data.teamId,
        data.title,
        data.description || null,
        data.assignedTo || null,
        data.status,
        data.priority,
        data.result || null,
        data.error || null,
        data.dependsOn ? JSON.stringify(data.dependsOn) : null,
        data.createdAt,
        data.startedAt || null,
        data.completedAt || null
      ]
    )
  }

  /**
   * 获取团队任务
   */
  async getTeamTasks(teamId: string): Promise<PersistedTeamTask[]> {
    const pool = getPool()
    const [rows] = await pool.query(
      `SELECT * FROM agent_team_tasks WHERE team_id = ? ORDER BY priority DESC`,
      [teamId]
    ) as [PersistedTeamTask[], unknown]
    return rows.map(this.mapToTeamTask)
  }

  /**
   * 保存隔离上下文
   */
  async saveIsolationContext(data: PersistedIsolationContext): Promise<void> {
    const pool = getPool()
    await pool.query(
      `INSERT INTO agent_isolation_contexts 
       (id, name, mode, description, working_directory, environment, max_memory, max_cpu, timeout, cleanup_policy, 
        worktree_config, remote_config, status, execution_count, total_duration, created_at, updated_at, last_activity_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       execution_count = VALUES(execution_count),
       total_duration = VALUES(total_duration),
       updated_at = VALUES(updated_at),
       last_activity_at = VALUES(last_activity_at)`,
      [
        data.id,
        data.name,
        data.mode,
        data.description || null,
        data.workingDirectory || null,
        data.environment ? JSON.stringify(data.environment) : null,
        data.maxMemory || null,
        data.maxCpu || null,
        data.timeout || null,
        data.cleanupPolicy,
        data.worktreeConfig ? JSON.stringify(data.worktreeConfig) : null,
        data.remoteConfig ? JSON.stringify(data.remoteConfig) : null,
        data.status,
        data.executionCount,
        data.totalDuration,
        data.createdAt,
        data.updatedAt,
        data.lastActivityAt
      ]
    )
  }

  /**
   * 获取活跃的隔离上下文
   */
  async getActiveIsolationContexts(): Promise<PersistedIsolationContext[]> {
    const pool = getPool()
    const [rows] = await pool.query(
      `SELECT * FROM agent_isolation_contexts 
       WHERE status NOT IN ('terminated')
       ORDER BY created_at DESC`
    ) as [PersistedIsolationContext[], unknown]
    return rows.map(this.mapToIsolationContext)
  }

  /**
   * 删除 Agent 实例
   */
  async deleteAgentInstance(agentId: string): Promise<void> {
    const pool = getPool()
    await pool.query(`DELETE FROM agent_instances WHERE id = ?`, [agentId])
  }

  /**
   * 删除团队
   */
  async deleteTeam(teamId: string): Promise<void> {
    const pool = getPool()
    await pool.query(`DELETE FROM agent_teams WHERE id = ?`, [teamId])
  }

  /**
   * 删除隔离上下文
   */
  async deleteIsolationContext(isolationId: string): Promise<void> {
    const pool = getPool()
    await pool.query(`DELETE FROM agent_isolation_contexts WHERE id = ?`, [isolationId])
  }

  // ==================== 私有映射方法 ====================

  private mapToAgentInstance(row: any): PersistedAgentInstance {
    return {
      id: row.id,
      agentType: row.agent_type,
      status: row.status,
      parentAgentId: row.parent_agent_id,
      teamName: row.team_name,
      memberName: row.member_name,
      result: row.result,
      error: row.error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastActivityAt: row.last_activity_at
    }
  }

  private mapToAgentMessage(row: any): PersistedAgentMessage {
    return {
      id: row.id,
      agentId: row.agent_id,
      role: row.role,
      content: row.content,
      fromAgentId: row.from_agent_id,
      timestamp: row.timestamp
    }
  }

  private mapToMailboxMessage(row: any): PersistedMailboxMessage {
    return {
      id: row.id,
      fromAgentId: row.from_agent_id,
      toAgentId: row.to_agent_id,
      content: row.content,
      threadId: row.thread_id,
      isRead: row.is_read,
      timestamp: row.timestamp
    }
  }

  private mapToTeam(row: any): PersistedTeam {
    return {
      id: row.id,
      teamName: row.team_name,
      description: row.description,
      orchestratorType: row.orchestrator_type,
      orchestratorAgentId: row.orchestrator_agent_id,
      overallStatus: row.overall_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  private mapToTeamMember(row: any): PersistedTeamMember {
    return {
      id: row.id,
      teamId: row.team_id,
      memberName: row.member_name,
      agentType: row.agent_type,
      agentId: row.agent_id,
      role: row.role,
      status: row.status,
      currentTask: row.current_task,
      skills: row.skills ? JSON.parse(row.skills) : [],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  private mapToTeamTask(row: any): PersistedTeamTask {
    return {
      id: row.id,
      teamId: row.team_id,
      title: row.title,
      description: row.description,
      assignedTo: row.assigned_to,
      status: row.status,
      priority: row.priority,
      result: row.result,
      error: row.error,
      dependsOn: row.depends_on ? JSON.parse(row.depends_on) : undefined,
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at
    }
  }

  private mapToIsolationContext(row: any): PersistedIsolationContext {
    return {
      id: row.id,
      name: row.name,
      mode: row.mode,
      description: row.description,
      workingDirectory: row.working_directory,
      environment: row.environment ? JSON.parse(row.environment) : undefined,
      maxMemory: row.max_memory,
      maxCpu: row.max_cpu,
      timeout: row.timeout,
      cleanupPolicy: row.cleanup_policy,
      worktreeConfig: row.worktree_config ? JSON.parse(row.worktree_config) : undefined,
      remoteConfig: row.remote_config ? JSON.parse(row.remote_config) : undefined,
      status: row.status,
      executionCount: row.execution_count,
      totalDuration: row.total_duration,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastActivityAt: row.last_activity_at
    }
  }
}

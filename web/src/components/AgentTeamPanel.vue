<script setup lang="ts">
/**
 * AgentTeamPanel - 多 Agent 团队拓扑可视化组件
 * 
 * 功能：
 * - 展示 Agent 团队的层级结构
 * - 显示各 Agent 的实时状态
 * - 支持点击查看 Agent 详情
 * - 显示团队成员进度
 */

import { computed, ref } from 'vue'
import { NCard, NTag, NButton, NTooltip, NProgress, NEmpty, NSwitch } from 'naive-ui'
import type { TeamTopology, TeamMember } from '@/types/agentWorkflow'
import { useAgentStore } from '@/stores/agent'

// Props
interface Props {
  team?: TeamTopology | null
  showProgress?: boolean
  compact?: boolean
  autoRefresh?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showProgress: true,
  compact: false,
  autoRefresh: true
})

const emit = defineEmits<{
  (e: 'member-click', member: TeamMember): void
  (e: 'send-message', agentId: string): void
}>()

const agentStore = useAgentStore()

// 状态配置
const statusConfig = {
  IDLE: { color: '#666', label: '空闲', icon: '💤' },
  THINKING: { color: '#18a058', label: '思考中', icon: '🤔' },
  RUNNING: { color: '#2080f0', label: '运行中', icon: '⚡' },
  WAITING: { color: '#f0a020', label: '等待中', icon: '⏳' },
  BLOCKED: { color: '#d03050', label: '已阻塞', icon: '🚫' },
  COMPLETED: { color: '#18a058', label: '已完成', icon: '✅' },
  FAILED: { color: '#d03050', label: '失败', icon: '❌' }
}

// 角色图标
const roleIcons: Record<string, string> = {
  orchestrator: '🎯',
  planner: '📋',
  explorer: '🔍',
  coder: '💻',
  tester: '🧪',
  verifier: '✅',
  default: '🤖'
}

// 团队成员映射
const teamMembers = computed(() => {
  if (props.team?.members) {
    return props.team.members
  }
  
  // 从 store 获取
  const currentTraceId = agentStore.currentTraceId
  if (!currentTraceId) return []
  
  const agents = agentStore.agents.get(currentTraceId)
  if (!agents) return []
  
  return Array.from(agents.values()).map(agent => ({
    agentId: agent.agentId,
    name: agent.name,
    role: agent.description || 'member',
    type: agent.agentType || 'general-purpose',
    status: agent.status,
    parentId: agent.parentAgentId,
    children: [],
    progress: calculateProgress(agent),
    isActive: agent.status === 'RUNNING' || agent.status === 'THINKING'
  }))
})

// 计算进度
function calculateProgress(agent: typeof teamMembers.value[0]): number {
  if (agent.status === 'COMPLETED') return 100
  if (agent.status === 'FAILED') return 0
  
  const totalSteps = agent.workflowSteps?.length || 0
  if (totalSteps === 0) return 0
  
  const completedSteps = agent.workflowSteps?.filter(s => s.status === 'COMPLETED').length || 0
  return Math.round((completedSteps / totalSteps) * 100)
}

// 根 Agent（协调者）
const orchestrator = computed(() => {
  if (props.team?.orchestratorId) {
    return teamMembers.value.find(m => m.agentId === props.team?.orchestratorId)
  }
  return teamMembers.value.find(m => !m.parentId)
})

// 子 Agent 列表
const childAgents = computed(() => {
  if (!orchestrator.value) return teamMembers.value
  return teamMembers.value.filter(m => m.parentId === orchestrator.value?.agentId)
})

// 获取成员状态配置
function getStatusConfig(status: string) {
  return statusConfig[status as keyof typeof statusConfig] || statusConfig.IDLE
}

// 获取角色图标
function getRoleIcon(role: string): string {
  const normalizedRole = role.toLowerCase()
  if (normalizedRole.includes('orchestrat')) return roleIcons.orchestrator
  if (normalizedRole.includes('plan')) return roleIcons.planner
  if (normalizedRole.includes('explor')) return roleIcons.explorer
  if (normalizedRole.includes('code')) return roleIcons.coder
  if (normalizedRole.includes('test')) return roleIcons.tester
  if (normalizedRole.includes('verif')) return roleIcons.verifier
  return roleIcons.default
}

// 处理成员点击
function handleMemberClick(member: TeamMember) {
  emit('member-click', member)
}

// 处理发送消息
function handleSendMessage(agentId: string) {
  emit('send-message', agentId)
}

// 展开状态
const expandedMembers = ref<Set<string>>(new Set())

function toggleExpand(memberId: string) {
  if (expandedMembers.value.has(memberId)) {
    expandedMembers.value.delete(memberId)
  } else {
    expandedMembers.value.add(memberId)
  }
}

function isExpanded(memberId: string): boolean {
  return expandedMembers.value.has(memberId)
}

// 团队统计
const teamStats = computed(() => {
  const members = teamMembers.value
  return {
    total: members.length,
    active: members.filter(m => m.isActive).length,
    completed: members.filter(m => m.status === 'COMPLETED').length,
    failed: members.filter(m => m.status === 'FAILED').length
  }
})
</script>

<template>
  <div class="agent-team-panel" :class="{ compact }">
    <!-- 团队头部 -->
    <div v-if="!compact" class="team-header">
      <div class="team-info">
        <span class="team-icon">👥</span>
        <span class="team-name">{{ team?.name || 'Agent 团队' }}</span>
      </div>
      
      <!-- 团队统计 -->
      <div class="team-stats">
        <NTag size="small" :bordered="false">
          {{ teamStats.total }} 成员
        </NTag>
        <NTag size="small" type="info" :bordered="false">
          {{ teamStats.active }} 活跃
        </NTag>
        <NTag size="small" type="success" :bordered="false">
          {{ teamStats.completed }} 完成
        </NTag>
      </div>
    </div>
    
    <!-- 团队为空 -->
    <NEmpty v-if="teamMembers.length === 0" description="暂无团队成员" class="empty-state">
      <template #icon>
        <span class="empty-icon">🤖</span>
      </template>
    </NEmpty>
    
    <!-- 团队成员列表 -->
    <div v-else class="team-members">
      <!-- 协调者（根节点） -->
      <div v-if="orchestrator" class="member orchestrator">
        <div class="member-card root" @click="handleMemberClick(orchestrator)">
          <div class="member-header">
            <span class="member-icon">{{ getRoleIcon(orchestrator.role) }}</span>
            <div class="member-info">
              <span class="member-name">{{ orchestrator.name }}</span>
              <span class="member-role">协调者</span>
            </div>
            <div 
              class="member-status"
              :style="{ color: getStatusConfig(orchestrator.status).color }"
            >
              <span class="status-icon">{{ getStatusConfig(orchestrator.status).icon }}</span>
              <NTag size="tiny" :bordered="false">
                {{ getStatusConfig(orchestrator.status).label }}
              </NTag>
            </div>
          </div>
          
          <!-- 进度条 -->
          <div v-if="showProgress" class="member-progress">
            <NProgress
              type="line"
              :percentage="orchestrator.progress"
              :show-indicator="false"
              :height="4"
              :border-radius="2"
              :fill-border-radius="2"
              :color="getStatusConfig(orchestrator.status).color"
            />
            <span class="progress-text">{{ orchestrator.progress }}%</span>
          </div>
          
          <!-- 操作按钮 -->
          <div class="member-actions">
            <NTooltip trigger="hover">
              <template #trigger>
                <NButton size="tiny" quaternary @click.stop="handleSendMessage(orchestrator.agentId)">
                  发送消息
                </NButton>
              </template>
              向此 Agent 发送消息
            </NTooltip>
          </div>
        </div>
      </div>
      
      <!-- 连接线 -->
      <div v-if="childAgents.length > 0" class="connector">
        <div class="connector-line"></div>
        <div class="connector-branch" v-for="i in childAgents.length" :key="i"></div>
      </div>
      
      <!-- 子 Agent -->
      <div class="sub-agents">
        <div 
          v-for="member in childAgents" 
          :key="member.agentId"
          class="member"
          :class="{ expanded: isExpanded(member.agentId) }"
        >
          <div class="member-card" @click="handleMemberClick(member)">
            <div class="member-header">
              <span class="member-icon">{{ getRoleIcon(member.role) }}</span>
              <div class="member-info">
                <span class="member-name">{{ member.name }}</span>
                <span class="member-role">{{ member.role }}</span>
              </div>
              <div 
                class="member-status"
                :style="{ color: getStatusConfig(member.status).color }"
              >
                <span class="status-icon">{{ getStatusConfig(member.status).icon }}</span>
                <NTag size="tiny" :bordered="false">
                  {{ getStatusConfig(member.status).label }}
                </NTag>
              </div>
            </div>
            
            <!-- 进度条 -->
            <div v-if="showProgress" class="member-progress">
              <NProgress
                type="line"
                :percentage="member.progress"
                :show-indicator="false"
                :height="4"
                :border-radius="2"
                :fill-border-radius="2"
                :color="getStatusConfig(member.status).color"
              />
              <span class="progress-text">{{ member.progress }}%</span>
            </div>
            
            <!-- 展开按钮 -->
            <button 
              v-if="member.children && member.children.length > 0"
              class="expand-toggle"
              @click.stop="toggleExpand(member.agentId)"
            >
              {{ isExpanded(member.agentId) ? '▼' : '▶' }}
              {{ member.children.length }} 子任务
            </button>
          </div>
          
          <!-- 展开的子成员 -->
          <div v-if="isExpanded(member.agentId) && member.children" class="nested-members">
            <div v-for="childId in member.children" :key="childId" class="nested-member">
              <!-- 递归显示子成员 -->
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 团队操作 -->
    <div v-if="!compact && teamMembers.length > 0" class="team-actions">
      <NButton size="small" secondary @click="agentStore.refreshBackgroundTasks?.()">
        刷新状态
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.agent-team-panel {
  --card-bg: var(--card-color, #1a1a1a);
  --border-color: var(--border-color, #3b3b3b);
  --text-color: var(--text-color, #fff);
  --text-color-2: var(--text-color-2, #ccc);
  --text-color-3: var(--text-color-3, #999);
  
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.agent-team-panel.compact {
  gap: 8px;
}

/* 团队头部 */
.team-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.team-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.team-icon {
  font-size: 20px;
}

.team-name {
  font-weight: 600;
  font-size: 16px;
  color: var(--text-color);
}

.team-stats {
  display: flex;
  gap: 6px;
}

/* 空状态 */
.empty-state {
  padding: 24px;
}

.empty-icon {
  font-size: 48px;
}

/* 成员列表 */
.team-members {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 成员卡片 */
.member-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.member-card:hover {
  border-color: var(--primary-color, #18a058);
  background: var(--fill-color-hover, #252525);
}

.member-card.root {
  border-color: var(--primary-color, #18a058);
  background: linear-gradient(135deg, rgba(24, 160, 88, 0.05), transparent);
}

.member-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.member-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.member-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.member-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-role {
  font-size: 11px;
  color: var(--text-color-3);
}

.member-status {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.status-icon {
  font-size: 12px;
}

/* 进度条 */
.member-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.progress-text {
  font-size: 11px;
  color: var(--text-color-3);
  min-width: 32px;
  text-align: right;
}

/* 操作按钮 */
.member-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--border-color);
}

/* 展开按钮 */
.expand-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  padding: 4px 8px;
  font-size: 11px;
  color: var(--text-color-3);
  background: var(--fill-color, #2a2a2a);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.expand-toggle:hover {
  background: var(--fill-color-hover, #333);
  color: var(--text-color-2);
}

/* 连接线 */
.connector {
  display: flex;
  padding-left: 24px;
  gap: 0;
}

.connector-line {
  width: 2px;
  height: 16px;
  background: var(--border-color);
  margin-left: 19px;
}

/* 子 Agent */
.sub-agents {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 24px;
  border-left: 2px solid var(--border-color);
  margin-left: 11px;
}

/* 嵌套成员 */
.nested-members {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 24px;
  margin-top: 8px;
}

/* 团队操作 */
.team-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}
</style>

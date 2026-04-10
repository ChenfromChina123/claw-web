/**
 * Feature Flag 配置
 * 支持新旧代码双轨运行，可动态切换
 */

interface FeatureConfig {
  enabled: boolean
  rollOutPercent: number  // 0-100，灰度发布比例
  description: string
  fallback?: string       // 降级方案
}

const FEATURE_FLAGS: Record<string, FeatureConfig> = {
  // MCP 网关
  'mcp.new.gateway': {
    enabled: false,
    rollOutPercent: 0,
    description: '使用新的 MCP 网关替代旧桥接',
  },
  
  // 命令处理器
  'commands.hybrid.processor': {
    enabled: false,
    rollOutPercent: 0,
    description: '使用混合命令处理器',
  },
  
  // 工具执行器
  'tools.new.executor': {
    enabled: false,
    rollOutPercent: 0,
    description: '使用新工具执行器',
  },
  
  // OAuth 认证
  'oauth.enhanced.flow': {
    enabled: false,
    rollOutPercent: 0,
    description: '使用增强的 OAuth 认证流程',
  },
}

/**
 * 检查特性是否启用
 */
export function isFeatureEnabled(
  featureName: string, 
  context?: { userId?: string; sessionId?: string }
): boolean {
  const config = FEATURE_FLAGS[featureName]
  if (!config || !config.enabled) {
    return false
  }
  
  // 灰度发布逻辑
  if (config.rollOutPercent < 100) {
    const hash = hashContext(context)
    return (hash % 100) < config.rollOutPercent
  }
  
  return true
}

/**
 * 获取特性配置
 */
export function getFeatureConfig(featureName: string): FeatureConfig | null {
  return FEATURE_FLAGS[featureName] || null
}

/**
 * 简单的哈希函数（用于灰度发布）
 */
function hashContext(context?: { userId?: string; sessionId?: string }): number {
  const str = context?.userId || context?.sessionId || 'default'
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

/**
 * 从环境变量读取配置（支持运行时切换）
 */
function loadFeatureFlagsFromEnv(): void {
  for (const [name, config] of Object.entries(FEATURE_FLAGS)) {
    const envEnabled = process.env[`FEATURE_${name.replace(/\./g, '_').toUpperCase()}_ENABLED`]
    const envRollOut = process.env[`FEATURE_${name.replace(/\./g, '_').toUpperCase()}_ROLLOUT`]
    
    if (envEnabled !== undefined) {
      config.enabled = envEnabled === 'true'
    }
    if (envRollOut !== undefined) {
      config.rollOutPercent = parseInt(envRollOut, 10)
    }
  }
}

loadFeatureFlagsFromEnv()

// 导出配置用于调试
export function getAllFeatureFlags(): Record<string, FeatureConfig> {
  return { ...FEATURE_FLAGS }
}

/**
 * 插件管理器
 *
 * 实现插件的加载、启用、禁用、卸载等生命周期管理
 */

import { readdir, readFile, writeFile, stat, mkdir } from 'fs/promises'
import { resolve, join, extname, basename } from 'path'
import { existsSync } from 'fs'
import type {
  Plugin,
  PluginManifest,
  PluginConfig,
  PluginStatus,
  PluginType,
  PluginInstance,
  PluginValidationResult,
  PluginInstallOptions,
  PluginTool,
  PluginHookContext,
} from './types'
import type { Command } from '../../integrations/skillsAdapter'

/**
 * 插件管理器类
 */
export class PluginManager {
  /** 插件注册表 */
  private plugins: Map<string, Plugin> = new Map()
  /** 插件目录路径 */
  private pluginsDir: string
  /** 用户配置目录路径 */
  private configDir: string
  /** 已注册的插件钩子 */
  private registeredHooks: Map<string, Set<string>> = new Map()
  /** 加载的插件工具 */
  private pluginTools: Map<string, PluginTool[]> = new Map()
  /** 加载的插件技能 */
  private pluginSkills: Map<string, Command[]> = new Map()

  constructor(pluginsDir?: string, configDir?: string) {
    const rootDir = process.cwd().replace(/[/\\]server[/\\]src$/i, '')
    this.pluginsDir = pluginsDir || resolve(rootDir, 'plugins')
    this.configDir = configDir || resolve(rootDir, '.config', 'plugins')
  }

  /**
   * 初始化插件系统
   */
  async initialize(): Promise<void> {
    console.log('[PluginManager] Initializing plugin system...')

    // 确保目录存在
    await this.ensureDirectories()

    // 加载已安装的插件
    await this.loadInstalledPlugins()

    console.log(`[PluginManager] Initialized with ${this.plugins.size} plugins`)
  }

  /**
   * 确保必要目录存在
   */
  private async ensureDirectories(): Promise<void> {
    try {
      if (!existsSync(this.pluginsDir)) {
        await mkdir(this.pluginsDir, { recursive: true })
        console.log('[PluginManager] Created plugins directory')
      }

      if (!existsSync(this.configDir)) {
        await mkdir(this.configDir, { recursive: true })
        console.log('[PluginManager] Created plugin config directory')
      }
    } catch (error) {
      console.error('[PluginManager] Failed to create directories:', error)
    }
  }

  /**
   * 加载所有已安装的插件
   */
  private async loadInstalledPlugins(): Promise<void> {
    try {
      if (!existsSync(this.pluginsDir)) {
        return
      }

      const entries = await readdir(this.pluginsDir, { withFileTypes: true })

      for (const entry of entries) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) {
          continue
        }

        const pluginPath = join(this.pluginsDir, entry.name)
        const manifestPath = join(pluginPath, 'plugin.json')

        if (!existsSync(manifestPath)) {
          continue
        }

        try {
          const plugin = await this.loadPlugin(pluginPath)
          if (plugin) {
            this.plugins.set(plugin.manifest.id, plugin)
          }
        } catch (error) {
          console.error(`[PluginManager] Failed to load plugin ${entry.name}:`, error)
        }
      }
    } catch (error) {
      console.error('[PluginManager] Failed to load installed plugins:', error)
    }
  }

  /**
   * 加载单个插件
   */
  async loadPlugin(pluginPath: string): Promise<Plugin | null> {
    const manifestPath = join(pluginPath, 'plugin.json')

    if (!existsSync(manifestPath)) {
      console.warn(`[PluginManager] No manifest found at ${manifestPath}`)
      return null
    }

    const manifestContent = await readFile(manifestPath, 'utf-8')
    let manifest: PluginManifest

    try {
      manifest = JSON.parse(manifestContent)
    } catch {
      console.error('[PluginManager] Invalid plugin manifest JSON')
      return null
    }

    // 验证清单
    const validation = this.validateManifest(manifest)
    if (!validation.valid) {
      console.error(`[PluginManager] Invalid manifest: ${validation.errors.join(', ')}`)
      return null
    }

    const plugin: Plugin = {
      manifest,
      status: PluginStatus.INSTALLED,
      installedAt: Date.now(),
    }

    // 如果有配置文件，加载它
    const configPath = join(this.configDir, `${manifest.id}.json`)
    if (existsSync(configPath)) {
      try {
        const configContent = await readFile(configPath, 'utf-8')
        plugin.instance = JSON.parse(configContent)
      } catch {
        // 忽略配置加载错误
      }
    }

    return plugin
  }

  /**
   * 验证插件清单
   */
  validateManifest(manifest: unknown): PluginValidationResult {
    const result: PluginValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    }

    if (!manifest || typeof manifest !== 'object') {
      result.valid = false
      result.errors.push('Manifest must be an object')
      return result
    }

    const m = manifest as Record<string, unknown>

    // 必需字段
    if (!m.id || typeof m.id !== 'string') {
      result.valid = false
      result.errors.push('Missing or invalid "id" field')
    }

    if (!m.name || typeof m.name !== 'string') {
      result.valid = false
      result.errors.push('Missing or invalid "name" field')
    }

    if (!m.version || typeof m.version !== 'string') {
      result.valid = false
      result.errors.push('Missing or invalid "version" field')
    }

    if (!m.main || typeof m.main !== 'string') {
      result.valid = false
      result.errors.push('Missing or invalid "main" field')
    }

    if (!m.type || !Object.values(PluginType).includes(m.type as PluginType)) {
      result.valid = false
      result.errors.push('Missing or invalid "type" field')
    }

    // 版本格式检查
    if (m.version && !/^\d+\.\d+\.\d+/.test(m.version as string)) {
      result.warnings.push('Version should follow semantic versioning (x.y.z)')
    }

    return result
  }

  /**
   * 安装插件
   */
  async install(
    source: string,
    options: PluginInstallOptions = {}
  ): Promise<Plugin | null> {
    console.log(`[PluginManager] Installing plugin from ${source}...`)

    try {
      // 解析源路径
      let pluginPath: string

      if (source.startsWith('./') || source.startsWith('../') || source.startsWith('/') || /^[a-zA-Z]:/.test(source)) {
        // 本地路径
        pluginPath = resolve(source)
      } else {
        // 假设是插件 ID
        pluginPath = join(this.pluginsDir, source)
      }

      // 加载插件
      const plugin = await this.loadPlugin(pluginPath)
      if (!plugin) {
        console.error('[PluginManager] Failed to load plugin')
        return null
      }

      // 注册到系统
      this.plugins.set(plugin.manifest.id, plugin)

      // 保存配置
      if (options.config) {
        await this.savePluginConfig(plugin.manifest.id, options.config)
      }

      // 启用插件（如果需要）
      if (options.enable) {
        await this.enablePlugin(plugin.manifest.id)
      }

      console.log(`[PluginManager] Installed plugin: ${plugin.manifest.name}`)
      return plugin
    } catch (error) {
      console.error('[PluginManager] Installation failed:', error)
      return null
    }
  }

  /**
   * 卸载插件
   */
  async uninstall(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId)

    if (!plugin) {
      console.warn(`[PluginManager] Plugin not found: ${pluginId}`)
      return false
    }

    // 如果插件已启用，先禁用
    if (plugin.status === PluginStatus.ENABLED) {
      await this.disablePlugin(pluginId)
    }

    // 调用卸载钩子
    if (plugin.instance?.onUninstall) {
      try {
        await plugin.instance.onUninstall()
      } catch (error) {
        console.error(`[PluginManager] Plugin uninstall hook failed:`, error)
      }
    }

    // 从注册表移除
    this.plugins.delete(pluginId)

    // 删除配置
    await this.deletePluginConfig(pluginId)

    console.log(`[PluginManager] Uninstalled plugin: ${pluginId}`)
    return true
  }

  /**
   * 启用插件
   */
  async enablePlugin(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId)

    if (!plugin) {
      console.error(`[PluginManager] Plugin not found: ${pluginId}`)
      return false
    }

    if (plugin.status === PluginStatus.ENABLED) {
      console.log(`[PluginManager] Plugin already enabled: ${pluginId}`)
      return true
    }

    plugin.status = PluginStatus.LOADING

    try {
      // 加载插件实例
      const instance = await this.loadPluginInstance(plugin)
      if (!instance) {
        plugin.status = PluginStatus.ERROR
        plugin.error = 'Failed to load plugin instance'
        return false
      }

      plugin.instance = instance

      // 调用启用钩子
      if (instance.onEnable) {
        const enabled = await instance.onEnable()
        if (!enabled) {
          plugin.status = PluginStatus.ERROR
          plugin.error = 'Plugin onEnable returned false'
          return false
        }
      }

      // 注册工具
      if (instance.getTools) {
        const tools = instance.getTools()
        this.pluginTools.set(pluginId, tools)
        console.log(`[PluginManager] Registered ${tools.length} tools from plugin ${pluginId}`)
      }

      // 注册技能
      if (instance.getSkills) {
        const skills = instance.getSkills()
        this.pluginSkills.set(pluginId, skills)
        console.log(`[PluginManager] Registered ${skills.length} skills from plugin ${pluginId}`)
      }

      plugin.status = PluginStatus.ENABLED
      plugin.enabledAt = Date.now()

      console.log(`[PluginManager] Enabled plugin: ${plugin.manifest.name}`)
      return true
    } catch (error) {
      plugin.status = PluginStatus.ERROR
      plugin.error = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[PluginManager] Failed to enable plugin ${pluginId}:`, error)
      return false
    }
  }

  /**
   * 禁用插件
   */
  async disablePlugin(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId)

    if (!plugin) {
      console.error(`[PluginManager] Plugin not found: ${pluginId}`)
      return false
    }

    if (plugin.status !== PluginStatus.ENABLED) {
      console.log(`[PluginManager] Plugin is not enabled: ${pluginId}`)
      return true
    }

    try {
      // 调用禁用钩子
      if (plugin.instance?.onDisable) {
        await plugin.instance.onDisable()
      }

      // 注销工具
      this.pluginTools.delete(pluginId)

      // 注销技能
      this.pluginSkills.delete(pluginId)

      plugin.status = PluginStatus.DISABLED

      console.log(`[PluginManager] Disabled plugin: ${plugin.manifest.name}`)
      return true
    } catch (error) {
      console.error(`[PluginManager] Failed to disable plugin ${pluginId}:`, error)
      return false
    }
  }

  /**
   * 加载插件实例
   */
  private async loadPluginInstance(plugin: Plugin): Promise<PluginInstance | null> {
    const pluginPath = join(this.pluginsDir, plugin.manifest.id)
    const entryPath = join(pluginPath, plugin.manifest.main)

    if (!existsSync(entryPath)) {
      console.error(`[PluginManager] Plugin entry not found: ${entryPath}`)
      return null
    }

    try {
      // 动态导入插件模块
      const module = await import(`${entryPath}?t=${Date.now()}`)

      const instance: PluginInstance = {
        id: plugin.manifest.id,
        name: plugin.manifest.name,
        version: plugin.manifest.version,
      }

      // 复制钩子函数
      if (typeof module.onLoad === 'function') {
        instance.onLoad = module.onLoad
      }
      if (typeof module.onEnable === 'function') {
        instance.onEnable = module.onEnable
      }
      if (typeof module.onDisable === 'function') {
        instance.onDisable = module.onDisable
      }
      if (typeof module.onUninstall === 'function') {
        instance.onUninstall = module.onUninstall
      }
      if (typeof module.getTools === 'function') {
        instance.getTools = module.getTools
      }
      if (typeof module.getSkills === 'function') {
        instance.getSkills = module.getSkills
      }
      if (typeof module.getTheme === 'function') {
        instance.getTheme = module.getTheme
      }
      if (typeof module.execute === 'function') {
        instance.execute = module.execute
      }

      // 调用加载钩子
      if (instance.onLoad) {
        const config = await this.loadPluginConfig(plugin.manifest.id)
        await instance.onLoad(config)
      }

      return instance
    } catch (error) {
      console.error(`[PluginManager] Failed to load plugin instance:`, error)
      return null
    }
  }

  /**
   * 获取插件配置
   */
  async loadPluginConfig(pluginId: string): Promise<PluginConfig> {
    const configPath = join(this.configDir, `${pluginId}.json`)

    if (!existsSync(configPath)) {
      return {}
    }

    try {
      const content = await readFile(configPath, 'utf-8')
      return JSON.parse(content)
    } catch {
      return {}
    }
  }

  /**
   * 保存插件配置
   */
  async savePluginConfig(pluginId: string, config: PluginConfig): Promise<void> {
    const configPath = join(this.configDir, `${pluginId}.json`)
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
  }

  /**
   * 删除插件配置
   */
  async deletePluginConfig(pluginId: string): Promise<void> {
    const configPath = join(this.configDir, `${pluginId}.json`)

    if (existsSync(configPath)) {
      await import('fs').then(({ unlink }) => unlink(configPath))
    }
  }

  /**
   * 获取所有插件
   */
  getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values())
  }

  /**
   * 获取插件
   */
  getPlugin(pluginId: string): Plugin | undefined {
    return this.plugins.get(pluginId)
  }

  /**
   * 获取已启用的插件
   */
  getEnabledPlugins(): Plugin[] {
    return this.getAllPlugins().filter(p => p.status === PluginStatus.ENABLED)
  }

  /**
   * 获取所有插件工具
   */
  getAllPluginTools(): PluginTool[] {
    const allTools: PluginTool[] = []

    for (const tools of this.pluginTools.values()) {
      allTools.push(...tools)
    }

    return allTools
  }

  /**
   * 获取插件工具
   */
  getPluginTool(pluginId: string, toolName: string): PluginTool | undefined {
    const tools = this.pluginTools.get(pluginId)
    return tools?.find(t => t.name === toolName)
  }

  /**
   * 获取所有插件技能
   */
  getAllPluginSkills(): Command[] {
    const allSkills: Command[] = []

    for (const skills of this.pluginSkills.values()) {
      allSkills.push(...skills)
    }

    return allSkills
  }

  /**
   * 执行插件操作
   */
  async executePluginAction(
    pluginId: string,
    action: string,
    params: unknown
  ): Promise<unknown> {
    const plugin = this.plugins.get(pluginId)

    if (!plugin || plugin.status !== PluginStatus.ENABLED) {
      throw new Error(`Plugin not enabled: ${pluginId}`)
    }

    if (!plugin.instance?.execute) {
      throw new Error(`Plugin does not support execute: ${pluginId}`)
    }

    return plugin.instance.execute(action, params)
  }

  /**
   * 触发插件钩子
   */
  async triggerHook(
    hookName: keyof Plugin['manifest']['hooks'],
    context: PluginHookContext
  ): Promise<void> {
    const enabledPlugins = this.getEnabledPlugins()

    for (const plugin of enabledPlugins) {
      if (!plugin.manifest.hooks || !plugin.manifest.hooks[hookName]) {
        continue
      }

      const hook = plugin.manifest.hooks[hookName]
      if (typeof hook !== 'function') {
        continue
      }

      try {
        await hook({
          ...context,
          pluginId: plugin.manifest.id,
        })
      } catch (error) {
        console.error(`[PluginManager] Hook ${hookName} failed for plugin ${plugin.manifest.id}:`, error)
      }
    }
  }

  /**
   * 获取插件统计信息
   */
  getStats(): {
    totalPlugins: number
    enabledPlugins: number
    disabledPlugins: number
    byType: Record<PluginType, number>
    totalTools: number
    totalSkills: number
  } {
    const allPlugins = this.getAllPlugins()

    const stats = {
      totalPlugins: allPlugins.length,
      enabledPlugins: 0,
      disabledPlugins: 0,
      byType: {} as Record<PluginType, number>,
      totalTools: 0,
      totalSkills: 0,
    }

    for (const plugin of allPlugins) {
      if (plugin.status === PluginStatus.ENABLED) {
        stats.enabledPlugins++
      } else if (plugin.status === PluginStatus.DISABLED) {
        stats.disabledPlugins++
      }

      const type = plugin.manifest.type
      stats.byType[type] = (stats.byType[type] || 0) + 1
    }

    stats.totalTools = this.getAllPluginTools().length
    stats.totalSkills = this.getAllPluginSkills().length

    return stats
  }

  /**
   * 创建示例插件
   */
  async createSamplePlugins(): Promise<void> {
    const samplePlugins = [
      {
        id: 'example-tool-plugin',
        name: '示例工具插件',
        version: '1.0.0',
        description: '这是一个示例插件，展示如何开发工具插件',
        author: 'Claw Web',
        type: PluginType.TOOL,
        main: 'index.js',
      },
      {
        id: 'example-skill-plugin',
        name: '示例技能插件',
        version: '1.0.0',
        description: '这是一个示例插件，展示如何开发技能插件',
        author: 'Claw Web',
        type: PluginType.SKILL,
        main: 'index.js',
      },
    ]

    for (const manifest of samplePlugins) {
      const pluginPath = join(this.pluginsDir, manifest.id)

      if (!existsSync(pluginPath)) {
        await mkdir(pluginPath, { recursive: true })
      }

      const manifestPath = join(pluginPath, 'plugin.json')
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')

      // 创建入口文件
      let entryContent = ''

      if (manifest.type === PluginType.TOOL) {
        entryContent = `/**
 * 示例工具插件
 */

export function getTools() {
  return [
    {
      name: 'example_tool',
      description: '这是一个示例工具',
      inputSchema: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: '要处理的消息'
          }
        },
        required: ['message']
      },
      async handler(params) {
        const { message } = params
        return {
          success: true,
          output: \`处理了消息: \${message}\`
        }
      }
    }
  ]
}

export function onEnable() {
  console.log('示例工具插件已启用')
  return true
}

export function onDisable() {
  console.log('示例工具插件已禁用')
}
`
      } else if (manifest.type === PluginType.SKILL) {
        entryContent = `/**
 * 示例技能插件
 */

export function getSkills() {
  return [
    {
      type: 'prompt',
      name: 'example-skill',
      description: '这是一个示例技能',
      source: 'plugin',
      loadedFrom: 'plugin',
      contentLength: 100,
      progressMessage: 'running',
      getPromptForCommand: async (args) => {
        return [{
          type: 'text',
          text: \`# 示例技能

这是一个通过插件系统提供的技能示例。

## 使用方法

使用 /example-skill 命令来调用此技能。

## 参数

\`\`\`bash
/example-skill <参数>
\`\`\`

## 示例

\`\`\`bash
/example-skill hello
\`\`\`
\`
        }]
      }
    }
  ]
}

export function onEnable() {
  console.log('示例技能插件已启用')
  return true
}

export function onDisable() {
  console.log('示例技能插件已禁用')
}
`
      }

      const entryPath = join(pluginPath, 'index.js')
      await writeFile(entryPath, entryContent, 'utf-8')

      console.log(`[PluginManager] Created sample plugin: ${manifest.id}`)
    }
  }
}

// 单例实例
let pluginManagerInstance: PluginManager | null = null

/**
 * 获取插件管理器单例
 */
export function getPluginManager(): PluginManager {
  if (!pluginManagerInstance) {
    pluginManagerInstance = new PluginManager()
  }
  return pluginManagerInstance
}

/**
 * 初始化插件系统
 */
export async function initializePluginSystem(): Promise<PluginManager> {
  const manager = getPluginManager()
  await manager.initialize()
  return manager
}

export default PluginManager

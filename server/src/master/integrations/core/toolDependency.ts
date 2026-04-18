/**
 * 工具依赖管理系统
 *
 * 功能：
 * - 管理工具之间的依赖关系
 * - 提供拓扑排序的加载顺序计算
 * - 检测循环依赖和缺失依赖
 */

import type { ToolDependency, RegisteredTool } from '../types/toolRegistryTypes'

// ==================== ToolDependencyManager 类 ====================

export class ToolDependencyManager {
  private toolDependencies: Map<string, ToolDependency> = new Map()
  private loadOrder: string[] = []

  /**
   * 注册工具依赖关系
   */
  registerDependency(dependentTool: string, dependencyTool: string): void {
    if (!this.toolDependencies.has(dependentTool)) {
      this.toolDependencies.set(dependentTool, {
        toolName: dependentTool,
        loaded: false,
        loadOrder: this.loadOrder.length,
      })
    }
    
    // 更新依赖信息
    const dep = this.toolDependencies.get(dependentTool)!
    dep.loadOrder = this.loadOrder.length
  }

  /**
   * 获取工具的所有依赖项
   */
  getDependencies(toolName: string, getToolFn: (name: string) => RegisteredTool | undefined): string[] {
    const tool = getToolFn(toolName)
    return tool?.dependencies || []
  }

  /**
   * 计算拓扑排序的加载顺序（检测循环依赖）
   */
  getLoadOrder(
    getAllToolsFn: () => RegisteredTool[],
    getDependenciesFn: (name: string) => string[]
  ): string[] {
    const ordered: string[] = []
    const visited = new Set<string>()
    const visiting = new Set<string>()
    
    const visit = (toolName: string) => {
      if (visited.has(toolName)) return
      
      // 检测循环依赖
      if (visiting.has(toolName)) {
        console.warn(`[ToolDependencyManager] 检测到循环依赖: ${toolName}`)
        return
      }
      
      visiting.add(toolName)
      
      // 先访问所有依赖项
      const deps = getDependenciesFn(toolName)
      for (const dep of deps) {
        visit(dep)
      }
      
      visiting.delete(toolName)
      visited.add(toolName)
      ordered.push(toolName)
    }
    
    for (const tool of getAllToolsFn()) {
      visit(tool.name)
    }
    
    this.loadOrder = ordered
    return ordered
  }

  /**
   * 检查工具的依赖是否都已加载
   */
  areDependenciesLoaded(
    toolName: string,
    getDependenciesFn: (name: string) => string[],
    getToolFn: (name: string) => RegisteredTool | undefined
  ): { loaded: boolean; missing: string[] } {
    const deps = getDependenciesFn(toolName)
    const missing: string[] = []
    
    for (const dep of deps) {
      if (!getToolFn(dep)) {
        missing.push(dep)
      }
    }
    
    return { loaded: missing.length === 0, missing }
  }

  /**
   * 获取当前加载顺序
   */
  getLoadOrderCache(): string[] {
    return [...this.loadOrder]
  }

  /**
   * 清空依赖关系
   */
  clear(): void {
    this.toolDependencies.clear()
    this.loadOrder = []
  }
}

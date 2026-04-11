/**
 * 插件管理路由
 *
 * 提供插件的安装、卸载、启用、禁用等 REST API
 */

import { Router, Request, Response } from 'express'
import { getPluginManager } from '../../integrations/plugins'

const router = Router()

/**
 * 获取所有插件
 * GET /api/plugins
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const manager = getPluginManager()
    const plugins = manager.getAllPlugins()
    const stats = manager.getStats()

    res.json({
      success: true,
      data: {
        plugins,
        stats,
      },
    })
  } catch (error) {
    console.error('[PluginRoutes] Failed to get plugins:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get plugins',
    })
  }
})

/**
 * 获取单个插件
 * GET /api/plugins/:id
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const manager = getPluginManager()
    const plugin = manager.getPlugin(id)

    if (!plugin) {
      res.status(404).json({
        success: false,
        error: 'Plugin not found',
      })
      return
    }

    res.json({
      success: true,
      data: plugin,
    })
  } catch (error) {
    console.error('[PluginRoutes] Failed to get plugin:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get plugin',
    })
  }
})

/**
 * 安装插件
 * POST /api/plugins/install
 */
router.post('/install', async (req: Request, res: Response) => {
  try {
    const { source, enable, config } = req.body

    if (!source) {
      res.status(400).json({
        success: false,
        error: 'Missing plugin source',
      })
      return
    }

    const manager = getPluginManager()
    const plugin = await manager.install(source, {
      enable: enable ?? true,
      config: config ?? {},
    })

    if (!plugin) {
      res.status(500).json({
        success: false,
        error: 'Failed to install plugin',
      })
      return
    }

    res.json({
      success: true,
      data: plugin,
    })
  } catch (error) {
    console.error('[PluginRoutes] Failed to install plugin:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to install plugin',
    })
  }
})

/**
 * 卸载插件
 * DELETE /api/plugins/:id
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const manager = getPluginManager()
    const success = await manager.uninstall(id)

    if (!success) {
      res.status(404).json({
        success: false,
        error: 'Plugin not found or failed to uninstall',
      })
      return
    }

    res.json({
      success: true,
      message: 'Plugin uninstalled successfully',
    })
  } catch (error) {
    console.error('[PluginRoutes] Failed to uninstall plugin:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to uninstall plugin',
    })
  }
})

/**
 * 启用插件
 * POST /api/plugins/:id/enable
 */
router.post('/:id/enable', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const manager = getPluginManager()
    const success = await manager.enablePlugin(id)

    if (!success) {
      res.status(500).json({
        success: false,
        error: 'Failed to enable plugin',
      })
      return
    }

    res.json({
      success: true,
      message: 'Plugin enabled successfully',
    })
  } catch (error) {
    console.error('[PluginRoutes] Failed to enable plugin:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to enable plugin',
    })
  }
})

/**
 * 禁用插件
 * POST /api/plugins/:id/disable
 */
router.post('/:id/disable', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const manager = getPluginManager()
    const success = await manager.disablePlugin(id)

    if (!success) {
      res.status(500).json({
        success: false,
        error: 'Failed to disable plugin',
      })
      return
    }

    res.json({
      success: true,
      message: 'Plugin disabled successfully',
    })
  } catch (error) {
    console.error('[PluginRoutes] Failed to disable plugin:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to disable plugin',
    })
  }
})

/**
 * 更新插件配置
 * PUT /api/plugins/:id/config
 */
router.put('/:id/config', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { config } = req.body

    if (!config) {
      res.status(400).json({
        success: false,
        error: 'Missing config',
      })
      return
    }

    const manager = getPluginManager()
    const plugin = manager.getPlugin(id)

    if (!plugin) {
      res.status(404).json({
        success: false,
        error: 'Plugin not found',
      })
      return
    }

    await manager.savePluginConfig(id, config)

    res.json({
      success: true,
      message: 'Plugin config updated successfully',
    })
  } catch (error) {
    console.error('[PluginRoutes] Failed to update plugin config:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to update plugin config',
    })
  }
})

/**
 * 获取插件配置
 * GET /api/plugins/:id/config
 */
router.get('/:id/config', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const manager = getPluginManager()
    const config = await manager.loadPluginConfig(id)

    res.json({
      success: true,
      data: config,
    })
  } catch (error) {
    console.error('[PluginRoutes] Failed to get plugin config:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get plugin config',
    })
  }
})

/**
 * 执行插件操作
 * POST /api/plugins/:id/execute
 */
router.post('/:id/execute', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { action, params } = req.body

    if (!action) {
      res.status(400).json({
        success: false,
        error: 'Missing action',
      })
      return
    }

    const manager = getPluginManager()
    const result = await manager.executePluginAction(id, action, params)

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('[PluginRoutes] Failed to execute plugin action:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to execute plugin action',
    })
  }
})

/**
 * 获取插件统计
 * GET /api/plugins/stats
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const manager = getPluginManager()
    const stats = manager.getStats()

    res.json({
      success: true,
      data: stats,
    })
  } catch (error) {
    console.error('[PluginRoutes] Failed to get plugin stats:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get plugin stats',
    })
  }
})

/**
 * 获取所有已启用的插件工具
 * GET /api/plugins/tools
 */
router.get('/tools/list', async (req: Request, res: Response) => {
  try {
    const manager = getPluginManager()
    const tools = manager.getAllPluginTools()

    res.json({
      success: true,
      data: tools,
    })
  } catch (error) {
    console.error('[PluginRoutes] Failed to get plugin tools:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get plugin tools',
    })
  }
})

/**
 * 创建示例插件
 * POST /api/plugins/create-samples
 */
router.post('/create-samples', async (req: Request, res: Response) => {
  try {
    const manager = getPluginManager()
    await manager.createSamplePlugins()

    res.json({
      success: true,
      message: 'Sample plugins created successfully',
    })
  } catch (error) {
    console.error('[PluginRoutes] Failed to create sample plugins:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to create sample plugins',
    })
  }
})

export default router

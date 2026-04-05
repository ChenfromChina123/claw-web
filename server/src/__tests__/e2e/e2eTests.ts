/**
 * 端到端测试套件
 * 
 * 使用 Playwright 进行完整的 E2E 测试
 */

import { test, expect, Browser, Page, BrowserContext } from '@playwright/test'

/**
 * E2E 测试配置
 */
export interface E2ETestConfig {
  /** 测试 URL */
  baseUrl: string
  /** 浏览器类型 */
  browser: 'chromium' | 'firefox' | 'webkit'
  /** 测试超时 */
  timeout: number
  /** 是否使用录制 */
  recordVideo?: boolean
}

/**
 * 测试用户账户
 */
interface TestUser {
  email: string
  password: string
  name: string
}

/**
 * E2E 测试基类
 */
export abstract class E2ETestBase {
  protected config: E2ETestConfig
  protected browser: Browser | null = null
  protected context: BrowserContext | null = null
  protected page: Page | null = null

  constructor(config: E2ETestConfig) {
    this.config = config
  }

  /**
   * 初始化浏览器
   */
  async setup(): Promise<void> {
    this.browser = await this.launchBrowser()
    this.context = await this.browser.newContext({
      recordVideo: this.config.recordVideo ? { dir: 'test-results/videos' } : undefined,
    })
    this.page = await this.context.newPage()
  }

  /**
   * 启动浏览器
   */
  protected abstract launchBrowser(): Promise<Browser>

  /**
   * 清理资源
   */
  async teardown(): Promise<void> {
    if (this.page) await this.page.close()
    if (this.context) await this.context.close()
    if (this.browser) await this.browser.close()
  }

  /**
   * 执行测试
   */
  async runTests(): Promise<{
    passed: number
    failed: number
    duration: number
  }> {
    const startTime = Date.now()
    let passed = 0
    let failed = 0

    const testMethods = this.getTestMethods()

    for (const method of testMethods) {
      try {
        await this.setup()
        await (this as Record<string, () => Promise<void>>)[method].call(this)
        passed++
        console.log(`✅ ${method}`)
      } catch (error) {
        failed++
        console.error(`❌ ${method}:`, error)
      } finally {
        await this.teardown()
      }
    }

    return {
      passed,
      failed,
      duration: Date.now() - startTime,
    }
  }

  /**
   * 获取测试方法列表
   */
  protected abstract getTestMethods(): string[]
}

/**
 * 用户注册/登录测试
 */
export class AuthE2ETests extends E2ETestBase {
  private testUser: TestUser = {
    email: `test_${Date.now()}@example.com`,
    password: 'TestPassword123!',
    name: 'Test User',
  }

  constructor(config: E2ETestConfig) {
    super(config)
  }

  protected async launchBrowser(): Promise<Browser> {
    const { chromium } = await import('playwright')
    return chromium.launch()
  }

  protected getTestMethods(): string[] {
    return ['testUserRegistration', 'testUserLogin', 'testLogout']
  }

  async testUserRegistration(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized')

    // 导航到注册页面
    await this.page.goto(`${this.config.baseUrl}/register`)

    // 填写注册表单
    await this.page.fill('input[name="name"]', this.testUser.name)
    await this.page.fill('input[name="email"]', this.testUser.email)
    await this.page.fill('input[name="password"]', this.testUser.password)
    await this.page.fill('input[name="confirmPassword"]', this.testUser.password)

    // 提交表单
    await this.page.click('button[type="submit"]')

    // 等待注册成功
    await this.page.waitForSelector('[data-testid="success-message"]', { timeout: 5000 })

    // 验证跳转
    await expect(this.page).toHaveURL(/\/chat/)
  }

  async testUserLogin(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized')

    // 导航到登录页面
    await this.page.goto(`${this.config.baseUrl}/login`)

    // 填写登录表单
    await this.page.fill('input[name="email"]', this.testUser.email)
    await this.page.fill('input[name="password"]', this.testUser.password)

    // 提交表单
    await this.page.click('button[type="submit"]')

    // 等待登录成功
    await this.page.waitForSelector('[data-testid="chat-container"]', { timeout: 5000 })

    // 验证跳转
    await expect(this.page).toHaveURL(/\/chat/)
  }

  async testLogout(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized')

    // 确保已登录
    await this.testUserLogin()

    // 点击登出
    await this.page.click('[data-testid="logout-button"]')

    // 验证跳转
    await expect(this.page).toHaveURL(/\/login/)
  }
}

/**
 * 聊天功能测试
 */
export class ChatE2ETests extends E2ETestBase {
  private testUser: TestUser = {
    email: `test_${Date.now()}@example.com`,
    password: 'TestPassword123!',
    name: 'Test User',
  }

  constructor(config: E2ETestConfig) {
    super(config)
  }

  protected async launchBrowser(): Promise<Browser> {
    const { chromium } = await import('playwright')
    return chromium.launch()
  }

  protected getTestMethods(): string[] {
    return ['testCreateSession', 'testSendMessage', 'testReceiveAgentResponse']
  }

  async testCreateSession(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized')

    // 登录
    await this.login()

    // 创建新会话
    await this.page.click('[data-testid="new-session-button"]')

    // 等待会话创建
    await this.page.waitForSelector('[data-testid="chat-container"]', { timeout: 5000 })

    // 验证会话列表更新
    const sessionItems = await this.page.locator('[data-testid="session-item"]').count()
    expect(sessionItems).toBeGreaterThan(0)
  }

  async testSendMessage(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized')

    // 登录并创建会话
    await this.testCreateSession()

    // 输入消息
    const testMessage = '分析项目结构'
    await this.page.fill('textarea[name="message"]', testMessage)

    // 发送
    await this.page.click('button[data-testid="send-button"]')

    // 等待消息发送
    await this.page.waitForSelector('[data-testid="message-user"]', { timeout: 5000 })

    // 验证消息显示
    const userMessage = await this.page.locator('[data-testid="message-user"]').first()
    await expect(userMessage).toContainText(testMessage)
  }

  async testReceiveAgentResponse(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized')

    // 登录并创建会话
    await this.testCreateSession()

    // 发送消息触发 Agent
    const testMessage = '找 package.json'
    await this.page.fill('textarea[name="message"]', testMessage)
    await this.page.click('button[data-testid="send-button"]')

    // 等待 Agent 响应 (最多 30 秒)
    await this.page.waitForSelector('[data-testid="message-assistant"]', { timeout: 30000 })

    // 验证响应
    const assistantMessage = await this.page.locator('[data-testid="message-assistant"]').first()
    await expect(assistantMessage).toBeVisible()
  }

  private async login(): Promise<void> {
    await this.page?.goto(`${this.config.baseUrl}/login`)
    await this.page?.fill('input[name="email"]', this.testUser.email)
    await this.page?.fill('input[name="password"]', this.testUser.password)
    await this.page?.click('button[type="submit"]')
    await this.page?.waitForSelector('[data-testid="chat-container"]', { timeout: 10000 })
  }
}

/**
 * Agent 执行测试
 */
export class AgentE2ETests extends E2ETestBase {
  private testUser: TestUser = {
    email: `test_${Date.now()}@example.com`,
    password: 'TestPassword123!',
    name: 'Test User',
  }

  constructor(config: E2ETestConfig) {
    super(config)
  }

  protected async launchBrowser(): Promise<Browser> {
    const { chromium } = await import('playwright')
    return chromium.launch()
  }

  protected getTestMethods(): string[] {
    return ['testAgentSelection', 'testAgentExecution', 'testAgentStatusUpdate']
  }

  async testAgentSelection(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized')

    await this.login()

    // 打开 Agent 选择器
    await this.page.click('[data-testid="agent-selector-button"]')

    // 等待选择器打开
    await this.page.waitForSelector('[data-testid="agent-selector"]', { timeout: 5000 })

    // 选择 Explore Agent
    await this.page.click('[data-testid="agent-option-Explore"]')

    // 验证选择
    const selectedAgent = await this.page.locator('[data-testid="selected-agent"]')
    await expect(selectedAgent).toContainText('Explore')
  }

  async testAgentExecution(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized')

    await this.login()

    // 选择 Explore Agent
    await this.testAgentSelection()

    // 发送任务
    await this.page.fill('textarea[name="message"]', '分析 src 目录')
    await this.page.click('button[data-testid="send-button"]')

    // 等待执行状态
    await this.page.waitForSelector('[data-testid="agent-status-running"]', { timeout: 5000 })

    // 验证状态面板显示
    const statusPanel = await this.page.locator('[data-testid="agent-status-panel"]')
    await expect(statusPanel).toBeVisible()
  }

  async testAgentStatusUpdate(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized')

    await this.login()

    // 选择 Explore Agent
    await this.testAgentSelection()

    // 发送简单任务
    await this.page.fill('textarea[name="message"]', 'ls')
    await this.page.click('button[data-testid="send-button"]')

    // 等待完成
    await this.page.waitForSelector('[data-testid="agent-status-completed"]', { timeout: 60000 })

    // 验证完成消息
    const completionMessage = await this.page.locator('[data-testid="message-assistant"]').last()
    await expect(completionMessage).toBeVisible()
  }

  private async login(): Promise<void> {
    await this.page?.goto(`${this.config.baseUrl}/login`)
    await this.page?.fill('input[name="email"]', this.testUser.email)
    await this.page?.fill('input[name="password"]', this.testUser.password)
    await this.page?.click('button[type="submit"]')
    await this.page?.waitForSelector('[data-testid="chat-container"]', { timeout: 10000 })
  }
}

/**
 * 多 Agent 协作测试
 */
export class MultiAgentE2ETests extends E2ETestBase {
  constructor(config: E2ETestConfig) {
    super(config)
  }

  protected async launchBrowser(): Promise<Browser> {
    const { chromium } = await import('playwright')
    return chromium.launch()
  }

  protected getTestMethods(): string[] {
    return ['testTeamCreation', 'testTaskDistribution']
  }

  async testTeamCreation(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized')

    await this.login()

    // 打开团队创建
    await this.page.click('[data-testid="create-team-button"]')

    // 等待模态框
    await this.page.waitForSelector('[data-testid="team-modal"]', { timeout: 5000 })

    // 选择团队成员
    await this.page.click('[data-testid="member-Explore"]')
    await this.page.click('[data-testid="member-Plan"]')

    // 创建团队
    await this.page.click('[data-testid="confirm-team-creation"]')

    // 验证团队创建成功
    await this.page.waitForSelector('[data-testid="team-created"]', { timeout: 5000 })
  }

  async testTaskDistribution(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized')

    await this.login()

    // 创建团队
    await this.testTeamCreation()

    // 分配任务
    await this.page.click('[data-testid="assign-task-button"]')

    // 选择执行者
    await this.page.click('[data-testid="member-Explore"]')

    // 输入任务
    await this.page.fill('input[name="task-description"]', '分析代码结构')

    // 确认分配
    await this.page.click('[data-testid="confirm-task-assignment"]')

    // 验证任务分配
    await this.page.waitForSelector('[data-testid="task-assigned"]', { timeout: 5000 })
  }

  private async login(): Promise<void> {
    await this.page?.goto(`${this.config.baseUrl}/login`)
    await this.page?.fill('input[name="email"]', 'test@example.com')
    await this.page?.fill('input[name="password"]', 'TestPassword123!')
    await this.page?.click('button[type="submit"]')
    await this.page?.waitForSelector('[data-testid="chat-container"]', { timeout: 10000 })
  }
}

/**
 * 性能基准测试
 */
export class PerformanceBenchmarkTests extends E2ETestBase {
  constructor(config: E2ETestConfig) {
    super(config)
  }

  protected async launchBrowser(): Promise<Browser> {
    const { chromium } = await import('playwright')
    return chromium.launch()
  }

  protected getTestMethods(): string[] {
    return ['testPageLoadTime', 'testMessageResponseTime', 'testMemoryUsage']
  }

  async testPageLoadTime(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized')

    const startTime = Date.now()

    await this.page.goto(this.config.baseUrl)
    await this.page.waitForLoadState('networkidle')

    const loadTime = Date.now() - startTime

    console.log(`Page load time: ${loadTime}ms`)
    expect(loadTime).toBeLessThan(3000) // 3秒内加载完成
  }

  async testMessageResponseTime(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized')

    await this.login()

    const startTime = Date.now()

    await this.page.fill('textarea[name="message"]', 'hi')
    await this.page.click('button[data-testid="send-button"]')

    await this.page.waitForSelector('[data-testid="message-assistant"]', { timeout: 30000 })

    const responseTime = Date.now() - startTime

    console.log(`Message response time: ${responseTime}ms`)
    expect(responseTime).toBeLessThan(35000) // 35秒内响应
  }

  async testMemoryUsage(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized')

    await this.login()

    // 发送多条消息触发内存使用
    for (let i = 0; i < 10; i++) {
      await this.page.fill('textarea[name="message"]', `消息 ${i}`)
      await this.page.click('button[data-testid="send-button"]')
      await this.page.waitForTimeout(500)
    }

    // 获取内存使用
    const memoryMetrics = await this.page.evaluate(() => {
      return (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
    })

    if (memoryMetrics) {
      const usedMemoryMB = memoryMetrics.usedJSHeapSize / 1024 / 1024
      console.log(`Memory usage: ${usedMemoryMB.toFixed(2)}MB`)
      expect(usedMemoryMB).toBeLessThan(500) // 500MB 内存限制
    }
  }

  private async login(): Promise<void> {
    await this.page?.goto(`${this.config.baseUrl}/login`)
    await this.page?.fill('input[name="email"]', 'test@example.com')
    await this.page?.fill('input[name="password"]', 'TestPassword123!')
    await this.page?.click('button[type="submit"]')
    await this.page?.waitForSelector('[data-testid="chat-container"]', { timeout: 10000 })
  }
}

/**
 * 运行所有 E2E 测试
 */
export async function runAllE2ETests(config: E2ETestConfig): Promise<void> {
  const testSuites = [
    AuthE2ETests,
    ChatE2ETests,
    AgentE2ETests,
    MultiAgentE2ETests,
    PerformanceBenchmarkTests,
  ]

  console.log('Starting E2E tests...\n')

  for (const TestSuite of testSuites) {
    const suite = new TestSuite(config)
    const results = await suite.runTests()

    console.log(`\n${TestSuite.name}:`)
    console.log(`  ✅ Passed: ${results.passed}`)
    console.log(`  ❌ Failed: ${results.failed}`)
    console.log(`  ⏱️ Duration: ${results.duration}ms`)
  }
}

// 导出配置类型
export type { E2ETestConfig }

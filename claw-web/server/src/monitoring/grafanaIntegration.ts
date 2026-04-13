/**
 * Grafana Integration - Grafana监控面板集成
 *
 * 功能：
 * - 生成Grafana Dashboard JSON配置
 * - Prometheus数据源配置
 * - 预置仪表盘模板（容器池、用户、系统资源）
 * - 告警规则模板
 * - 数据查询语句生成器
 *
 * 使用场景：
 * - 快速部署监控面板
 * - 标准化指标展示
 * - 团队协作使用统一视图
 */

// ==================== 类型定义 ====================

/**
 * Grafana面板配置
 */
export interface GrafanaPanel {
  id: number
  title: string
  type: 'graph' | 'stat' | 'table' | 'heatmap' | 'gauge'
  datasource: string
  targets: Array<{
    expr: string
    legendFormat: string
    interval?: string
  }>
  gridPos?: {
    x: number
    y: number
    w: number
    h: number
  }
  options?: Record<string, any>
}

/**
 * Grafana仪表盘配置
 */
export interface GrafanaDashboard {
  uid: string
  title: string
  tags: string[]
  timezone: string
  panels: GrafanaPanel[]
  templating?: {
    list: Array<{
      name: string
      query: string
      refresh: boolean
    }>
  }
  time?: {
    from: string
    to: string
  }
}

/**
 * 告警规则
 */
export interface AlertRule {
  name: string
  condition: string
  forDuration: string
  severity: 'critical' | 'warning' | 'info'
  description: string
  notificationChannel: string
}

// ==================== GrafanaDashboardBuilder 类 ====================

class GrafanaDashboardBuilder {
  private dashboard: GrafanaDashboard
  private panelIdCounter: number = 0

  constructor(title: string, uid: string) {
    this.dashboard = {
      uid,
      title,
      tags: ['claw-web', 'container-orchestration'],
      timezone: 'browser',
      panels: [],
      templating: {
        list: [
          {
            name: 'instance',
            query: 'label_values(claw_web_container_status{job="claw-web-master"}, container)',
            refresh: true
          },
          {
            name: 'user_tier',
            query: 'label_values(claw_web_users_by_tier)',
            refresh: true
          }
        ]
      },
      time: {
        from: 'now-1h',
        to: 'now'
      }
    }
  }

  /**
   * 添加统计面板（单值显示）
   */
  addStatPanel(
    title: string,
    metricExpr: string,
    colorThresholds: Array<{ value: number; color: string }> = [
      { value: 70, color: 'green' },
      { value: 85, color: 'yellow' },
      { value: 95, color: 'red' }
    ],
    position?: { x: number; y: number; w: number; h: number }
  ): this {
    const panel: GrafanaPanel = {
      id: ++this.panelIdCounter,
      title,
      type: 'stat',
      datasource: 'Prometheus',
      targets: [{
        expr: metricExpr,
        legendFormat: '{{value}}'
      }],
      gridPos: position || { x: 0, y: 0, w: 4, h: 4 },
      options: {
        colorMode: 'value',
        graphMode: 'area',
        thresholds: colorThresholds.map(t => ({
          value: t.value,
          color: t.color
        }))
      }
    }

    this.dashboard.panels.push(panel)
    return this
  }

  /**
   * 添加时间序列图表面板
   */
  addGraphPanel(
    title: string,
    metrics: Array<{
      expr: string
      legend: string
      color?: string
    }>,
    position?: { x: number; y: number; w: number; h: number }
  ): this {
    const panel: GrafanaPanel = {
      id: ++this.panelIdCounter,
      title,
      type: 'graph',
      datasource: 'Prometheus',
      targets: metrics.map(m => ({
        expr: m.expr,
        legendFormat: m.legend
      })),
      gridPos: position || { x: 0, y: 0, w: 12, h: 8 },
      options: {
        legend: {
          displayMode: 'table',
          placement: 'bottom',
          calcs: ['mean', 'max', 'min']
        },
        tooltip: {
          mode: 'single'
        }
      }
    }

    this.dashboard.panels.push(panel)
    return this
  }

  /**
   * 添加热力图面板
   */
  addHeatmapPanel(
    title: string,
    metricExpr: string,
    position?: { x: number; y: number; w: number; h: number }
  ): this {
    const panel: GrafanaPanel = {
      id: ++this.panelIdCounter,
      title,
      type: 'heatmap',
      datasource: 'Prometheus',
      targets: [{
        expr: metricExpr,
        legendFormat: '{{container}}'
      }],
      gridPos: position || { x: 0, y: 0, w: 12, h: 8 }
    }

    this.dashboard.panels.push(panel)
    return this
  }

  /**
   * 添加表格面板
   */
  addTablePanel(
    title: string,
    columns: Array<{
      text: string
      value: string
    }>,
    position?: { x: number; y: number; w: number; h: number }
  ): this {
    const panel: GrafanaPanel = {
      id: ++this.panelIdCounter,
      title,
      type: 'table',
      datasource: 'Prometheus',
      targets: [{
        expr: columns[0].value || 'up',
        legendFormat: columns[0].text
      }],
      gridPos: position || { x: 0, y: 0, w: 12, h: 8 },
      options: {
        showHeader: true,
        columns: columns
      }
    }

    this.dashboard.panels.push(panel)
    return this
  }

  /**
   * 获取完整的仪表盘JSON
   */
  getDashboard(): GrafanaDashboard {
    return this.dashboard
  }

  /**
   * 导出为JSON字符串
   */
  toJSON(pretty: boolean = true): string {
    return JSON.stringify(this.dashboard, null, pretty ? 2 : 0)
  }
}

// ==================== 预置仪表盘工厂函数 ====================

/**
 * 创建容器池监控仪表盘
 */
export function createContainerPoolDashboard(): GrafanaDashboardBuilder {
  const builder = new GrafanaDashboardBuilder(
    'Container Pool Monitor',
    'claw-web-container-pool'
  )

  // 第一行：关键指标统计
  builder.addStatPanel('Total Containers', 'claw_web_pool_size')
    .addStatPanel('Idle Containers', 'claw_web_idle_containers')
    .addStatPanel('Active Users', 'claw_web_active_users')
    .addStatPanel('Queue Length', 'claw_web_queue_length')

  // 第二行：容器状态趋势
  builder.addGraphPanel('Container Pool Status', [
    { expr: 'claw_web_pool_size', legend: 'Total' },
    { expr: 'claw_web_idle_containers', legend: 'Idle' },
    { expr: 'claw_web_active_users', legend: 'Active (Users)' }
  ], { x: 0, y: 5, w: 12, h: 8 })

  // 第三行：池利用率
  builder.addGraphPanel('Pool Utilization %', [
    { expr: 'claw_web_pool_utilization', legend: 'Utilization %' }
  ], { x: 0, y: 14, w: 12, h: 8 })

  // 第四行：按等级分布
  builder.addGraphPanel('Users by Tier', [
    { expr: 'claw_web_users_by_tier{tier="vip"}', legend: 'VIP', color: '#FF6B6B' },
    { expr: 'claw_web_users_by_tier{tier="premium"}', legend: 'Premium', color: '#4ECDC4' },
    { expr: 'claw_web_users_by_tier{tier="regular"}', legend: 'Regular', color: '#45B7D1' },
    { expr: 'claw_web_users_by_tier{tier="trial"}', legend: 'Trial', color: '#96CEB4' }
  ], { x: 0, y: 23, w: 12, h: 8 })

  return builder
}

/**
 * 创建系统健康仪表盘
 */
export function createSystemHealthDashboard(): GrafanaDashboardBuilder {
  const builder = new GrafanaDashboardBuilder(
    'System Health Monitor',
    'claw-web-system-health'
  )

  // 系统评分
  builder.addStatPanel('Health Score', 'claw_web_health_score')

  // 用户活跃度
  builder.addGraphPanel('User Activity', [
    { expr: 'rate(claw_web_total_users[5m])', legend: 'Active Users/min' }
  ])

  // 会话分布
  builder.addTablePanel('Session Distribution by Age', [
    { text: 'Age Range', value: 'age_range' },
    { text: 'Count', value: 'count' }
  ])

  return builder
}

/**
 * 创建告警规则列表
 */
export function generateAlertRules(): AlertRule[] {
  return [
    {
      name: 'HighPoolUtilization',
      condition: 'claw_web_pool_utilization > 85',
      forDuration: '5m',
      severity: 'warning',
      description: 'Container pool utilization is above 85%',
      notificationChannel: 'slack-alerts'
    },
    {
      name: 'PoolExhausted',
      condition: 'claw_web_idle_containers < 3',
      forDuration: '3m',
      severity: 'critical',
      description: 'Running low on idle containers (< 3 available)',
      notificationChannel: 'pagerduty-critical'
    },
    {
      name: 'QueueBacklog',
      condition: 'claw_web_queue_length > 20',
      forDuration: '10m',
      severity: 'warning',
      description: 'Request queue backlog is growing (> 20 requests waiting)',
      notificationChannel: 'slack-alerts'
    },
    {
      name: 'HighErrorRate',
      condition: 'rate(claw_web_total_errors[5m]) / rate(claw_web_total_requests[5m]) > 0.05',
      forDuration: '5m',
      severity: 'critical',
      description: 'Error rate exceeds 5% threshold',
      notificationChannel: 'pagerduty-critical'
    }
  ]
}

/**
 * 生成Prometheus数据源配置片段
 */
export function generatePrometheusDatasourceConfig(url: string = 'http://prometheus:9090'): object {
  return {
    apiVersion: 1,
    datasources: [{
      id: 1,
      name: 'Prometheus',
      type: 'prometheus',
      url: url,
      access: 'proxy',
      isDefault: true,
      jsonData: {
        httpMethod: 'POST',
        manageAlerts: true,
        prometheusType: 'Prometheus'
      }
    }]
  }
}

/**
 * 生成docker-compose.yml中的Prometheus服务配置
 */
export function generatePrometheusServiceConfig(): object {
  return {
    image: 'prom/prometheus:v2.45.0',
    container_name: 'claude-prometheus',
    ports:
      - '${PROMETHEUS_PORT:-9090}:9090'
    ,
    volumes:
      - './monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro'
      , 'prometheus_data:/prometheus'
    ,
    command:
      '--config.file=/etc/prometheus/prometheus.yml'
      , '--storage.tsdb.retention.time=15d'
      , '--web.enable-lifecycle'
    ,
    networks:
      ['claude-network']
    ,
    depends_on:
      ['backend-master']
  }
}

/**
 * 生成prometheus.yml抓取配置
 */
export function generatePrometheusScrapeConfig(): string {
  return `
# Claw-Web Prometheus Configuration
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  # Master Service Metrics
  - job_name: 'claw-web-master'
    static_configs:
      - targets: ['backend-master:3000']
        labels:
          env: 'production'
          service: 'master'

  # Node Exporter (if available)
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']

alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - 'alertmanager:9093'

rule_files:
  - '/etc/prometheus/alert_rules.yml'
`.trim()
}

export default GrafanaDashboardBuilder

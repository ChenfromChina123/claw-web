/**
 * Production Deployment Guide - 生产环境部署指南
 *
 * 本文件包含：
 * - 部署前检查清单
 * - 环境变量配置说明
 * - Docker Compose生产配置
 * - 性能调优参数
 * - 监控告警设置
 * - 故障排查指南
 *
 * 使用场景：
 * - 首次生产部署
 * - 版本升级
 * - 运维参考手册
 */

// ==================== 1. 部署前检查清单 ====================

export const PRE_DEPLOYMENT_CHECKLIST = {
  version: '1.0.0',
  lastUpdated: '2026-04-12',
  sections: [
    {
      title: '🔧 基础设施准备',
      items: [
        { id: 'infra-1', task: '确认Docker版本 >= 20.10', critical: true, checked: false },
        { id: 'infra-2', task: '确认Docker Compose版本 >= 2.0', critical: true, checked: false },
        { id: 'infra-3', task: '确认系统可用内存 >= 16GB', critical: true, checked: false },
        { id: 'infra-4', task: '确认可用磁盘空间 >= 50GB', critical: true, checked: false },
        { id: 'infra-5', task: '配置Docker镜像加速器（国内）', critical: false, checked: false }
      ]
    },
    {
      title: '🔐 安全配置',
      items: [
        { id: 'sec-1', task: '设置强密码的JWT_SECRET（>=32字符）', critical: true, checked: false },
        { id: 'sec-2', task: '配置数据库密码（DB_PASSWORD）', critical: true, checked: false },
        { id: 'sec-3', task: '更新Anthropic API密钥', critical: true, checked: false },
        { id: 'sec-4', task: '启用HTTPS（SSL证书）', critical: true, checked: false },
        { id: 'sec-5', task: '配置防火墙规则（仅开放80/443）', critical: false, checked: false }
      ]
    },
    {
      title: '📦 服务配置',
      items: [
        { id: 'svc-1', task: '创建.env文件并填写所有必要变量', critical: true, checked: false },
        { id: 'svc-2', task: '调整资源限制（根据用户规模）', critical: true, checked: false },
        { id: 'svc-3', task: '配置数据持久化卷', critical: true, checked: false },
        { id: 'svc-4', task: '设置日志驱动和保留策略', critical: false, checked: false },
        { id: 'svc-5', task: '配置健康检查端点', critical: true, checked: false }
      ]
    },
    {
      title: '📊 监控告警',
      items: [
        { id: 'mon-1', task: '部署Prometheus服务', critical: false, checked: false },
        { id: 'mon-2', task: '部署Grafana仪表盘', critical: false, checked: false },
        { id: 'mon-3', task: '配置告警通知渠道（Slack/邮件）', critical: false, checked: false },
        { id: 'mon-4', task: '验证/metrics端点可访问', critical: false, checked: false }
      ]
    },
    {
      title: '🧪 功能验证',
      items: [
        { id: 'test-1', task: '运行单元测试套件', critical: true, checked: false },
        { id: 'test-2', task: '运行集成测试套件', critical: true, checked: false },
        { id: 'test-3', task: '执行性能基准测试', critical: false, checked: false },
        { id: 'test-4', task: '验证容器池化功能正常', critical: true, checked: false },
        { id: 'test-5', task: '测试备份恢复流程', critical: false, checked: false }
      ]
    }
  ]
}

// ==================== 2. 推荐的环境变量配置 ====================

export const RECOMMENDED_ENV_CONFIG = {
  // === 基础配置 ===
  NODE_ENV: 'production',
  PORT: '3000',

  // === 数据库配置 ===
  DB_HOST: 'mysql',
  DB_PORT: '3306',
  DB_USER: 'claude_user',
  DB_PASSWORD: '[CHANGE_ME_STRONG_PASSWORD]',
  DB_NAME: 'claude_code_haha',

  // === JWT认证 ===
  JWT_SECRET: '[CHANGE_ME_RANDOM_STRING_AT_LEAST_32_CHARS]',
  JWT_EXPIRATION: '24h',

  // === API密钥 ===
  ANTHROPIC_AUTH_TOKEN: '[YOUR_ANTHROPIC_API_KEY]',
  ANTHROPIC_BASE_URL: 'https://api.anthropic.com',

  // === 容器编排配置 ===
  ROLE: 'master',
  CONTAINER_POOL_MIN_SIZE: '5',
  CONTAINER_POOL_MAX_SIZE: '20',
  CONTAINER_IDLE_TIMEOUT_MS: '300000',
  CONTAINER_BASE_PORT: '3100',
  WORKER_IMAGE_NAME: 'claw-web-backend-worker:latest',

  // === 资源限制 ===
  MAX_USERS: '500',
  USER_STORAGE_QUOTA_MB: '500',
  USER_SESSION_LIMIT: '10',

  // === 日志配置 ===
  LOG_LEVEL: 'info',
  LOG_FORMAT: 'json',
  LOG_SAMPLE_RATE: '1.0',

  // === 备份配置 ===
  BACKUP_ROOT_DIR: '/app/backups',
  FULL_BACKUP_INTERVAL_HOURS: '24',
  BACKUP_RETENTION_DAYS: '30'
}

// ==================== 3. 生产环境docker-compose.yml增强版 ====================

export function generateProductionComposeConfig(): object {
  return {
    version: '3.8',
    services: {
      mysql: {
        image: 'mysql:8.0',
        container_name: 'claude-mysql-prod',
        restart: 'always',
        environment: {
          MYSQL_ROOT_PASSWORD: '${DB_ROOT_PASSWORD}',
          MYSQL_DATABASE: '${DB_NAME}',
          MYSQL_USER: '${DB_USER}',
          MYSQL_PASSWORD: '${DB_PASSWORD}'
        },
        volumes:
          ['prod_mysql_data:/var/lib/mysql']
        ,
        command: [
          '--character-set-server=utf8mb4',
          '--collation-server=utf8mb4_unicode_ci',
          '--max_connections=200',
          '--innodb_buffer_pool_size=268435456',
          '--innodb_log_file_size=67108864',
          '--binlog_format=ROW',
          '--expire_logs_days=7'
        ],
        networks: ['claude-network'],
        deploy: {
          resources: {
            limits: { memory: '512M', cpus: '1.0' },
            reservations: { memory: '256M' }
          }
        },
        logging: {
          driver: 'json-file',
          options: {
            'max-size': '100m',
            'max-file': '3'
          }
        }
      },

      backend_master: {
        build: {
          context: '.',
          dockerfile: 'server/Dockerfile'
        },
        container_name: 'claude-backend-master-prod',
        restart: 'always',
        ports: ['${PORT:-3000}:3000'],
        environment: {
          ...RECOMMENDED_ENV_CONFIG,
          NODE_OPTIONS: '--max-old-space-size=768 --optimize-for-size'
        },
        volumes:
          ['/var/run/docker.sock:/var/run/docker.sock']
          , 'prod_user_workspaces:/app/workspaces/users'
          , 'prod_session_workspaces:/app/workspaces/sessions'
          , 'prod_backup_data:/app/backups'
          , 'prod_logs:/app/logs'
        ,
        depends_on:
          ['mysql']
        ,
        networks: ['claude-network'],
        deploy: {
          resources: {
            limits: { memory: '1024M', cpus: '2.0' },
            reservations: { memory: '512M' }
          },
          restart_policy: {
            condition: 'on-failure',
            delay: '5s',
            max_attempts: 5,
            window: '120s'
          }
        },
        healthcheck: {
          test: ['CMD-SHELL', 'curl -f http://localhost:3000/api/health || exit 1'],
          interval: '30s',
          timeout: '10s',
          retries: '3',
          start_period: '60s'
        },
        logging: {
          driver: 'json-file',
          options: {
            'max-size': '200m',
            'max-file': '5'
          }
        }
      },

      frontend: {
        build: {
          context: '.',
          dockerfile: 'web/Dockerfile'
        },
        container_name: 'claude-frontend-prod',
        restart: 'always',
        ports: ['${FRONTEND_PORT:-8888}:80'],
        depends_on: ['backend_master'],
        networks: ['claude-network'],
        deploy: {
          resources: {
            limits: { memory: '128M', cpus: '0.5' }
          }
        }
      },

      prometheus: {
        image: 'prom/prometheus:v2.45.0',
        container_name: 'claude-prometheus-prod',
        ports: ['9090:9090'],
        volumes:
          ['./monitoring/prometheus.prod.yml:/etc/prometheus/prometheus.yml:ro']
          , 'prometheus_prod_data:/prometheus'
        ,
        networks: ['claude-network']
      },

      grafana: {
        image: 'grafana/grafana:10.2.0',
        container_name: 'claude-grafana-prod',
        ports: ['3001:3000'],
        environment: {
          GF_SECURITY_ADMIN_PASSWORD: '${GRAFANA_ADMIN_PASSWORD}'
        },
        volumes:
          ['grafana_prod_data:/var/lib/grafana']
          , './monitoring/grafana/provisioning:/etc/grafana/provisioning:ro'
        ,
        depends_on: ['prometheus'],
        networks: ['claude-network']
      }
    },

    networks: {
      'claude-network': {
        driver: 'bridge'
      }
    },

    volumes: {
      prod_mysql_data: {},
      prod_user_workspaces: {},
      prod_session_workspaces: {},
      prod_backup_data: {},
      prod_logs: {},
      prometheus_prod_data: {},
      grafana_prod_data: {}
    }
  }
}

// ==================== 4. 常见问题排查指南 ====================

export const TROUBLESHOOTING_GUIDE = {
  startupFailures: [
    {
      symptom: 'Master服务无法启动，报错"Cannot connect to MySQL"',
      cause: 'MySQL服务未就绪或连接配置错误',
      solution: [
        '检查docker-compose logs mysql',
        '确认DB_HOST、DB_PORT、DB_USER、DB_PASSWORD配置正确',
        '等待MySQL完全启动后再启动backend-master'
      ]
    },
    {
      symptom: 'Worker容器创建失败"Docker socket not found"',
      cause: '未正确挂载Docker socket或权限不足',
      solution: [
        '确认docker-compose.yml中包含 /var/run/docker.sock:/var/run/docker.sock',
        '确保运行docker compose的用户有Docker权限',
        '在Linux上可能需要将用户加入docker组'
      ]
    },
    {
      symptom: 'OOM Killer终止了backend-master进程',
      cause: '内存不足或内存泄漏',
      solution: [
        '增加容器内存限制（deploy.resources.limits.memory）',
        '检查NODE_OPTIONS中的--max-old-space-size是否合理',
        '查看监控面板识别内存增长趋势',
        '考虑减少CONTAINER_POOL_MAX_SIZE'
      ]
    }
  ],

  performanceIssues: [
    {
      symptom: 'API响应时间P99超过5秒',
      cause: '可能原因：数据库慢查询、Worker容器过载、网络延迟',
      solution: [
        '检查Prometheus中的查询耗时指标',
        '分析慢查询日志',
        '考虑增加Worker容器池大小',
        '检查是否有大量请求排队（队列长度指标）'
      ]
    },
    {
      symptom: '热容器命中率低于50%',
      cause: '并发用户数远超预期或预热策略不当',
      solution: [
        '增大CONTAINER_POOL_MIN_SIZE和MAX_SIZE',
        '检查调度算法是否合理分配容器',
        '考虑启用预测性预热功能'
      ]
    }
  ],

  dataIssues: [
    {
      symptom: '用户工作区数据丢失',
      cause: 'Volume未正确挂载或被误删除',
      solution: [
        '从最近的全量备份恢复',
        '检查Docker volume状态：docker volume ls',
        '验证backupManager是否正常运行定时备份'
      ]
    },
    {
      symptom: '容器映射数据不一致',
      cause: 'Master服务异常重启导致内存中映射丢失',
      solution: [
        '重启服务后userContainerMapper会自动从磁盘加载',
        '如果持久化文件损坏，需要重建映射关系',
        '定期检查.user-container-mappings.json文件完整性'
      ]
    }
  ]
}

// ==================== 5. 性能基准参考值 ====================

export const PERFORMANCE_BENCHMARKS = {
  startup: {
    targetMs: 15000,
    warningMs: 30000,
    criticalMs: 60000
  },

  apiResponseTime: {
    p50_targetMs: 200,
    p95_targetMs: 500,
    p99_targetMs: 1000,
    p50_warningMs: 500,
    p95_warningMs: 1500,
    p99_warningMs: 3000
  },

  throughput: {
    minRps: 100,
    targetRps: 500,
    maxRps: 1000
  },

  resourceUtilization: {
    memory_warningPercent: 75,
    memory_criticalPercent: 90,
    cpu_warningPercent: 70,
    cpu_criticalPercent: 85
  },

  availability: {
    targetPercent: 99.9,
    monthlyDowntimeMinutes: 43.8
  }
}

// ==================== 导出汇总 ====================

export default {
  PRE_DEPLOYMENT_CHECKLIST,
  RECOMMENDED_ENV_CONFIG,
  generateProductionComposeConfig,
  TROUBLESHOOTING_GUIDE,
  PERFORMANCE_BENCHMARKS
}

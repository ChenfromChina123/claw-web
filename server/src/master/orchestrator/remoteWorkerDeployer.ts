/**
 * 远程 Worker 部署器
 *
 * 功能：
 * - SSH 连接到远程服务器
 * - 传输部署文件（Dockerfile、启动脚本）
 * - 在远程服务器上构建和启动 Worker
 * - 跟踪部署进度
 * - 注册 Worker 到 Master
 *
 * @module RemoteWorkerDeployer
 */

import { NodeSSH } from 'node-ssh'
import { v4 as uuidv4 } from 'uuid'
import type {
  RemoteWorkerDeployConfig,
  RemoteWorkerDeployResult,
  DeployProgressItem,
  RemoteWorkerInstance
} from './types'
import { environmentChecker } from './environmentChecker'
import { getRemoteWorkerRegistry } from './remoteWorkerRegistry'

/**
 * 部署步骤枚举
 */
enum DeployStep {
  ENV_CHECK = 'env_check',
  SSH_CONNECT = 'ssh_connect',
  FILE_TRANSFER = 'file_transfer',
  DOCKER_BUILD = 'docker_build',
  CONTAINER_START = 'container_start',
  HEALTH_CHECK = 'health_check',
  REGISTER = 'register'
}

/**
 * 远程 Worker 部署器类
 */
export class RemoteWorkerDeployer {
  private masterHost: string
  private masterPort: number
  private masterToken: string

  constructor() {
    this.masterHost = process.env.MASTER_HOST || 'localhost'
    this.masterPort = parseInt(process.env.MASTER_PORT || '3000', 10)
    this.masterToken = process.env.MASTER_INTERNAL_TOKEN || 'internal-master-worker-token-2024'
  }

  /**
   * 部署远程 Worker
   *
   * @param config - 部署配置
   * @returns 部署结果
   */
  async deploy(config: RemoteWorkerDeployConfig): Promise<RemoteWorkerDeployResult> {
    const workerId = `remote-worker-${uuidv4().slice(0, 8)}`
    const sshPort = config.sshPort || 22
    const workerPort = config.workerPort || 4000

    // 初始化进度
    const progress: DeployProgressItem[] = [
      { step: DeployStep.ENV_CHECK, status: 'pending', message: '等待环境检查', timestamp: new Date() },
      { step: DeployStep.SSH_CONNECT, status: 'pending', message: '等待SSH连接', timestamp: new Date() },
      { step: DeployStep.FILE_TRANSFER, status: 'pending', message: '等待文件传输', timestamp: new Date() },
      { step: DeployStep.DOCKER_BUILD, status: 'pending', message: '等待Docker构建', timestamp: new Date() },
      { step: DeployStep.CONTAINER_START, status: 'pending', message: '等待容器启动', timestamp: new Date() },
      { step: DeployStep.HEALTH_CHECK, status: 'pending', message: '等待健康检查', timestamp: new Date() },
      { step: DeployStep.REGISTER, status: 'pending', message: '等待注册', timestamp: new Date() }
    ]

    // 创建初始记录
    const registry = getRemoteWorkerRegistry()
    await registry.createWorker({
      workerId,
      host: config.host,
      port: workerPort,
      sshPort,
      sshUsername: config.username,
      sshPasswordEncrypted: this.encryptPassword(config.password),
      status: 'deploying',
      healthStatus: 'unknown',
      labels: config.labels,
      createdAt: new Date(),
      updatedAt: new Date()
    })

    // 开始异步部署
    this.doDeploy(workerId, config, progress).catch(error => {
      console.error(`[RemoteWorkerDeployer] 部署失败 (${workerId}):`, error)
      this.updateProgress(progress, DeployStep.REGISTER, 'failed', `部署失败: ${error.message}`)
      registry.updateWorkerStatus(workerId, 'error', 'unhealthy')
    })

    return {
      workerId,
      status: 'deploying',
      host: config.host,
      port: workerPort,
      progress
    }
  }

  /**
   * 执行部署流程
   */
  private async doDeploy(
    workerId: string,
    config: RemoteWorkerDeployConfig,
    progress: DeployProgressItem[]
  ): Promise<void> {
    const sshPort = config.sshPort || 22
    const workerPort = config.workerPort || 4000
    const registry = getRemoteWorkerRegistry()

    const ssh = new NodeSSH()

    try {
      // 步骤 1: 环境检查
      this.updateProgress(progress, DeployStep.ENV_CHECK, 'in_progress', '正在检查环境...')
      const envCheck = await environmentChecker.checkEnvironment(
        config.host,
        sshPort,
        config.username,
        config.password,
        workerPort
      )

      if (!envCheck.passed) {
        const failedChecks = envCheck.checks.filter(c => !c.passed).map(c => c.message).join('; ')
        throw new Error(`环境检查未通过: ${failedChecks}`)
      }

      this.updateProgress(progress, DeployStep.ENV_CHECK, 'completed', '环境检查通过')

      // 步骤 2: SSH 连接
      this.updateProgress(progress, DeployStep.SSH_CONNECT, 'in_progress', '正在建立SSH连接...')
      await ssh.connect({
        host: config.host,
        port: sshPort,
        username: config.username,
        password: config.password
      })
      this.updateProgress(progress, DeployStep.SSH_CONNECT, 'completed', 'SSH连接成功')

      // 步骤 3: 传输部署文件
      this.updateProgress(progress, DeployStep.FILE_TRANSFER, 'in_progress', '正在传输部署文件...')
      await this.transferDeployFiles(ssh, workerPort)
      this.updateProgress(progress, DeployStep.FILE_TRANSFER, 'completed', '文件传输完成')

      // 步骤 4: Docker 构建
      this.updateProgress(progress, DeployStep.DOCKER_BUILD, 'in_progress', '正在构建Docker镜像...')
      await this.buildDockerImage(ssh)
      this.updateProgress(progress, DeployStep.DOCKER_BUILD, 'completed', 'Docker镜像构建完成')

      // 步骤 5: 启动容器
      this.updateProgress(progress, DeployStep.CONTAINER_START, 'in_progress', '正在启动Worker容器...')
      await this.startWorkerContainer(ssh, workerPort, workerId)
      this.updateProgress(progress, DeployStep.CONTAINER_START, 'completed', 'Worker容器启动完成')

      // 步骤 6: 健康检查
      this.updateProgress(progress, DeployStep.HEALTH_CHECK, 'in_progress', '正在执行健康检查...')
      const healthy = await this.waitForHealth(config.host, workerPort, 30)
      if (!healthy) {
        throw new Error('Worker健康检查失败')
      }
      this.updateProgress(progress, DeployStep.HEALTH_CHECK, 'completed', '健康检查通过')

      // 步骤 7: 注册到注册表
      this.updateProgress(progress, DeployStep.REGISTER, 'in_progress', '正在注册Worker...')

      // 获取系统信息
      const systemInfo = await environmentChecker.getSystemInfo(
        config.host,
        sshPort,
        config.username,
        config.password
      )

      await registry.updateWorker(workerId, {
        status: 'running',
        healthStatus: 'healthy',
        dockerVersion: systemInfo.dockerVersion,
        systemInfo: {
          os: systemInfo.os,
          arch: systemInfo.arch,
          cpuCores: systemInfo.cpuCores,
          memoryGB: systemInfo.memoryGB,
          diskGB: systemInfo.diskGB
        },
        lastHeartbeatAt: new Date(),
        updatedAt: new Date()
      })

      this.updateProgress(progress, DeployStep.REGISTER, 'completed', 'Worker注册成功')

      console.log(`[RemoteWorkerDeployer] 远程Worker部署成功: ${workerId} (${config.host}:${workerPort})`)

    } catch (error) {
      console.error(`[RemoteWorkerDeployer] 部署失败 (${workerId}):`, error)
      await registry.updateWorkerStatus(workerId, 'error', 'unhealthy')
      throw error
    } finally {
      ssh.dispose()
    }
  }

  /**
   * 更新部署进度
   */
  private updateProgress(
    progress: DeployProgressItem[],
    step: DeployStep,
    status: DeployProgressItem['status'],
    message: string
  ): void {
    const item = progress.find(p => p.step === step)
    if (item) {
      item.status = status
      item.message = message
      item.timestamp = new Date()
    }
    console.log(`[RemoteWorkerDeployer] [${step}] ${status}: ${message}`)
  }

  /**
   * 传输部署文件到远程服务器
   */
  private async transferDeployFiles(ssh: NodeSSH, workerPort: number): Promise<void> {
    // 创建工作目录
    await ssh.execCommand('mkdir -p /opt/claw-web-worker')

    // 生成 Dockerfile
    const dockerfile = this.generateDockerfile()
    await ssh.execCommand(`cat > /opt/claw-web-worker/Dockerfile << 'EOF'\n${dockerfile}\nEOF`)

    // 生成启动脚本
    const startScript = this.generateStartScript(workerPort)
    await ssh.execCommand(`cat > /opt/claw-web-worker/start.sh << 'EOF'\n${startScript}\nEOF`)
    await ssh.execCommand('chmod +x /opt/claw-web-worker/start.sh')

    // 生成 docker-compose.yml
    const composeFile = this.generateDockerCompose(workerPort, workerPort)
    await ssh.execCommand(`cat > /opt/claw-web-worker/docker-compose.yml << 'EOF'\n${composeFile}\nEOF`)
  }

  /**
   * 生成 Dockerfile
   */
  private generateDockerfile(): string {
    return `# 远程 Worker Dockerfile
FROM node:20-slim

# 安装必要工具
RUN apt-get update && apt-get install -y --no-install-recommends \\
    curl \\
    git \\
    openssh-client \\
    && rm -rf /var/lib/apt/lists/*

# 设置环境变量
ENV NODE_ENV=production
ENV CONTAINER_ROLE=worker
ENV PORT=4000
ENV WORKER_INTERNAL_PORT=4000

# 工作目录
WORKDIR /app

# 复制 Worker 代码（实际部署时会从 Master 获取）
COPY . .

# 安装依赖
RUN npm install --production 2>/dev/null || npm install

# 暴露端口
EXPOSE 4000

# 健康检查
HEALTHCHECK --interval=60s --timeout=30s --start-period=60s --retries=5 \\
    CMD curl -f http://localhost:4000/internal/health || exit 1

# 启动命令
CMD ["node", "src/index.js"]
`
  }

  /**
   * 生成启动脚本
   */
  private generateStartScript(workerPort: number): string {
    return `#!/bin/bash
set -e

echo "[Remote Worker] 启动Worker..."
echo "  Worker Port: ${workerPort}"
echo "  Master Host: ${this.masterHost}:${this.masterPort}"

# 停止旧容器（如果存在）
docker stop claw-web-remote-worker 2>/dev/null || true
docker rm claw-web-remote-worker 2>/dev/null || true

# 启动新容器
docker run -d \\
  --name claw-web-remote-worker \\
  --restart unless-stopped \\
  -p ${workerPort}:4000 \\
  -e CONTAINER_ROLE=worker \\
  -e PORT=4000 \\
  -e MASTER_HOST=${this.masterHost} \\
  -e MASTER_PORT=${this.masterPort} \\
  -e MASTER_INTERNAL_TOKEN=${this.masterToken} \\
  -e WORKER_ID=$(hostname)-${workerPort} \\
  -v /var/run/docker.sock:/var/run/docker.sock \\
  claw-web-remote-worker:latest

echo "[Remote Worker] 启动完成"
echo "  Container ID: $(docker ps -q -f name=claw-web-remote-worker)"
`
  }

  /**
   * 生成 docker-compose.yml
   */
  private generateDockerCompose(workerPort: number, containerPort: number): string {
    return `version: '3.8'

services:
  worker:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: claw-web-remote-worker
    restart: unless-stopped
    ports:
      - "${workerPort}:${containerPort}"
    environment:
      - CONTAINER_ROLE=worker
      - PORT=${containerPort}
      - MASTER_HOST=${this.masterHost}
      - MASTER_PORT=${this.masterPort}
      - MASTER_INTERNAL_TOKEN=${this.masterToken}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:${containerPort}/internal/health"]
      interval: 60s
      timeout: 30s
      retries: 5
      start_period: 60s
`
  }

  /**
   * 构建 Docker 镜像
   */
  private async buildDockerImage(ssh: NodeSSH): Promise<void> {
    // 这里简化处理，实际应该从 Master 获取 Worker 代码
    // 先创建一个基础镜像，实际代码通过 volume 挂载或后续更新
    const result = await ssh.execCommand(
      'cd /opt/claw-web-worker && docker build -t claw-web-remote-worker:latest .',
      { execOptions: { timeout: 300000 } }
    )

    if (result.code !== 0) {
      throw new Error(`Docker构建失败: ${result.stderr}`)
    }
  }

  /**
   * 启动 Worker 容器
   */
  private async startWorkerContainer(
    ssh: NodeSSH,
    workerPort: number,
    workerId: string
  ): Promise<void> {
    // 使用 docker-compose 启动
    const result = await ssh.execCommand(
      `cd /opt/claw-web-worker && WORKER_ID=${workerId} docker-compose up -d`,
      { execOptions: { timeout: 120000 } }
    )

    if (result.code !== 0) {
      throw new Error(`容器启动失败: ${result.stderr}`)
    }

    // 等待容器启动
    await new Promise(resolve => setTimeout(resolve, 5000))
  }

  /**
   * 等待 Worker 健康检查通过
   */
  private async waitForHealth(
    host: string,
    port: number,
    maxRetries: number
  ): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(`http://${host}:${port}/internal/health`, {
          method: 'GET',
          headers: { 'X-Master-Token': this.masterToken }
        })

        if (response.ok) {
          return true
        }
      } catch {
        // 忽略错误，继续重试
      }

      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    return false
  }

  /**
   * 加密密码（简单实现，生产环境应使用更强的加密）
   */
  private encryptPassword(password: string): string {
    // 使用 Base64 编码，生产环境应使用 AES 等强加密
    return Buffer.from(password).toString('base64')
  }

  /**
   * 解密密码
   */
  decryptPassword(encrypted: string): string {
    return Buffer.from(encrypted, 'base64').toString('utf8')
  }
}

/**
 * 远程 Worker 部署器单例实例
 */
let remoteWorkerDeployer: RemoteWorkerDeployer | null = null

/**
 * 获取远程 Worker 部署器实例
 */
export function getRemoteWorkerDeployer(): RemoteWorkerDeployer {
  if (!remoteWorkerDeployer) {
    remoteWorkerDeployer = new RemoteWorkerDeployer()
  }
  return remoteWorkerDeployer
}

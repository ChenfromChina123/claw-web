/**
 * 网络隔离验证脚本
 * 
 * 验证 Worker、Master、MySQL 之间的网络隔离配置
 * 确保 Worker 容器无法直接访问 MySQL 数据库
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('='.repeat(70));
console.log('  网络隔离配置验证工具');
console.log('='.repeat(70));

const errors = [];
const warnings = [];
const successes = [];

// 1. 检查 docker-compose.yml 配置
console.log('\n[1/4] 检查 docker-compose.yml 网络配置...\n');

const dockerComposePath = path.join(__dirname, '..', 'docker-compose.yml');
const dockerComposeContent = fs.readFileSync(dockerComposePath, 'utf8');

// 检查是否有 worker-network 定义
if (dockerComposeContent.includes('worker-network:')) {
  successes.push('✅ docker-compose.yml 中定义了 worker-network');
} else {
  errors.push('❌ docker-compose.yml 中缺少 worker-network 定义');
}

// 检查 MySQL 是否只在 claude-network
if (dockerComposeContent.includes('claude-network') && 
    dockerComposeContent.includes('安全说明：MySQL 只在 claude-network 网络中')) {
  successes.push('✅ MySQL 服务配置了网络隔离说明');
} else {
  warnings.push('⚠️ MySQL 服务缺少网络隔离说明注释');
}

// 检查 Master 是否同时连接两个网络
// 查找 backend-master 服务后的 networks 配置
const masterServiceIndex = dockerComposeContent.indexOf('backend-master:');
const frontendServiceIndex = dockerComposeContent.indexOf('frontend:');
if (masterServiceIndex !== -1 && frontendServiceIndex !== -1) {
  const masterSection = dockerComposeContent.substring(masterServiceIndex, frontendServiceIndex);
  // 检查是否包含两个网络
  if (masterSection.includes('claude-network') && masterSection.includes('worker-network')) {
    successes.push('✅ Master 服务同时连接 claude-network 和 worker-network');
  } else {
    errors.push('❌ Master 服务需要同时连接 claude-network 和 worker-network');
  }
} else {
  errors.push('❌ 无法定位 Master 服务配置范围');
}

// 检查 DOCKER_NETWORK_NAME 环境变量配置
if (dockerComposeContent.includes('DOCKER_NETWORK_NAME=claw-web_worker-network')) {
  successes.push('✅ Master 环境变量中设置了 DOCKER_NETWORK_NAME=claw-web_worker-network');
} else {
  errors.push('❌ Master 环境变量中缺少 DOCKER_NETWORK_NAME 配置');
}

// 2. 检查容器编排器配置
console.log('[2/4] 检查容器编排器网络配置...\n');

const orchestratorPath = path.join(__dirname, '..', 'server', 'src', 'orchestrator', 'containerOrchestrator.ts');
const orchestratorContent = fs.readFileSync(orchestratorPath, 'utf8');

// 检查默认网络配置
if (orchestratorContent.includes("'claw-web_worker-network'") || 
    orchestratorContent.includes('claw-web_worker-network')) {
  successes.push('✅ 容器编排器默认使用 claw-web_worker-network');
} else {
  errors.push('❌ 容器编排器未配置使用 claw-web_worker-network');
}

// 检查安全注释
if (orchestratorContent.includes('安全加固：Worker 容器使用独立的 worker-network')) {
  successes.push('✅ 容器编排器包含网络隔离安全注释');
} else {
  warnings.push('⚠️ 容器编排器缺少网络隔离安全注释');
}

// 3. 检查数据库连接隔离
console.log('[3/4] 检查数据库连接隔离配置...\n');

const mysqlPath = path.join(__dirname, '..', 'server', 'src', 'db', 'mysql.ts');
const mysqlContent = fs.readFileSync(mysqlPath, 'utf8');

if (mysqlContent.includes('isWorkerMode()') && mysqlContent.includes('return null')) {
  successes.push('✅ 数据库模块在 Worker 模式下禁用连接');
} else {
  errors.push('❌ 数据库模块缺少 Worker 模式检测');
}

// 4. 检查 Worker Dockerfile
console.log('[4/4] 检查 Worker Dockerfile 安全配置...\n');

const workerDockerfilePath = path.join(__dirname, '..', 'server', 'Dockerfile.worker');
const workerDockerfileContent = fs.readFileSync(workerDockerfilePath, 'utf8');

if (workerDockerfileContent.includes('DB_HOST=""') && 
    workerDockerfileContent.includes('DB_PASSWORD=""')) {
  successes.push('✅ Worker Dockerfile 中清除了数据库环境变量');
} else {
  errors.push('❌ Worker Dockerfile 未清除数据库环境变量');
}

if (workerDockerfileContent.includes('Worker 不连接数据库')) {
  successes.push('✅ Worker Dockerfile 包含安全说明注释');
} else {
  warnings.push('⚠️ Worker Dockerfile 缺少安全说明注释');
}

// 输出结果
console.log('\n' + '='.repeat(70));
console.log('  验证结果');
console.log('='.repeat(70) + '\n');

if (successes.length > 0) {
  console.log('✅ 通过项：');
  successes.forEach(msg => console.log('   ' + msg));
  console.log('');
}

if (warnings.length > 0) {
  console.log('⚠️  警告项：');
  warnings.forEach(msg => console.log('   ' + msg));
  console.log('');
}

if (errors.length > 0) {
  console.log('❌ 错误项：');
  errors.forEach(msg => console.log('   ' + msg));
  console.log('');
}

// 总结
console.log('='.repeat(70));
console.log('  总结');
console.log('='.repeat(70));
console.log(`\n   通过: ${successes.length} 项`);
console.log(`   警告: ${warnings.length} 项`);
console.log(`   错误: ${errors.length} 项`);

if (errors.length === 0) {
  console.log('\n✅ 网络隔离配置验证通过！');
  console.log('\n架构说明：');
  console.log('   • MySQL 只在 claude-network 中');
  console.log('   • Master 同时连接 claude-network 和 worker-network');
  console.log('   • Worker 只在 worker-network 中，无法直接访问 MySQL');
  console.log('   • Worker 应用层禁用数据库连接（双重保护）');
  process.exit(0);
} else {
  console.log('\n❌ 网络隔离配置存在问题，请修复上述错误。');
  process.exit(1);
}

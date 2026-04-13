<template>
  <div class="deployment-wizard-overlay">
    <div class="deployment-wizard">
      <div class="wizard-header">
        <h2 class="wizard-title">创建新项目</h2>
        <button @click="$emit('close')" class="close-btn">×</button>
      </div>

      <div class="wizard-content">
        <div class="step-indicator">
          <div
            v-for="(step, index) in steps"
            :key="index"
            :class="['step', { active: currentStep === index, completed: currentStep > index }]"
          >
            <div class="step-number">{{ index + 1 }}</div>
            <div class="step-label">{{ step }}</div>
          </div>
        </div>

        <div class="step-content">
          <div v-if="currentStep === 0" class="step-panel">
            <h3 class="panel-title">选择项目类型</h3>
            <div class="project-types">
              <div
                v-for="type in projectTypes"
                :key="type.value"
                @click="form.type = type.value"
                :class="['type-card', { selected: form.type === type.value }]"
              >
                <div class="type-icon">{{ type.icon }}</div>
                <div class="type-name">{{ type.label }}</div>
                <div class="type-description">{{ type.description }}</div>
              </div>
            </div>
          </div>

          <div v-if="currentStep === 1" class="step-panel">
            <h3 class="panel-title">项目信息</h3>
            <div class="form-group">
              <label class="form-label">项目名称 *</label>
              <input
                v-model="form.name"
                type="text"
                class="form-input"
                placeholder="输入项目名称"
              />
            </div>

            <div class="form-group">
              <label class="form-label">代码来源</label>
              <select v-model="form.sourceType" class="form-select">
                <option value="upload">上传代码</option>
                <option value="git">Git 仓库</option>
                <option value="template">使用模板</option>
              </select>
            </div>

            <div v-if="form.sourceType === 'git'" class="form-group">
              <label class="form-label">Git 仓库 URL</label>
              <input
                v-model="form.sourceUrl"
                type="text"
                class="form-input"
                placeholder="https://github.com/user/repo.git"
              />
            </div>
          </div>

          <div v-if="currentStep === 2" class="step-panel">
            <h3 class="panel-title">运行配置</h3>
            
            <div class="form-group">
              <label class="form-label">构建命令</label>
              <input
                v-model="form.buildCommand"
                type="text"
                class="form-input"
                placeholder="npm install && npm run build"
              />
            </div>

            <div class="form-group">
              <label class="form-label">启动命令 *</label>
              <input
                v-model="form.startCommand"
                type="text"
                class="form-input"
                placeholder="npm start"
              />
            </div>

            <div class="form-group">
              <label class="form-label">内存限制</label>
              <select v-model="form.memoryLimit" class="form-select">
                <option value="128M">128 MB</option>
                <option value="256M">256 MB</option>
                <option value="512M">512 MB</option>
                <option value="1G">1 GB</option>
                <option value="2G">2 GB</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">环境变量</label>
              <div class="env-vars">
                <div v-for="(env, index) in envVars" :key="index" class="env-var-row">
                  <input
                    v-model="env.key"
                    type="text"
                    class="form-input env-key"
                    placeholder="变量名"
                  />
                  <input
                    v-model="env.value"
                    type="text"
                    class="form-input env-value"
                    placeholder="变量值"
                  />
                  <button @click="removeEnvVar(index)" class="remove-env-btn">×</button>
                </div>
                <button @click="addEnvVar" class="add-env-btn">+ 添加环境变量</button>
              </div>
            </div>
          </div>

          <div v-if="currentStep === 3" class="step-panel">
            <h3 class="panel-title">确认部署</h3>
            <div class="summary">
              <div class="summary-item">
                <span class="summary-label">项目名称:</span>
                <span class="summary-value">{{ form.name }}</span>
              </div>
              <div class="summary-item">
                <span class="summary-label">项目类型:</span>
                <span class="summary-value">{{ getProjectTypeName(form.type) }}</span>
              </div>
              <div class="summary-item">
                <span class="summary-label">代码来源:</span>
                <span class="summary-value">{{ getSourceTypeName(form.sourceType) }}</span>
              </div>
              <div class="summary-item" v-if="form.sourceUrl">
                <span class="summary-label">Git URL:</span>
                <span class="summary-value">{{ form.sourceUrl }}</span>
              </div>
              <div class="summary-item" v-if="form.buildCommand">
                <span class="summary-label">构建命令:</span>
                <span class="summary-value">{{ form.buildCommand }}</span>
              </div>
              <div class="summary-item">
                <span class="summary-label">启动命令:</span>
                <span class="summary-value">{{ form.startCommand }}</span>
              </div>
              <div class="summary-item">
                <span class="summary-label">内存限制:</span>
                <span class="summary-value">{{ form.memoryLimit }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="wizard-footer">
        <button
          v-if="currentStep > 0"
          @click="currentStep--"
          class="footer-btn secondary"
        >
          上一步
        </button>
        <button
          v-if="currentStep < steps.length - 1"
          @click="nextStep"
          class="footer-btn primary"
          :disabled="!canProceed"
        >
          下一步
        </button>
        <button
          v-if="currentStep === steps.length - 1"
          @click="handleCreate"
          class="footer-btn primary"
          :disabled="creating"
        >
          {{ creating ? '创建中...' : '创建项目' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDeploymentStore } from '@/stores/deployment'
import type { CreateDeploymentRequest } from '@/api/deploymentApi'

const emit = defineEmits<{
  close: []
  created: []
}>()

const deploymentStore = useDeploymentStore()

const steps = ['选择类型', '项目信息', '运行配置', '确认部署']
const currentStep = ref(0)
const creating = ref(false)

const form = ref<CreateDeploymentRequest>({
  name: '',
  type: 'nodejs',
  sourceType: 'upload',
  sourceUrl: '',
  buildCommand: '',
  startCommand: '',
  memoryLimit: '256M',
  autoRestart: true
})

const envVars = ref<Array<{ key: string; value: string }>>([])

const projectTypes = [
  {
    value: 'nodejs',
    label: 'Node.js',
    icon: '📦',
    description: 'Node.js 应用程序'
  },
  {
    value: 'python',
    label: 'Python',
    icon: '🐍',
    description: 'Python 应用程序'
  },
  {
    value: 'static',
    label: '静态网站',
    icon: '🌐',
    description: 'HTML/CSS/JS 静态网站'
  },
  {
    value: 'custom',
    label: '自定义',
    icon: '⚙️',
    description: '自定义应用程序'
  }
]

const canProceed = computed(() => {
  if (currentStep.value === 0) {
    return !!form.value.type
  }
  if (currentStep.value === 1) {
    return !!form.value.name
  }
  if (currentStep.value === 2) {
    return !!form.value.startCommand
  }
  return true
})

function getProjectTypeName(type: string): string {
  const projectType = projectTypes.find(t => t.value === type)
  return projectType ? projectType.label : type
}

function getSourceTypeName(source: string): string {
  const sourceNames: Record<string, string> = {
    upload: '上传代码',
    git: 'Git 仓库',
    template: '使用模板'
  }
  return sourceNames[source] || source
}

function addEnvVar() {
  envVars.value.push({ key: '', value: '' })
}

function removeEnvVar(index: number) {
  envVars.value.splice(index, 1)
}

function nextStep() {
  if (canProceed.value) {
    currentStep.value++
  }
}

async function handleCreate() {
  creating.value = true

  const envVarsMap: Record<string, string> = {}
  envVars.value.forEach(env => {
    if (env.key && env.value) {
      envVarsMap[env.key] = env.value
    }
  })

  const data: CreateDeploymentRequest = {
    ...form.value,
    envVars: envVarsMap
  }

  const success = await deploymentStore.createProject(data)

  creating.value = false

  if (success) {
    emit('created')
  }
}
</script>

<style scoped>
.deployment-wizard-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.deployment-wizard {
  width: 90%;
  max-width: 800px;
  max-height: 90vh;
  background: var(--bg-primary);
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.wizard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color);
}

.wizard-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: var(--bg-secondary);
  border-radius: 6px;
  font-size: 24px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: var(--bg-tertiary);
}

.wizard-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.step-indicator {
  display: flex;
  justify-content: space-between;
  margin-bottom: 32px;
}

.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
}

.step-number {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--bg-secondary);
  border: 2px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.step.active .step-number {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: white;
}

.step.completed .step-number {
  background: var(--success-color);
  border-color: var(--success-color);
  color: white;
}

.step-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.step.active .step-label {
  color: var(--text-primary);
  font-weight: 600;
}

.step-content {
  min-height: 300px;
}

.panel-title {
  margin: 0 0 20px;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.project-types {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.type-card {
  padding: 20px;
  border: 2px solid var(--border-color);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;
}

.type-card:hover {
  border-color: var(--primary-color);
}

.type-card.selected {
  border-color: var(--primary-color);
  background: rgba(var(--primary-color-rgb), 0.1);
}

.type-icon {
  font-size: 40px;
  margin-bottom: 12px;
}

.type-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.type-description {
  font-size: 13px;
  color: var(--text-secondary);
}

.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.form-input,
.form-select {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 14px;
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.form-input:focus,
.form-select:focus {
  outline: none;
  border-color: var(--primary-color);
}

.env-vars {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.env-var-row {
  display: flex;
  gap: 8px;
}

.env-key {
  flex: 1;
}

.env-value {
  flex: 2;
}

.remove-env-btn {
  width: 40px;
  height: 40px;
  border: none;
  background: var(--error-color);
  color: white;
  border-radius: 6px;
  font-size: 20px;
  cursor: pointer;
}

.add-env-btn {
  padding: 10px 16px;
  border: 1px dashed var(--border-color);
  background: transparent;
  border-radius: 6px;
  font-size: 13px;
  color: var(--primary-color);
  cursor: pointer;
  transition: all 0.2s ease;
}

.add-env-btn:hover {
  border-color: var(--primary-color);
  background: rgba(var(--primary-color-rgb), 0.05);
}

.summary {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.summary-item {
  display: flex;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-radius: 8px;
}

.summary-label {
  font-size: 14px;
  color: var(--text-secondary);
}

.summary-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.wizard-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid var(--border-color);
}

.footer-btn {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.footer-btn.primary {
  background: var(--primary-color);
  color: white;
}

.footer-btn.primary:hover:not(:disabled) {
  opacity: 0.9;
}

.footer-btn.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.footer-btn.secondary {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.footer-btn.secondary:hover {
  background: var(--bg-tertiary);
}
</style>

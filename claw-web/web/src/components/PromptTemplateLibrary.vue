<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, h } from 'vue'
import {
  NButton, NIcon, NInput, NSelect, NTag, NForm, NFormItem,
  NEmpty, NScrollbar, NPopconfirm, useMessage
} from 'naive-ui'
import {
  AddOutline, SearchOutline, StarOutline, Star,
  CreateOutline, TrashOutline, CodeOutline,
  PencilOutline, AnalyticsOutline, LanguageOutline, BulbOutline, FolderOutline,
  SaveOutline, PricetagsOutline as TagOutline
} from '@vicons/ionicons5'
import { promptTemplateApi, type PromptTemplate, type PromptTemplateCategory } from '@/api/promptTemplateApi'

const props = defineProps<{
  sessionId?: string
}>()

const emit = defineEmits<{
  useTemplate: [content: string]
  close: []
}>()

const message = useMessage()

/**
 * 当前视图状态：列表 | 新建 | 编辑 | 使用
 */
type ViewMode = 'list' | 'create' | 'edit' | 'use'
const activeView = ref<ViewMode>('list')

// 状态
const categories = ref<PromptTemplateCategory[]>([])
const templates = ref<PromptTemplate[]>([])
const selectedCategoryId = ref<string | null>(null)
const searchKeyword = ref('')
const showFavoritesOnly = ref(false)
const isLoading = ref(false)

// 新建/编辑表单
const formData = ref({
  id: '',
  title: '',
  content: '',
  description: '',
  categoryId: '',
  tags: ''
})

// 使用模板表单
const useFormData = ref({
  template: null as PromptTemplate | null,
  variables: {} as Record<string, string>
})

// 图标映射
const iconMap: Record<string, typeof FolderOutline> = {
  code: CodeOutline,
  pencil: PencilOutline,
  analytics: AnalyticsOutline,
  language: LanguageOutline,
  bulb: BulbOutline,
  folder: FolderOutline
}

// 分类选项
const categoryOptions = computed(() => [
  { label: '全部分类', value: null },
  ...categories.value.map(c => ({
    label: c.name,
    value: c.id,
    icon: iconMap[c.icon] || FolderOutline
  }))
])

// 收藏选项
const favoriteOptions = [
  { label: '全部模板', value: false },
  { label: '我的收藏', value: true }
]

// 当前视图标题
const viewTitle = computed(() => {
  switch (activeView.value) {
    case 'create': return '新建模板'
    case 'edit': return '编辑模板'
    case 'use': return `使用模板 - ${useFormData.value.template?.title || ''}`
    default: return '提示词模板库'
  }
})

// 过滤后的模板
const filteredTemplates = computed(() => {
  let result = templates.value

  if (selectedCategoryId.value) {
    result = result.filter(t => t.categoryId === selectedCategoryId.value)
  }

  if (showFavoritesOnly.value) {
    result = result.filter(t => t.isFavorite)
  }

  if (searchKeyword.value.trim()) {
    const keyword = searchKeyword.value.toLowerCase()
    result = result.filter(t =>
      t.title.toLowerCase().includes(keyword) ||
      t.description?.toLowerCase().includes(keyword) ||
      t.content.toLowerCase().includes(keyword) ||
      t.tags.some(tag => tag.toLowerCase().includes(keyword))
    )
  }

  return result
})

// 按分类分组模板
const templatesByCategory = computed(() => {
  const grouped: Record<string, PromptTemplate[]> = {}
  for (const tpl of filteredTemplates.value) {
    const catId = tpl.categoryId || 'uncategorized'
    if (!grouped[catId]) grouped[catId] = []
    grouped[catId].push(tpl)
  }
  return grouped
})

/**
 * 获取分类名称
 */
function getCategoryName(categoryId: string | null): string {
  if (!categoryId) return '未分类'
  const cat = categories.value.find(c => c.id === categoryId)
  return cat?.name || '未分类'
}

/**
 * 获取分类图标
 */
function getCategoryIcon(categoryId: string | null) {
  if (!categoryId) return FolderOutline
  const cat = categories.value.find(c => c.id === categoryId)
  return iconMap[cat?.icon || 'folder'] || FolderOutline
}

/**
 * 渲染分类选项标签
 */
function renderCategoryLabel(option: { label: string; value: string | null; icon?: typeof FolderOutline }) {
  if (!option.value) {
    return option.label
  }
  return h('div', { style: 'display:flex;align-items:center;gap:6px' }, [
    h(NIcon, { size: 14 }, { default: () => h(option.icon || FolderOutline) }),
    option.label
  ])
}

/**
 * 加载数据
 */
async function loadData() {
  isLoading.value = true
  try {
    const [cats, tpls] = await Promise.all([
      promptTemplateApi.getCategories(),
      promptTemplateApi.getTemplates()
    ])
    categories.value = cats
    templates.value = tpls
  } catch (error) {
    message.error('加载数据失败')
    console.error(error)
  } finally {
    isLoading.value = false
  }
}

/**
 * 创建模板
 */
async function handleCreate() {
  if (!formData.value.title.trim() || !formData.value.content.trim()) {
    message.warning('请填写标题和内容')
    return
  }

  try {
    const tags = formData.value.tags
      ? formData.value.tags.split(',').map(t => t.trim()).filter(Boolean)
      : []

    await promptTemplateApi.createTemplate({
      title: formData.value.title,
      content: formData.value.content,
      description: formData.value.description,
      categoryId: formData.value.categoryId || undefined,
      tags
    })

    message.success('创建成功')
    activeView.value = 'list'
    resetForm()
    await loadData()
  } catch (error) {
    message.error('创建失败')
    console.error(error)
  }
}

/**
 * 编辑模板
 */
async function handleUpdate() {
  if (!formData.value.id) return
  if (!formData.value.title.trim() || !formData.value.content.trim()) {
    message.warning('请填写标题和内容')
    return
  }

  try {
    const tags = formData.value.tags
      ? formData.value.tags.split(',').map(t => t.trim()).filter(Boolean)
      : []

    await promptTemplateApi.updateTemplate(formData.value.id, {
      title: formData.value.title,
      content: formData.value.content,
      description: formData.value.description,
      categoryId: formData.value.categoryId || undefined,
      tags
    })

    message.success('更新成功')
    activeView.value = 'list'
    resetForm()
    await loadData()
  } catch (error) {
    message.error('更新失败')
    console.error(error)
  }
}

/**
 * 删除模板
 */
async function handleDelete(id: string) {
  try {
    await promptTemplateApi.deleteTemplate(id)
    message.success('删除成功')
    await loadData()
  } catch (error) {
    message.error('删除失败')
    console.error(error)
  }
}

/**
 * 切换收藏
 */
async function handleToggleFavorite(template: PromptTemplate) {
  try {
    await promptTemplateApi.toggleFavorite(template.id, !template.isFavorite)
    template.isFavorite = !template.isFavorite
  } catch (error) {
    message.error('操作失败')
    console.error(error)
  }
}

/**
 * 打开使用视图
 */
function openUseView(template: PromptTemplate) {
  useFormData.value.template = template

  // 提取模板中的变量
  const variablePattern = /\{\{(\w+)\}\}/g
  const variables: Record<string, string> = {}
  let match
  while ((match = variablePattern.exec(template.content)) !== null) {
    variables[match[1]] = ''
  }
  useFormData.value.variables = variables
  activeView.value = 'use'
}

/**
 * 使用模板
 */
function confirmUseTemplate() {
  if (!useFormData.value.template) return

  let content = useFormData.value.template.content

  // 替换变量
  for (const [key, value] of Object.entries(useFormData.value.variables)) {
    content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
  }

  emit('useTemplate', content)
  activeView.value = 'list'
  message.success('已使用模板')
}

/**
 * 重置表单
 */
function resetForm() {
  formData.value = {
    id: '',
    title: '',
    content: '',
    description: '',
    categoryId: '',
    tags: ''
  }
}

/**
 * 打开编辑视图
 */
function openEditView(template: PromptTemplate) {
  formData.value = {
    id: template.id,
    title: template.title,
    content: template.content,
    description: template.description || '',
    categoryId: template.categoryId || '',
    tags: template.tags.join(', ')
  }
  activeView.value = 'edit'
}

/**
 * 打开创建视图
 */
function openCreateView() {
  resetForm()
  activeView.value = 'create'
}

/**
 * 返回列表视图
 */
function goBackToList() {
  activeView.value = 'list'
  resetForm()
  useFormData.value = { template: null, variables: {} }
}

onMounted(() => {
  void loadData()
})

/**
 * 组件卸载时重置视图状态
 */
onUnmounted(() => {
  activeView.value = 'list'
  resetForm()
  useFormData.value = { template: null, variables: {} }
  searchKeyword.value = ''
  selectedCategoryId.value = null
  showFavoritesOnly.value = false
})
</script>

<template>
  <div class="prompt-template-library">
    <!-- 内容区域 -->
    <div class="ptl-body">
      <!-- ========== 列表视图 ========== -->
      <template v-if="activeView === 'list'">
        <!-- 工具栏 -->
        <div class="ptl-toolbar">
          <NInput
            v-model:value="searchKeyword"
            placeholder="搜索模板..."
            size="small"
            clearable
            class="ptl-search"
          >
            <template #prefix><NIcon><SearchOutline /></NIcon></template>
          </NInput>

          <NSelect
            v-model:value="selectedCategoryId"
            :options="categoryOptions"
            size="small"
            placeholder="分类"
            clearable
            class="ptl-category-select"
          />

          <NSelect
            v-model:value="showFavoritesOnly"
            :options="favoriteOptions"
            size="small"
            placeholder="筛选"
            class="ptl-favorite-select"
          />

          <NButton size="small" type="primary" @click="openCreateView">
            <template #icon><NIcon><AddOutline /></NIcon></template>
            新建
          </NButton>
        </div>

        <!-- 模板列表 -->
        <NScrollbar class="ptl-content">
          <div v-if="filteredTemplates.length === 0" class="ptl-empty">
            <NEmpty description="暂无模板">
              <template #extra>
                <NButton size="small" @click="openCreateView">创建模板</NButton>
              </template>
            </NEmpty>
          </div>

          <div v-else class="ptl-list">
            <template v-for="(catTemplates, catId) in templatesByCategory" :key="catId">
              <div class="ptl-category-header">
                <NIcon :size="14"><component :is="getCategoryIcon(catId as any)" /></NIcon>
                <span>{{ getCategoryName(catId as any) }}</span>
                <span class="ptl-category-count">{{ catTemplates.length }}</span>
              </div>

              <div class="ptl-templates">
                <div
                  v-for="template in catTemplates"
                  :key="template.id"
                  class="ptl-template-card"
                  :class="{ 'is-builtin': template.isBuiltin }"
                >
                  <div class="ptl-template-header">
                    <span class="ptl-template-title">{{ template.title }}</span>
                    <div class="ptl-template-actions">
                      <button
                        class="ptl-star-btn"
                        @click="handleToggleFavorite(template)"
                        :title="template.isFavorite ? '取消收藏' : '收藏'"
                      >
                        <NIcon :size="14">
                          <Star v-if="template.isFavorite" />
                          <StarOutline v-else />
                        </NIcon>
                      </button>
                    </div>
                  </div>

                  <p v-if="template.description" class="ptl-template-desc">
                    {{ template.description }}
                  </p>

                  <div class="ptl-template-tags">
                    <span v-if="template.isBuiltin" class="ptl-tag builtin">内置</span>
                    <span v-for="tag in template.tags.slice(0, 3)" :key="tag" class="ptl-tag">
                      {{ tag }}
                    </span>
                  </div>

                  <div class="ptl-template-footer">
                    <span class="ptl-use-count">使用 {{ template.useCount }} 次</span>
                    <div class="ptl-template-buttons">
                      <button class="ptl-btn primary" @click="openUseView(template)">使用</button>
                      <button
                        v-if="!template.isBuiltin"
                        class="ptl-btn"
                        @click="openEditView(template)"
                        title="编辑"
                      >
                        <NIcon :size="12"><CreateOutline /></NIcon>
                      </button>
                      <NPopconfirm
                        v-if="!template.isBuiltin"
                        @positive-click="handleDelete(template.id)"
                      >
                        <template #trigger>
                          <button class="ptl-btn danger" title="删除">
                            <NIcon :size="12"><TrashOutline /></NIcon>
                          </button>
                        </template>
                        确定删除该模板？
                      </NPopconfirm>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </NScrollbar>
      </template>

      <!-- ========== 新建/编辑视图 ========== -->
      <template v-else-if="activeView === 'create' || activeView === 'edit'">
        <NScrollbar class="ptl-form-content">
          <div class="ptl-form-wrapper">
            <!-- 页面标题 -->
            <div class="ptl-form-header">
              <h2 class="ptl-form-title">{{ activeView === 'create' ? '新建模板' : '编辑模板' }}</h2>
            </div>

            <NForm label-placement="top" class="ptl-form">
              <!-- 标题 -->
              <NFormItem required>
                <template #label>
                  <span class="ptl-form-label">模板标题</span>
                </template>
                <NInput
                  v-model:value="formData.title"
                  placeholder="输入模板名称"
                />
              </NFormItem>

              <!-- 分类 -->
              <NFormItem>
                <template #label>
                  <span class="ptl-form-label">分类</span>
                </template>
                <NSelect
                  v-model:value="formData.categoryId"
                  :options="categoryOptions.filter(o => o.value !== null)"
                  :render-label="renderCategoryLabel"
                  placeholder="选择分类（可选）"
                  clearable
                >
                  <template #empty>
                    <div class="ptl-select-empty">
                      <NIcon :size="20" :depth="3"><FolderOutline /></NIcon>
                      <span>暂无分类</span>
                    </div>
                  </template>
                </NSelect>
              </NFormItem>

              <!-- 内容 -->
              <NFormItem required>
                <template #label>
                  <span class="ptl-form-label">
                    提示词内容
                    <span class="ptl-label-hint">使用 <code v-pre>{{变量名}}</code> 定义变量</span>
                  </span>
                </template>
                <NInput
                  v-model:value="formData.content"
                  type="textarea"
                  placeholder="输入提示词内容..."
                  :rows="6"
                  class="ptl-content-input"
                />
              </NFormItem>

              <!-- 描述 -->
              <NFormItem>
                <template #label>
                  <span class="ptl-form-label">描述</span>
                </template>
                <NInput
                  v-model:value="formData.description"
                  type="textarea"
                  placeholder="描述模板用途（可选）"
                  :rows="2"
                />
              </NFormItem>

              <!-- 标签 -->
              <NFormItem>
                <template #label>
                  <span class="ptl-form-label">标签</span>
                </template>
                <NInput
                  v-model:value="formData.tags"
                  placeholder="标签1, 标签2, 标签3"
                />
              </NFormItem>
            </NForm>
          </div>
        </NScrollbar>

        <div class="ptl-form-footer">
          <NButton size="small" @click="goBackToList">取消</NButton>
          <NButton
            size="small"
            type="primary"
            @click="activeView === 'create' ? handleCreate() : handleUpdate()"
          >
            {{ activeView === 'create' ? '创建' : '保存' }}
          </NButton>
        </div>
      </template>

      <!-- ========== 使用模板视图 ========== -->
      <template v-else-if="activeView === 'use' && useFormData.template">
        <NScrollbar class="ptl-use-content">
          <p class="ptl-use-title">{{ useFormData.template.title }}</p>

          <!-- 变量输入 -->
          <div v-if="Object.keys(useFormData.variables).length > 0" class="ptl-use-variables">
            <NForm label-placement="top">
              <NFormItem
                v-for="(value, key) in useFormData.variables"
                :key="key"
                :label="`{{${key}}}`"
              >
                <NInput
                  v-model:value="useFormData.variables[key]"
                  :placeholder="`请输入 ${key}`"
                />
              </NFormItem>
            </NForm>
          </div>

          <!-- 预览 -->
          <div class="ptl-use-preview">
            <p class="ptl-use-preview-label">预览：</p>
            <pre class="ptl-use-preview-content">{{ useFormData.template.content }}</pre>
          </div>
        </NScrollbar>

        <div class="ptl-form-footer">
          <NButton @click="goBackToList">取消</NButton>
          <NButton type="primary" @click="confirmUseTemplate">使用此模板</NButton>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.prompt-template-library {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1e1e1e;
  overflow: hidden;
}

/* ========== 内容区域 ========== */
.ptl-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

/* ========== 工具栏 ========== */
.ptl-toolbar {
  display: flex;
  gap: 6px;
  padding: 8px 12px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.ptl-search {
  flex: 1;
  min-width: 120px;
}

.ptl-category-select {
  width: 120px;
}

.ptl-favorite-select {
  width: 100px;
}

/* ========== 模板列表 ========== */
.ptl-content {
  flex: 1;
  min-height: 0;
}

.ptl-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 40px;
}

.ptl-list {
  padding: 12px;
}

.ptl-category-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #858585;
  margin-bottom: 10px;
  padding-left: 4px;
}

.ptl-category-count {
  font-size: 11px;
  font-weight: normal;
  color: #6e6e6e;
  background: #2d2d2d;
  padding: 1px 6px;
  border-radius: 8px;
}

.ptl-templates {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}

/* ========== 模板卡片 ========== */
.ptl-template-card {
  background: #252526;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  padding: 12px;
  transition: all 0.15s;
  cursor: default;
}

.ptl-template-card:hover {
  border-color: #007acc;
  background: #2a2a2a;
}

.ptl-template-card.is-builtin {
  border-left: 3px solid #18a058;
}

.ptl-template-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.ptl-template-title {
  font-weight: 600;
  font-size: 13px;
  color: #cccccc;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ptl-template-actions {
  display: flex;
  gap: 2px;
}

.ptl-star-btn {
  background: transparent;
  border: none;
  color: #6e6e6e;
  cursor: pointer;
  padding: 2px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  transition: all 0.15s;
}

.ptl-star-btn:hover {
  color: #ffd700;
  background: rgba(255, 215, 0, 0.1);
}

.ptl-template-desc {
  font-size: 11px;
  color: #858585;
  margin-bottom: 8px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ptl-template-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}

.ptl-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  background: #2d2d2d;
  color: #858585;
}

.ptl-tag.builtin {
  background: rgba(24, 160, 88, 0.15);
  color: #18a058;
}

.ptl-template-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 8px;
  border-top: 1px solid #3c3c3c;
}

.ptl-use-count {
  font-size: 10px;
  color: #6e6e6e;
}

.ptl-template-buttons {
  display: flex;
  gap: 4px;
}

.ptl-btn {
  background: #2d2d2d;
  border: 1px solid #3c3c3c;
  color: #ccc;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 3px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 3px;
  transition: all 0.15s;
}

.ptl-btn:hover {
  background: #383838;
  border-color: #555;
}

.ptl-btn.primary {
  background: #007acc;
  border-color: #007acc;
  color: #fff;
}

.ptl-btn.primary:hover {
  background: #1177bb;
}

.ptl-btn.danger {
  color: #f44336;
}

.ptl-btn.danger:hover {
  background: rgba(244, 67, 54, 0.15);
}

/* ========== 表单视图 ========== */
.ptl-form-content {
  flex: 1;
  min-height: 0;
  background: #1a1a1a;
}

.ptl-form-wrapper {
  max-width: 520px;
  margin: 0 auto;
  padding: 16px 20px;
}

.ptl-form-header {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #333;
}

.ptl-form-title {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}

.ptl-form {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ptl-form-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 500;
  color: #aaa;
}

.ptl-label-hint {
  font-size: 11px;
  color: #666;
  font-weight: normal;
  margin-left: auto;
}

.ptl-content-input {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  line-height: 1.5;
}

.ptl-form-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 20px;
  border-top: 1px solid #333;
  flex-shrink: 0;
  background: #1e1e1e;
}

/* 分类选择器空状态 */
.ptl-select-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px;
  color: #666;
  font-size: 12px;
}

/* ========== 使用模板视图 ========== */
.ptl-use-content {
  flex: 1;
  padding: 16px;
  min-height: 0;
}

.ptl-use-title {
  font-weight: 600;
  font-size: 15px;
  color: #cccccc;
  margin-bottom: 16px;
}

.ptl-use-variables {
  margin-bottom: 20px;
  background: #252526;
  padding: 12px;
  border-radius: 6px;
  border: 1px solid #3c3c3c;
}

.ptl-use-preview {
  background: #252526;
  border-radius: 6px;
  padding: 12px;
  border: 1px solid #3c3c3c;
}

.ptl-use-preview-label {
  font-size: 12px;
  color: #858585;
  margin-bottom: 8px;
}

.ptl-use-preview-content {
  font-size: 13px;
  color: #cccccc;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  font-family: var(--font-family-mono, 'Consolas', monospace);
}
</style>

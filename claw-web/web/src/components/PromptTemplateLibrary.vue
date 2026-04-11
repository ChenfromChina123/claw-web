<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import {
  NCard, NButton, NIcon, NInput, NSelect, NTag, NModal, NForm, NFormItem,
  NEmpty, NScrollbar, NPopconfirm, useMessage, useDialog
} from 'naive-ui'
import {
  AddOutline, SearchOutline, CloseOutline, StarOutline, Star,
  CreateOutline, TrashOutline, ReorderFourOutline, CodeOutline,
  PencilOutline, AnalyticsOutline, LanguageOutline, BulbOutline, FolderOutline
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
const dialog = useDialog()

// 状态
const categories = ref<PromptTemplateCategory[]>([])
const templates = ref<PromptTemplate[]>([])
const selectedCategoryId = ref<string | null>(null)
const searchKeyword = ref('')
const showFavoritesOnly = ref(false)
const isLoading = ref(false)
const showCreateModal = ref(false)
const showEditModal = ref(false)
const showUseModal = ref(false)

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

// 获取分类名称
function getCategoryName(categoryId: string | null): string {
  if (!categoryId) return '未分类'
  const cat = categories.value.find(c => c.id === categoryId)
  return cat?.name || '未分类'
}

// 获取分类图标
function getCategoryIcon(categoryId: string | null) {
  if (!categoryId) return FolderOutline
  const cat = categories.value.find(c => c.id === categoryId)
  return iconMap[cat?.icon || 'folder'] || FolderOutline
}

// 加载数据
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

// 创建模板
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
    showCreateModal.value = false
    resetForm()
    await loadData()
  } catch (error) {
    message.error('创建失败')
    console.error(error)
  }
}

// 编辑模板
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
    showEditModal.value = false
    resetForm()
    await loadData()
  } catch (error) {
    message.error('更新失败')
    console.error(error)
  }
}

// 删除模板
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

// 切换收藏
async function handleToggleFavorite(template: PromptTemplate) {
  try {
    await promptTemplateApi.toggleFavorite(template.id, !template.isFavorite)
    template.isFavorite = !template.isFavorite
  } catch (error) {
    message.error('操作失败')
    console.error(error)
  }
}

// 打开使用弹窗
function openUseModal(template: PromptTemplate) {
  useFormData.value.template = template

  // 提取模板中的变量
  const variablePattern = /\{\{(\w+)\}\}/g
  const variables: Record<string, string> = {}
  let match
  while ((match = variablePattern.exec(template.content)) !== null) {
    variables[match[1]] = ''
  }
  useFormData.value.variables = variables
  showUseModal.value = true
}

// 使用模板
function confirmUseTemplate() {
  if (!useFormData.value.template) return

  let content = useFormData.value.template.content

  // 替换变量
  for (const [key, value] of Object.entries(useFormData.value.variables)) {
    content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
  }

  emit('useTemplate', content)
  showUseModal.value = false
  message.success('已使用模板')
}

// 重置表单
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

// 打开编辑弹窗
function openEditModal(template: PromptTemplate) {
  formData.value = {
    id: template.id,
    title: template.title,
    content: template.content,
    description: template.description || '',
    categoryId: template.categoryId || '',
    tags: template.tags.join(', ')
  }
  showEditModal.value = true
}

// 打开创建弹窗
function openCreateModal() {
  resetForm()
  showCreateModal.value = true
}

onMounted(() => {
  void loadData()
})
</script>

<template>
  <div class="prompt-template-library">
    <!-- 头部 -->
    <div class="ptl-header">
      <div class="ptl-title">
        <NIcon :size="20"><ReorderFourOutline /></NIcon>
        <span>提示词模板库</span>
      </div>
      <NButton size="small" @click="emit('close')">
        <template #icon><NIcon><CloseOutline /></NIcon></template>
      </NButton>
    </div>

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

      <NButton size="small" type="primary" @click="openCreateModal">
        <template #icon><NIcon><AddOutline /></NIcon></template>
        新建
      </NButton>
    </div>

    <!-- 模板列表 -->
    <NScrollbar class="ptl-content">
      <div v-if="filteredTemplates.length === 0" class="ptl-empty">
        <NEmpty description="暂无模板">
          <template #extra>
            <NButton size="small" @click="openCreateModal">创建模板</NButton>
          </template>
        </NEmpty>
      </div>

      <div v-else class="ptl-list">
        <template v-for="(catTemplates, catId) in templatesByCategory" :key="catId">
          <div class="ptl-category-header">
            <NIcon :size="16"><component :is="getCategoryIcon(catId as any)" /></NIcon>
            <span>{{ getCategoryName(catId as any) }}</span>
            <span class="ptl-category-count">{{ catTemplates.length }}</span>
          </div>

          <div class="ptl-templates">
            <NCard
              v-for="template in catTemplates"
              :key="template.id"
              size="small"
              class="ptl-template-card"
              :class="{ 'is-builtin': template.isBuiltin }"
            >
              <div class="ptl-template-header">
                <span class="ptl-template-title">{{ template.title }}</span>
                <div class="ptl-template-actions">
                  <NButton
                    text
                    size="tiny"
                    @click="handleToggleFavorite(template)"
                  >
                    <template #icon>
                      <NIcon>
                        <Star v-if="template.isFavorite" />
                        <StarOutline v-else />
                      </NIcon>
                    </template>
                  </NButton>
                </div>
              </div>

              <p v-if="template.description" class="ptl-template-desc">
                {{ template.description }}
              </p>

              <div class="ptl-template-tags">
                <NTag v-if="template.isBuiltin" size="tiny" type="info">内置</NTag>
                <NTag v-for="tag in template.tags.slice(0, 3)" :key="tag" size="tiny">
                  {{ tag }}
                </NTag>
              </div>

              <div class="ptl-template-footer">
                <span class="ptl-use-count">使用 {{ template.useCount }} 次</span>
                <div class="ptl-template-buttons">
                  <NButton size="tiny" @click="openUseModal(template)">使用</NButton>
                  <NButton
                    v-if="!template.isBuiltin"
                    size="tiny"
                    @click="openEditModal(template)"
                  >
                    <template #icon><NIcon><CreateOutline /></NIcon></template>
                  </NButton>
                  <NPopconfirm
                    v-if="!template.isBuiltin"
                    @positive-click="handleDelete(template.id)"
                  >
                    <template #trigger>
                      <NButton size="tiny" type="error">
                        <template #icon><NIcon><TrashOutline /></NIcon></template>
                      </NButton>
                    </template>
                    确定删除该模板？
                  </NPopconfirm>
                </div>
              </div>
            </NCard>
          </div>
        </template>
      </div>
    </NScrollbar>

    <!-- 创建模板弹窗 -->
    <NModal
      v-model:show="showCreateModal"
      preset="card"
      title="新建模板"
      style="width: 600px; max-width: 90vw;"
    >
      <NForm label-placement="top">
        <NFormItem label="标题" required>
          <NInput v-model:value="formData.title" placeholder="请输入模板标题" />
        </NFormItem>

        <NFormItem label="分类">
          <NSelect
            v-model:value="formData.categoryId"
            :options="categoryOptions.filter(o => o.value !== null)"
            placeholder="选择分类"
            clearable
          />
        </NFormItem>

        <NFormItem label="描述">
          <NInput
            v-model:value="formData.description"
            type="textarea"
            placeholder="简要描述模板用途"
            :rows="2"
          />
        </NFormItem>

        <NFormItem label="内容" required>
          <NInput
            v-model:value="formData.content"
            type="textarea"
            placeholder="输入提示词内容，使用 {{variable}} 表示变量"
            :rows="6"
          />
        </NFormItem>

        <NFormItem label="标签（逗号分隔）">
          <NInput v-model:value="formData.tags" placeholder="如：代码, 优化, 助手" />
        </NFormItem>
      </NForm>

      <template #footer>
        <div class="ptl-modal-footer">
          <NButton @click="showCreateModal = false">取消</NButton>
          <NButton type="primary" @click="handleCreate">创建</NButton>
        </div>
      </template>
    </NModal>

    <!-- 编辑模板弹窗 -->
    <NModal
      v-model:show="showEditModal"
      preset="card"
      title="编辑模板"
      style="width: 600px; max-width: 90vw;"
    >
      <NForm label-placement="top">
        <NFormItem label="标题" required>
          <NInput v-model:value="formData.title" placeholder="请输入模板标题" />
        </NFormItem>

        <NFormItem label="分类">
          <NSelect
            v-model:value="formData.categoryId"
            :options="categoryOptions.filter(o => o.value !== null)"
            placeholder="选择分类"
            clearable
          />
        </NFormItem>

        <NFormItem label="描述">
          <NInput
            v-model:value="formData.description"
            type="textarea"
            placeholder="简要描述模板用途"
            :rows="2"
          />
        </NFormItem>

        <NFormItem label="内容" required>
          <NInput
            v-model:value="formData.content"
            type="textarea"
            placeholder="输入提示词内容，使用 {{variable}} 表示变量"
            :rows="6"
          />
        </NFormItem>

        <NFormItem label="标签（逗号分隔）">
          <NInput v-model:value="formData.tags" placeholder="如：代码, 优化, 助手" />
        </NFormItem>
      </NForm>

      <template #footer>
        <div class="ptl-modal-footer">
          <NButton @click="showEditModal = false">取消</NButton>
          <NButton type="primary" @click="handleUpdate">保存</NButton>
        </div>
      </template>
    </NModal>

    <!-- 使用模板弹窗 -->
    <NModal
      v-model:show="showUseModal"
      preset="card"
      title="使用模板"
      style="width: 500px; max-width: 90vw;"
    >
      <div v-if="useFormData.template" class="ptl-use-modal">
        <p class="ptl-use-title">{{ useFormData.template.title }}</p>

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

        <div class="ptl-use-preview">
          <p class="ptl-use-preview-label">预览：</p>
          <div class="ptl-use-preview-content">
            {{ useFormData.template.content }}
          </div>
        </div>
      </div>

      <template #footer>
        <div class="ptl-modal-footer">
          <NButton @click="showUseModal = false">取消</NButton>
          <NButton type="primary" @click="confirmUseTemplate">使用</NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.prompt-template-library {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-secondary);
  border-radius: 8px;
}

.ptl-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.ptl-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 15px;
}

.ptl-toolbar {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  flex-wrap: wrap;
}

.ptl-search {
  flex: 1;
  min-width: 150px;
}

.ptl-category-select {
  width: 140px;
}

.ptl-favorite-select {
  width: 120px;
}

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
  padding: 16px;
}

.ptl-category-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 12px;
  padding-left: 4px;
}

.ptl-category-count {
  font-size: 12px;
  font-weight: normal;
  color: var(--text-tertiary);
  background: var(--bg-tertiary);
  padding: 2px 8px;
  border-radius: 10px;
}

.ptl-templates {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.ptl-template-card {
  transition: all 0.2s;
}

.ptl-template-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.ptl-template-card.is-builtin {
  border-left: 3px solid #18a058;
}

.ptl-template-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.ptl-template-title {
  font-weight: 600;
  font-size: 14px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ptl-template-actions {
  display: flex;
  gap: 4px;
}

.ptl-template-desc {
  font-size: 12px;
  color: var(--text-secondary);
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

.ptl-template-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
}

.ptl-use-count {
  font-size: 11px;
  color: var(--text-tertiary);
}

.ptl-template-buttons {
  display: flex;
  gap: 4px;
}

.ptl-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.ptl-use-modal {
  max-height: 60vh;
  overflow-y: auto;
}

.ptl-use-title {
  font-weight: 600;
  font-size: 16px;
  margin-bottom: 16px;
}

.ptl-use-variables {
  margin-bottom: 16px;
}

.ptl-use-preview {
  background: var(--bg-tertiary);
  border-radius: 8px;
  padding: 12px;
}

.ptl-use-preview-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.ptl-use-preview-content {
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>

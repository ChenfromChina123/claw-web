<script setup lang="ts">
/**
 * 技能市场组件
 * 展示和管理所有可用的技能，支持搜索、筛选和启用/禁用功能
 */

import { ref, computed, onMounted } from 'vue'
import {
  NCard, NButton, NSpace, NTag, NInput, NGrid, NGridItem,
  NEmpty, NModal, NDescriptions, NDescriptionsItem, NPopover,
  NScrollbar, useMessage, NSpin, NBadge
} from 'naive-ui'
import skillApi from '@/api/skillApi'
import type { SkillDefinition, SkillCategory } from '@/api/skillApi'

const message = useMessage()

const skills = ref<SkillDefinition[]>([])
const categories = ref<SkillCategory[]>([])
const loading = ref(false)
const searchQuery = ref('')
const selectedCategory = ref<string | null>(null)
const selectedSkill = ref<SkillDefinition | null>(null)
const showDetailModal = ref(false)
const viewMode = ref<'grid' | 'list'>('grid')
const sidebarCollapsed = ref(false)

const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

const filteredSkills = computed(() => {
  return skills.value.filter(skill => {
    const matchCategory = !selectedCategory.value || skill.category.id === selectedCategory.value
    
    const matchSearch = !searchQuery.value || 
      skill.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      skill.tags.some(tag => tag.toLowerCase().includes(searchQuery.value.toLowerCase()))
    
    return matchCategory && matchSearch
  })
})

const categoryStats = computed(() => {
  const stats: Record<string, number> = {}
  skills.value.forEach(skill => {
    stats[skill.category.id] = (stats[skill.category.id] || 0) + 1
  })
  return stats
})

const loadSkills = async () => {
  loading.value = true
  try {
    const response = await skillApi.listSkills()
    skills.value = response.skills
    categories.value = response.categories
  } catch (error) {
    message.error('加载技能列表失败')
    console.error('Failed to load skills:', error)
  } finally {
    loading.value = false
  }
}

const toggleSkill = async (skill: SkillDefinition) => {
  try {
    const response = await skillApi.toggleSkill(skill.id, !skill.isEnabled)
    if (response.success) {
      skill.isEnabled = response.skill.isEnabled
      message.success(skill.isEnabled ? '技能已启用' : '技能已禁用')
    }
  } catch (error) {
    message.error('操作失败')
    console.error('Failed to toggle skill:', error)
  }
}

const showSkillDetail = (skill: SkillDefinition) => {
  selectedSkill.value = skill
  showDetailModal.value = true
}

const getCategoryColor = (categoryId: string): string => {
  const colors: Record<string, string> = {
    code: 'info',
    refactor: 'warning',
    test: 'success',
    review: 'primary',
    debug: 'error',
    deploy: 'warning',
    docs: 'info',
    security: 'error',
    performance: 'warning',
    database: 'info',
    api: 'success',
    frontend: 'primary',
    backend: 'info',
    devops: 'warning',
    other: 'default',
  }
  return colors[categoryId] || 'default'
}

const getCategoryLabel = (categoryId: string): string => {
  const category = categories.value.find(c => c.id === categoryId)
  return category?.name || categoryId
}



const formatInputSchema = (schema: Record<string, unknown> | undefined): string => {
  if (!schema) return '无'
  try {
    return JSON.stringify(schema, null, 2)
  } catch {
    return String(schema)
  }
}

const getSkillTagColor = (tag: string): string => {
  const colors = ['primary', 'success', 'info', 'warning', 'error']
  const index = tag.length % colors.length
  return colors[index]
}

onMounted(() => {
  loadSkills()
})
</script>

<template>
  <div class="skill-market">
    <div class="market-header">
      <div class="header-left">
        <NInput
          v-model:value="searchQuery"
          placeholder="搜索技能（名称/描述/标签）"
          clearable
          class="search-input"
          style="width: 300px"
        />
      </div>
      
      <div class="header-right">
        <NSpace>
          <NButton size="small" @click="loadSkills" :loading="loading">
            刷新
          </NButton>
          <NButton 
            size="small" 
            @click="viewMode = viewMode === 'grid' ? 'list' : 'grid'"
          >
            {{ viewMode === 'grid' ? '列表视图' : '网格视图' }}
          </NButton>
        </NSpace>
      </div>
    </div>

    <div class="market-content">
      <div class="category-sidebar" :class="{ collapsed: sidebarCollapsed }">
        <div class="sidebar-toggle" @click="toggleSidebar">
          <svg 
            class="toggle-icon" 
            :class="{ rotated: sidebarCollapsed }"
            viewBox="0 0 16 16" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M5.64645 3.14645C5.45118 3.34171 5.45118 3.65829 5.64645 3.85355L9.79289 8L5.64645 12.1464C5.45118 12.3417 5.45118 12.6583 5.64645 12.8536C5.84171 13.0488 6.15829 13.0488 6.35355 12.8536L10.8536 8.35355C11.0488 8.15829 11.0488 7.84171 10.8536 7.64645L6.35355 3.14645C6.15829 2.95118 5.84171 2.95118 5.64645 3.14645Z" fill="currentColor"></path>
          </svg>
        </div>
        <div v-show="!sidebarCollapsed" class="category-list">
          <NBadge 
            :value="skills.length" 
            :type="!selectedCategory ? 'info' : 'default'"
            class="category-item"
            :class="{ active: !selectedCategory }"
            @click="selectedCategory = null"
          >
            <span>全部技能</span>
          </NBadge>
          
          <NBadge
            v-for="cat in categories"
            :key="cat.id"
            :value="categoryStats[cat.id] || 0"
            :type="selectedCategory === cat.id ? 'info' : 'default'"
            class="category-item"
            :class="{ active: selectedCategory === cat.id }"
            @click="selectedCategory = cat.id"
          >
            <span>{{ getCategoryLabel(cat.id) }}</span>
          </NBadge>
        </div>
      </div>

      <div class="skills-container">
        <NScrollbar>
          <div v-if="loading" class="loading-container">
            <NSpin size="medium" />
            <span>加载技能中...</span>
          </div>

          <NEmpty 
            v-else-if="filteredSkills.length === 0" 
            description="没有找到匹配的技能"
            style="padding: 40px"
          />

          <NGrid 
            v-else
            :cols="viewMode === 'grid' ? '2 s:2 m:3 l:4 xl:4 2xl:5' : 1"
            :x-gap="16"
            :y-gap="16"
            :class="['skills-grid', viewMode]"
          >
            <NGridItem v-for="skill in filteredSkills" :key="skill.id">
              <NCard 
                :title="skill.name"
                :class="['skill-card', { disabled: !skill.isEnabled }]"
                hoverable
                @click="showSkillDetail(skill)"
              >
                <template #header-extra>
                  <NPopover trigger="hover">
                    <template #trigger>
                      <NTag 
                        size="small" 
                        :type="getCategoryColor(skill.category.id) as any"
                      >
                        {{ getCategoryLabel(skill.category.id) }}
                      </NTag>
                    </template>
                    <span>{{ skill.category.description || skill.category.name }}</span>
                  </NPopover>
                </template>

                <p class="skill-description">{{ skill.description }}</p>

                <div class="skill-tags">
                  <NTag
                    v-for="tag in skill.tags.slice(0, 3)"
                    :key="tag"
                    size="small"
                    :type="getSkillTagColor(tag) as any"
                  >
                    {{ tag }}
                  </NTag>
                  <NTag v-if="skill.tags.length > 3" size="small">
                    +{{ skill.tags.length - 3 }}
                  </NTag>
                </div>

                <div class="skill-footer">
                  <NSpace justify="space-between" align="center">
                    <span class="skill-version">v{{ skill.version }}</span>
                    <NButton
                      size="small"
                      :type="skill.isEnabled ? 'success' : 'default'"
                      @click.stop="toggleSkill(skill)"
                    >
                      {{ skill.isEnabled ? '已启用' : '已禁用' }}
                    </NButton>
                  </NSpace>
                </div>
              </NCard>
            </NGridItem>
          </NGrid>
        </NScrollbar>
      </div>
    </div>

    <NModal
      v-model:show="showDetailModal"
      preset="card"
      :title="selectedSkill?.name || '技能详情'"
      style="width: 800px; max-width: 90vw"
    >
      <div v-if="selectedSkill" class="skill-detail">
        <NDescriptions bordered :column="2">
          <NDescriptionsItem label="技能名称">
            {{ selectedSkill.name }}
          </NDescriptionsItem>
          <NDescriptionsItem label="技能 ID">
            <NCode :code="selectedSkill.id" language="text" />
          </NDescriptionsItem>
          <NDescriptionsItem label="类别">
            <NTag :type="getCategoryColor(selectedSkill.category.id) as any">
              {{ getCategoryLabel(selectedSkill.category.id) }}
            </NTag>
          </NDescriptionsItem>
          <NDescriptionsItem label="版本">
            v{{ selectedSkill.version }}
          </NDescriptionsItem>
          <NDescriptionsItem label="作者">
            {{ selectedSkill.author || '未知' }}
          </NDescriptionsItem>
          <NDescriptionsItem label="状态">
            <NTag :type="selectedSkill.isEnabled ? 'success' : 'error'">
              {{ selectedSkill.isEnabled ? '已启用' : '已禁用' }}
            </NTag>
          </NDescriptionsItem>
          <NDescriptionsItem label="描述" :span="2">
            {{ selectedSkill.description }}
          </NDescriptionsItem>
          <NDescriptionsItem label="标签" :span="2">
            <NSpace>
              <NTag
                v-for="tag in selectedSkill.tags"
                :key="tag"
                :type="getSkillTagColor(tag) as any"
              >
                {{ tag }}
              </NTag>
            </NSpace>
          </NDescriptionsItem>
          <NDescriptionsItem label="输入参数" :span="2">
            <NCode 
              :code="formatInputSchema(selectedSkill.inputSchema)" 
              language="json"
              word-wrap
            />
          </NDescriptionsItem>
          <NDescriptionsItem label="文件路径" :span="2">
            <NCode :code="selectedSkill.filePath" language="text" />
          </NDescriptionsItem>
        </NDescriptions>

        <div class="detail-actions" style="margin-top: 24px">
          <NSpace>
            <NButton
              :type="selectedSkill.isEnabled ? 'warning' : 'success'"
              @click="toggleSkill(selectedSkill)"
            >
              {{ selectedSkill.isEnabled ? '禁用此技能' : '启用此技能' }}
            </NButton>
            <NButton @click="showDetailModal = false">
              关闭
            </NButton>
          </NSpace>
        </div>
      </div>
    </NModal>
  </div>
</template>

<style scoped>
.skill-market {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--n-color);
  border-radius: 8px;
  overflow: hidden;
}

.market-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--n-border-color);
  background: var(--n-color);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-input {
  width: 300px;
}

.market-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.category-sidebar {
  flex: 0 0 200px;
  border-right: 1px solid var(--n-border-color);
  background: var(--n-color);
  overflow-y: auto;
  position: relative;
  transition: flex 0.3s ease;
}

.category-sidebar.collapsed {
  flex: 0 0 48px;
}

.sidebar-toggle {
  position: absolute;
  top: 50%;
  right: -16px;
  transform: translateY(-50%);
  width: 32px;
  height: 64px;
  background: var(--n-color);
  border: 1px solid var(--n-border-color);
  border-radius: 0 8px 8px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
  transition: all 0.2s;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
}

.sidebar-toggle:hover {
  background: var(--n-color-hover);
  width: 36px;
}

.toggle-icon {
  width: 20px;
  height: 20px;
  color: var(--n-text-color-2);
  transition: transform 0.3s ease;
}

.toggle-icon.rotated {
  transform: rotate(180deg);
}

.category-list {
  display: flex;
  flex-direction: column;
  padding: 12px;
  gap: 8px;
}

.category-item {
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 6px;
  transition: background 0.2s;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.category-item:hover {
  background: var(--n-color-hover);
}

.category-item.active {
  background: var(--n-color-pressed);
}

.skills-container {
  flex: 1;
  overflow: hidden;
  padding: 16px;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px;
  color: var(--n-text-color-3);
}

.skills-grid {
  padding: 8px;
}

.skills-grid.list .skill-card {
  margin-bottom: 12px;
}

.skill-card {
  height: 100%;
  transition: all 0.3s;
  cursor: pointer;
}

.skill-card.disabled {
  opacity: 0.6;
  filter: grayscale(0.5);
}

.skill-card.disabled:hover {
  opacity: 0.8;
  filter: grayscale(0.3);
}

.skill-description {
  font-size: 13px;
  color: var(--n-text-color-2);
  margin: 0 0 12px 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.6;
}

.skill-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.skill-footer {
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--n-border-color);
}

.skill-version {
  font-size: 12px;
  color: var(--n-text-color-3);
}

.skill-detail {
  max-height: 70vh;
  overflow-y: auto;
}

.detail-actions {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 768px) {
  .market-content {
    flex-direction: column;
  }

  .category-sidebar {
    flex: none;
    border-right: none;
    border-bottom: 1px solid var(--n-border-color);
    max-height: 200px;
  }

  .category-sidebar.collapsed {
    flex: none;
    max-height: 48px;
  }

  .sidebar-toggle {
    display: none;
  }

  .category-list {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .search-input {
    width: 200px;
  }
}
</style>

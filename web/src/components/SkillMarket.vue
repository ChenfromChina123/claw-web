<script setup lang="ts">
/**
 * 技能市场组件
 * 展示和管理所有可用的技能，支持搜索、筛选和启用/禁用功能
 */

import { ref, computed, onMounted } from 'vue'
import {
  NCard, NButton, NSpace, NTag, NInput, NGrid, NGridItem,
  NEmpty, NModal, NDescriptions, NDescriptionsItem, NPopover,
  NScrollbar, useMessage, NSpin, NCheckbox, NBadge
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

const getCategoryIcon = (categoryId: string): string => {
  const category = categories.value.find(c => c.id === categoryId)
  return category?.icon || 'box'
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
      <div class="category-sidebar">
        <div class="category-list">
          <NBadge 
            :value="skills.length" 
            :type="!selectedCategory ? 'primary' : 'default'"
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
            :type="selectedCategory === cat.id ? 'primary' : 'default'"
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
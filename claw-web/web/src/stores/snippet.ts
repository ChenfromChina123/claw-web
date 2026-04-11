/**
 * 代码片段库 Store
 * 提供代码片段的收藏、存储、管理功能
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface CodeSnippet {
  id: string
  code: string
  language: string
  description?: string
  createdAt: string
  updatedAt: string
  tags: string[]
}

const STORAGE_KEY = 'code_snippets_library'

function generateId(): string {
  return `snippet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function loadFromStorage(): CodeSnippet[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

function saveToStorage(snippets: CodeSnippet[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets))
  } catch (error) {
    console.error('保存代码片段失败:', error)
  }
}

export const useSnippetStore = defineStore('snippet', () => {
  const snippets = ref<CodeSnippet[]>(loadFromStorage())

  const snippetCount = computed(() => snippets.value.length)

  const sortedSnippets = computed(() => {
    return [...snippets.value].sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  })

  function addSnippet(code: string, language: string, description?: string, tags: string[] = []): CodeSnippet {
    const now = new Date().toISOString()
    const snippet: CodeSnippet = {
      id: generateId(),
      code,
      language,
      description,
      createdAt: now,
      updatedAt: now,
      tags,
    }
    snippets.value.push(snippet)
    saveToStorage(snippets.value)
    return snippet
  }

  function removeSnippet(id: string): boolean {
    const index = snippets.value.findIndex(s => s.id === id)
    if (index !== -1) {
      snippets.value.splice(index, 1)
      saveToStorage(snippets.value)
      return true
    }
    return false
  }

  function updateSnippet(id: string, updates: Partial<Omit<CodeSnippet, 'id' | 'createdAt'>>): boolean {
    const snippet = snippets.value.find(s => s.id === id)
    if (snippet) {
      Object.assign(snippet, {
        ...updates,
        updatedAt: new Date().toISOString(),
      })
      saveToStorage(snippets.value)
      return true
    }
    return false
  }

  function getSnippet(id: string): CodeSnippet | undefined {
    return snippets.value.find(s => s.id === id)
  }

  function isSnippetExists(code: string): boolean {
    return snippets.value.some(s => s.code === code)
  }

  function searchSnippets(keyword: string): CodeSnippet[] {
    const lowerKeyword = keyword.toLowerCase()
    return snippets.value.filter(s =>
      s.code.toLowerCase().includes(lowerKeyword) ||
      s.language.toLowerCase().includes(lowerKeyword) ||
      s.description?.toLowerCase().includes(lowerKeyword) ||
      s.tags.some(tag => tag.toLowerCase().includes(lowerKeyword))
    )
  }

  function getSnippetsByLanguage(language: string): CodeSnippet[] {
    return snippets.value.filter(s => s.language === language)
  }

  function clearAllSnippets(): void {
    snippets.value = []
    saveToStorage(snippets.value)
  }

  return {
    snippets,
    snippetCount,
    sortedSnippets,
    addSnippet,
    removeSnippet,
    updateSnippet,
    getSnippet,
    isSnippetExists,
    searchSnippets,
    getSnippetsByLanguage,
    clearAllSnippets,
  }
})

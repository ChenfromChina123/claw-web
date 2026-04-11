/**
 * IDE 工作台分栏尺寸持久化（explorer | editor+terminal | chat，以及编辑器/终端纵向比例）
 */
const STORAGE_KEY = 'ideWorkbenchLayoutV1'

export interface IdeWorkbenchLayoutState {
  /** 左 | 中 | 右 三列占比 */
  rootSizes: [number, number, number]
  /** 中间栏：编辑器 | 终端 上下占比 */
  editorTerminalSizes: [number, number]
}

const DEFAULT_ROOT: [number, number, number] = [20, 52, 28]
const DEFAULT_EDITOR_TERM: [number, number] = [68, 32]

function clampTriplet(a: number, b: number, c: number): [number, number, number] {
  const sum = a + b + c
  if (sum <= 0) return [...DEFAULT_ROOT] as [number, number, number]
  return [(a / sum) * 100, (b / sum) * 100, (c / sum) * 100]
}

function clampPair(a: number, b: number): [number, number] {
  const sum = a + b
  if (sum <= 0) return [...DEFAULT_EDITOR_TERM] as [number, number]
  return [(a / sum) * 100, (b / sum) * 100]
}

export function loadIdeWorkbenchLayout(): IdeWorkbenchLayoutState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return {
        rootSizes: [...DEFAULT_ROOT],
        editorTerminalSizes: [...DEFAULT_EDITOR_TERM],
      }
    }
    const parsed = JSON.parse(raw) as Partial<IdeWorkbenchLayoutState>
    const r = parsed.rootSizes
    const e = parsed.editorTerminalSizes
    if (
      Array.isArray(r) &&
      r.length === 3 &&
      Array.isArray(e) &&
      e.length === 2
    ) {
      const [a, b, c] = clampTriplet(Number(r[0]), Number(r[1]), Number(r[2]))
      const [x, y] = clampPair(Number(e[0]), Number(e[1]))
      return {
        rootSizes: [a, b, c],
        editorTerminalSizes: [x, y],
      }
    }
  } catch {
    /* ignore */
  }
  return {
    rootSizes: [...DEFAULT_ROOT],
    editorTerminalSizes: [...DEFAULT_EDITOR_TERM],
  }
}

export function saveIdeWorkbenchLayout(state: IdeWorkbenchLayoutState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* quota / private mode */
  }
}

/** 从 splitpanes 根节点读取子 pane 的百分比（vertical → width%，horizontal → height%） */
export function readSplitPanePercents(
  containerEl: HTMLElement | null | undefined,
  horizontal: boolean
): number[] {
  if (!containerEl) return []
  const panes = containerEl.querySelectorAll(':scope > .splitpanes__pane')
  const prop = horizontal ? 'height' : 'width'
  return Array.from(panes).map((p) => {
    const el = p as HTMLElement
    const v = el.style.getPropertyValue(prop) || (el.style as unknown as Record<string, string>)[prop]
    const n = parseFloat(String(v).replace('%', ''))
    return Number.isFinite(n) ? n : 0
  })
}

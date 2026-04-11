/**
 * 监听器类型 - 当状态变更时调用的无参数函数
 */
type Listener = () => void
/**
 * 状态变更回调类型
 */
type OnChange<T> = (args: { newState: T; oldState: T }) => void

/**
 * 通用状态存储接口
 */
export type Store<T> = {
  /** 获取当前状态 */
  getState: () => T
  /** 更新状态 */
  setState: (updater: (prev: T) => T) => void
  /** 订阅状态变更 - 返回取消订阅函数 */
  subscribe: (listener: Listener) => () => void
}

/**
 * 创建状态存储
 * @param initialState 初始状态
 * @param onChange 可选的变更回调
 */
export function createStore<T>(
  initialState: T,
  onChange?: OnChange<T>,
): Store<T> {
  let state = initialState
  const listeners = new Set<Listener>()

  return {
    getState: () => state,

    setState: (updater: (prev: T) => T) => {
      const prev = state
      const next = updater(prev)
      if (Object.is(next, prev)) return
      state = next
      onChange?.({ newState: next, oldState: prev })
      for (const listener of listeners) listener()
    },

    subscribe: (listener: Listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

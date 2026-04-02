import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import type { UUID } from 'crypto'
import type React from 'react'
import type { PermissionResult } from '../entrypoints/agentSdkTypes.js'
import type { Key } from '../ink.js'
import type { PastedContent } from '../utils/config.js'
import type { ImageDimensions } from '../utils/imageResizer.js'
import type { TextHighlight } from '../utils/textHighlighting.js'
import type { AgentId } from './ids.js'
import type { AssistantMessage, MessageOrigin } from './message.js'

/**
 * 内联幽灵文本，用于中间输入命令自动完成
 */
export type InlineGhostText = {
  /** 要显示的幽灵文本（例如 "/commit" 的 "mit"） */
  readonly text: string
  /** 完整的命令名称（例如 "commit"） */
  readonly fullCommand: string
  /** 幽灵文本应该出现的位置 */
  readonly insertPosition: number
}

/**
 * 文本输入组件的基础属性
 */
export type BaseTextInputProps = {
  /**
   * 当在输入开头按向上箭头时处理历史导航的可选回调
   */
  readonly onHistoryUp?: () => void

  /**
   * 当在输入结尾按向下箭头时处理历史导航的可选回调
   */
  readonly onHistoryDown?: () => void

  /**
   * 当 `value` 为空时要显示的文本。
   */
  readonly placeholder?: string

  /**
   * 允许通过以反斜杠结尾的行输入多行（默认：`true`）
   */
  readonly multiline?: boolean

  /**
   * 监听用户输入。当有多个输入组件时有用，
   * 输入必须"路由"到特定组件。
   */
  readonly focus?: boolean

  /**
   * 替换所有字符并遮罩值。用于密码输入。
   */
  readonly mask?: string

  /**
   * 是否显示光标并允许使用箭头键在文本输入中导航。
   */
  readonly showCursor?: boolean

  /**
   * 高亮粘贴的文本
   */
  readonly highlightPastedText?: boolean

  /**
   * 要在文本输入中显示的值。
   */
  readonly value: string

  /**
   * 值更新时调用的函数。
   */
  readonly onChange: (value: string) => void

  /**
   * 按下 `Enter` 时调用的函数，其中第一个参数是输入的值。
   */
  readonly onSubmit?: (value: string) => void

  /**
   * 按下 Ctrl+C 退出时调用的函数。
   */
  readonly onExit?: () => void

  /**
   * 显示退出消息的可选回调
   */
  readonly onExitMessage?: (show: boolean, key?: string) => void

  /**
   * 显示自定义消息的可选回调
   */
  // readonly onMessage?: (show: boolean, message?: string) => void

  /**
   * 重置历史位置的可选回调
   */
  readonly onHistoryReset?: () => void

  /**
   * 输入被清除时的可选回调（例如双反斜杠）
   */
  readonly onClearInput?: () => void

  /**
   * 文本换行的列数
   */
  readonly columns: number

  /**
   * 输入视口的可见最大行数。当换行后的输入
   * 超过此行数时，只渲染光标周围的行。
   */
  readonly maxVisibleLines?: number

  /**
   * 粘贴图像时的可选回调
   */
  readonly onImagePaste?: (
    base64Image: string,
    mediaType?: string,
    filename?: string,
    dimensions?: ImageDimensions,
    sourcePath?: string,
  ) => void

  /**
   * 粘贴大文本（超过800个字符）时的可选回调
   */
  readonly onPaste?: (text: string) => void

  /**
   * 粘贴状态改变时的回调
   */
  readonly onIsPastingChange?: (isPasting: boolean) => void

  /**
   * 是否禁用上/下箭头键的光标移动
   */
  readonly disableCursorMovementForUpDownKeys?: boolean

  /**
   * 跳过文本级双按Escape处理程序。当键绑定上下文
   * （例如自动完成）拥有escape时设置——因为子
   * 效果在父效果之前注册useInput监听器，所以键绑定的
   * stopImmediatePropagation无法屏蔽文本输入。
   */
  readonly disableEscapeDoublePress?: boolean

  /**
   * 文本中光标的偏移量
   */
  readonly cursorOffset: number

  /**
   * 设置光标偏移量的回调
   */
  onChangeCursorOffset: (offset: number) => void

  /**
   * 命令输入后显示的可选提示文本
   * 用于显示命令的可用参数
   */
  readonly argumentHint?: string

  /**
   * 撤销功能的对选回调
   */
  readonly onUndo?: () => void

  /**
   * 是否用暗淡颜色渲染文本
   */
  readonly dimColor?: boolean

  /**
   * 搜索结果或其他高亮的可选文本高亮
   */
  readonly highlights?: TextHighlight[]

  /**
   * 可选的自定义React元素作为占位符渲染。
   * 提供时，覆盖标准的 `placeholder` 字符串渲染。
   */
  readonly placeholderElement?: React.ReactNode

  /**
   * 用于中间输入命令自动完成的可选内联幽灵文本
   */
  readonly inlineGhostText?: InlineGhostText

  /**
   * 键路由前应用于原始输入的可选过滤器。返回
   * （可能转换后的）输入字符串；对于非空输入返回 ''
   * 则丢弃事件。
   */
  readonly inputFilter?: (input: string, key: Key) => string
}

/**
 * VimTextInput的扩展属性
 */
export type VimTextInputProps = BaseTextInputProps & {
  /**
   * 使用的初始vim模式
   */
  readonly initialMode?: VimMode

  /**
   * 模式改变时的可选回调
   */
  readonly onModeChange?: (mode: VimMode) => void
}

/**
 * Vim编辑器的模式
 */
export type VimMode = 'INSERT' | 'NORMAL'

/**
 * 输入钩子结果的通用属性
 */
export type BaseInputState = {
  onInput: (input: string, key: Key) => void
  renderedValue: string
  offset: number
  setOffset: (offset: number) => void
  /** 光标行（0索引），在考虑换行的渲染文本中。 */
  cursorLine: number
  /** 当前行中的光标列（显示宽度）。 */
  cursorColumn: number
  /** 视口开始的字符偏移（0表示无窗口化时）。 */
  viewportCharOffset: number
  /** 视口结束的字符偏移（无窗口化时为 text.length）。 */
  viewportCharEnd: number

  // 用于粘贴处理
  isPasting?: boolean
  pasteState?: {
    chunks: string[]
    timeoutId: ReturnType<typeof setTimeout> | null
  }
}

/**
 * 文本输入的状态
 */
export type TextInputState = BaseInputState

/**
 * 带模式的vim输入状态
 */
export type VimInputState = BaseInputState & {
  mode: VimMode
  setMode: (mode: VimMode) => void
}

/**
 * 提示的输入模式
 */
export type PromptInputMode =
  | 'bash'
  | 'prompt'
  | 'orphaned-permission'
  | 'task-notification'

export type EditablePromptInputMode = Exclude<
  PromptInputMode,
  `${string}-notification`
>

/**
 * 队列优先级级别。在正常和主动模式中语义相同。
 *
 *  - `now`   — 中断并立即发送。中止任何进行中的工具
 *              调用（等同于 Esc + 发送）。消费者（print.ts、
 *              REPL.tsx）订阅队列更改并在看到 'now' 命令时中止。
 *  - `next`  — 中间轮次排空。让当前工具调用完成，然后
 *              在工具结果和下一个API往返之间发送此消息。唤醒进行中的SleepTool调用。
 *  - `later` — 轮次结束排空。等待当前轮次完成，
 *              然后作为新查询处理。唤醒进行中的SleepTool
 *              调用（query.ts 在睡眠后升级排空阈值，因此
 *              消息附加到同一轮次）。
 *
 * SleepTool 仅在主动模式中可用，所以在正常模式中"唤醒SleepTool"
 * 是无操作。
 */
export type QueuePriority = 'now' | 'next' | 'later'

/**
 * 排队的命令类型
 */
export type QueuedCommand = {
  value: string | Array<ContentBlockParam>
  mode: PromptInputMode
  /** 入队时默认为 mode 隐含的优先级。 */
  priority?: QueuePriority
  uuid?: UUID
  orphanedPermission?: OrphanedPermission
  /** 原始粘贴内容，包括图像。图像在执行时调整大小。 */
  pastedContents?: Record<number, PastedContent>
  /**
   * 展开 [Pasted text #N] 占位符之前的输入字符串。
   * 用于ultraplan关键字检测，以便包含
   * 关键字的粘贴内容不会触发CCR会话。当
   * 未设置时回退到 `value`（bridge/UDS/MCP源没有粘贴展开）。
   */
  preExpansionValue?: string
  /**
   * 当为true时，即使以 `/` 开头，输入也被视为纯文本。
   * 用于远程接收的消息（例如bridge/CCR），这些消息不应
   * 触发本地斜杠命令或技能。
   */
  skipSlashCommands?: boolean
  /**
   * 当为true时，斜杠命令被调度但通过
   * isBridgeSafeCommand() 过滤——'local-jsx' 和仅终端命令返回
   * 有用错误而不是执行。由远程控制桥接
   * 入站路径设置，以便移动/网络客户端可以运行技能和良性命令，
   * 而不会重新暴露 PR #19134 bug（/model 弹出本地选择器）。
   */
  bridgeOrigin?: boolean
  /**
   * 当为true时，生成的UserMessage获得 `isMeta: true`——在
   * 记录UI中隐藏但对模型可见。用于通过
   * 队列而不是直接调用 `onQuery` 路由的系统生成提示
   * （主动tick、队友消息、资源更新）。
   */
  isMeta?: boolean
  /**
   * 此命令的来源。印在生成的UserMessage上，以便
   * 记录从结构上（而不是仅通过内容中的XML标签）记录来源。
   * undefined = 人类（键盘）。
   */
  origin?: MessageOrigin
  /**
   * 工作负载标签，线程化为 cc_workload= 在计费头
   * 归属块中。队列是cron
   * 调度程序触发和实际运行之间的异步边界——
   * 用户提示可以插入其中——所以标签在QueuedCommand本身上，
   * 仅在此命令出队时才被提升到引导状态。
   */
  workload?: string
  /**
   * 应接收此通知的代理。Undefined = 主线程。
   * 子代理在进程内运行并共享模块级命令队列；
   * query.ts 中的排空门按此字段过滤，因此子代理的后台
   * 任务通知不会泄漏到协调器的上下文中（PR #18453
   * 统一了队列但丢失了双队列偶然拥有的隔离）。
   */
  agentId?: AgentId
}

/**
 * 用于验证非空数据图像的PasteContent类型守卫。空内容
 * 图像（例如来自0字节文件拖放）产生空base64字符串，
 * API会拒绝 `image cannot be empty`。在每个
 * 将 PastedContent → ImageBlockParam 的站点使用此函数，
 * 以便过滤和ID列表保持同步。
 */
export function isValidImagePaste(c: PastedContent): boolean {
  return c.type === 'image' && c.content.length > 0
}

/** 从QueuedCommand的pastedContents中提取图像粘贴ID。 */
export function getImagePasteIds(
  pastedContents: Record<number, PastedContent> | undefined,
): number[] | undefined {
  if (!pastedContents) {
    return undefined
  }
  const ids = Object.values(pastedContents)
    .filter(isValidImagePaste)
    .map(c => c.id)
  return ids.length > 0 ? ids : undefined
}

export type OrphanedPermission = {
  permissionResult: PermissionResult
  assistantMessage: AssistantMessage
}

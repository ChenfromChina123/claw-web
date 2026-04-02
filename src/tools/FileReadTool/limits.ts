/**
 * 读取工具输出限制。文本读取有两个上限：
 *
 *   | limit         | 默认值  | 检查                    | 成本          | 超过时处理     |
 *   |---------------|---------|-------------------------|---------------|----------------|
 *   | maxSizeBytes  | 256 KB  | 总文件大小（非输出）      | 1 次 stat     | 读取前抛出异常 |
 *   | maxTokens     | 25000   | 实际输出 token 数        | API 往返      | 读取后抛出异常 |
 *
 * 已知不匹配：maxSizeBytes 基于总文件大小限制，而非切片大小。
 * 对于超过字节限制的显式限制读取，曾测试使用截断而非抛出（#21841，2026年3月）。
 * 回滚原因：工具错误率下降但平均 token 数上升——抛出路径返回约100字节的错误
 * tool-result，而截断返回约25K token 的内容上限。
 */
import memoize from 'lodash-es/memoize.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from 'src/services/analytics/growthbook.js'
import { MAX_OUTPUT_SIZE } from 'src/utils/file.js'
export const DEFAULT_MAX_OUTPUT_TOKENS = 25000

/**
 * 环境变量覆盖 max output tokens。当未设置/无效时返回 undefined，
 * 以便调用方可以降级到下一个优先级层。
 */
function getEnvMaxTokens(): number | undefined {
  const override = process.env.CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS
  if (override) {
    const parsed = parseInt(override, 10)
    if (!isNaN(parsed) && parsed > 0) {
      return parsed
    }
  }
  return undefined
}

export type FileReadingLimits = {
  maxTokens: number
  maxSizeBytes: number
  includeMaxSizeInPrompt?: boolean
  targetedRangeNudge?: boolean
}

/**
 * 当 ToolUseContext 未提供覆盖时，Read 工具的默认限制。
 * 使用记忆化以便 GrowthBook 值在首次调用时固定——避免标志
 * 在后台刷新时上限在会话期间发生变化。
 *
 * maxTokens 的优先级：环境变量 > GrowthBook > DEFAULT_MAX_OUTPUT_TOKENS。
 * （环境变量是用户设置的覆盖，应优于实验基础设施。）
 *
 * 防御性：每个字段都经过单独验证；无效值会
 * 降级到硬编码默认值（没有 route 到 cap=0）。
 */
export const getDefaultFileReadingLimits = memoize((): FileReadingLimits => {
  const override =
    getFeatureValue_CACHED_MAY_BE_STALE<Partial<FileReadingLimits> | null>(
      'tengu_amber_wren',
      {},
    )

  const maxSizeBytes =
    typeof override?.maxSizeBytes === 'number' &&
    Number.isFinite(override.maxSizeBytes) &&
    override.maxSizeBytes > 0
      ? override.maxSizeBytes
      : MAX_OUTPUT_SIZE

  const envMaxTokens = getEnvMaxTokens()
  const maxTokens =
    envMaxTokens ??
    (typeof override?.maxTokens === 'number' &&
    Number.isFinite(override.maxTokens) &&
    override.maxTokens > 0
      ? override.maxTokens
      : DEFAULT_MAX_OUTPUT_TOKENS)

  const includeMaxSizeInPrompt =
    typeof override?.includeMaxSizeInPrompt === 'boolean'
      ? override.includeMaxSizeInPrompt
      : undefined

  const targetedRangeNudge =
    typeof override?.targetedRangeNudge === 'boolean'
      ? override.targetedRangeNudge
      : undefined

  return {
    maxSizeBytes,
    maxTokens,
    includeMaxSizeInPrompt,
    targetedRangeNudge,
  }
})

/**
 * Lorem Ipsum 技能
 *
 * 生成填充文本用于长上下文测试
 * 从 src/skills/bundled/loremIpsum.ts 迁移
 */

import { registerBundledSkill } from '../bundledSkills'

// 单 token 词汇表
const ONE_TOKEN_WORDS = [
  // 冠词和代词
  'the', 'a', 'an', 'I', 'you', 'he', 'she', 'it', 'we', 'they',
  'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our',
  'this', 'that', 'what', 'who',
  // 常见动词
  'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'can', 'could', 'may', 'might',
  'must', 'shall', 'should', 'make', 'made', 'get', 'got', 'go', 'went',
  'come', 'came', 'see', 'saw', 'know', 'take', 'think', 'look', 'want',
  'use', 'find', 'give', 'tell', 'work', 'call', 'try', 'ask', 'need',
  'feel', 'seem', 'leave', 'put',
  // 常见名词和形容词
  'time', 'year', 'day', 'way', 'man', 'thing', 'life', 'hand', 'part',
  'place', 'case', 'point', 'fact', 'good', 'new', 'first', 'last', 'long',
  'great', 'little', 'own', 'other', 'old', 'right', 'big', 'high', 'small',
  'large', 'next', 'early', 'young', 'few', 'public', 'bad', 'same', 'able',
  // 介词和连词
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'from', 'by', 'about',
  'like', 'through', 'over', 'before', 'between', 'under', 'since', 'without',
  'and', 'or', 'but', 'if', 'than', 'because', 'as', 'until', 'while', 'so',
  'though', 'both', 'each', 'when', 'where', 'why', 'how',
  // 常见副词
  'not', 'now', 'just', 'more', 'also', 'here', 'there', 'then', 'only',
  'very', 'well', 'back', 'still', 'even', 'much', 'too', 'such', 'never',
  'again', 'most', 'once', 'off', 'away', 'down', 'out', 'up',
  // 技术/常见词汇
  'test', 'code', 'data', 'file', 'line', 'text', 'word', 'number', 'system',
  'program', 'set', 'run', 'value', 'name', 'type', 'state', 'end', 'start',
]

/**
 * 生成 Lorem Ipsum 文本
 * @param targetTokens 目标 token 数量
 * @returns 生成的文本
 */
function generateLoremIpsum(targetTokens: number): string {
  let tokens = 0
  let result = ''

  while (tokens < targetTokens) {
    // 句子: 10-20 个词
    const sentenceLength = 10 + Math.floor(Math.random() * 11)
    let wordsInSentence = 0

    for (let i = 0; i < sentenceLength && tokens < targetTokens; i++) {
      const word = ONE_TOKEN_WORDS[Math.floor(Math.random() * ONE_TOKEN_WORDS.length)]
      result += word
      tokens++
      wordsInSentence++

      if (i === sentenceLength - 1 || tokens >= targetTokens) {
        result += '. '
      } else {
        result += ' '
      }
    }

    // 段落分隔
    if (wordsInSentence > 0 && Math.random() < 0.2 && tokens < targetTokens) {
      result += '\n\n'
    }
  }

  return result.trim()
}

/**
 * 注册 Lorem Ipsum 技能
 */
export function registerLoremIpsumSkill(): void {
  registerBundledSkill({
    name: 'lorem-ipsum',
    description: 'Generate filler text for long context testing. Specify token count as argument (e.g., /lorem-ipsum 50000). Outputs approximately the requested number of tokens.',
    argumentHint: '[token_count]',
    userInvocable: true,
    async getPromptForCommand(args) {
      const parsed = parseInt(args)

      if (args && (isNaN(parsed) || parsed <= 0)) {
        return [
          {
            type: 'text',
            text: 'Invalid token count. Please provide a positive number (e.g., /lorem-ipsum 10000).',
          },
        ]
      }

      const targetTokens = parsed || 10000

      // 限制最大 50 万 tokens
      const cappedTokens = Math.min(targetTokens, 500_000)

      if (cappedTokens < targetTokens) {
        return [
          {
            type: 'text',
            text: `Requested ${targetTokens} tokens, but capped at 500,000 for safety.\n\n${generateLoremIpsum(cappedTokens)}`,
          },
        ]
      }

      const loremText = generateLoremIpsum(cappedTokens)

      return [
        {
          type: 'text',
          text: loremText,
        },
      ]
    },
  })
}

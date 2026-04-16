/**
 * Verify 技能
 *
 * 验证代码变更
 * 从 src/skills/bundled/verify.ts 迁移
 */

import { registerBundledSkill } from '../bundledSkills'

const VERIFY_PROMPT = `# Verify

Verify the code change works as expected.

## Steps

1. **Understand the change** - Review what was modified and why
2. **Check for issues** - Look for potential bugs, edge cases, or regressions
3. **Verify functionality** - Confirm the change does what it should
4. **Check tests** - Ensure tests pass and coverage is adequate
5. **Review edge cases** - Consider boundary conditions and error handling

## What to Look For

- Logic errors or typos
- Missing error handling
- Performance implications
- Security concerns
- Breaking changes
- Incomplete implementations

## Output

Provide a summary of:
- What was verified
- Any issues found
- Recommendations for improvement
`

/**
 * 注册 Verify 技能
 */
export function registerVerifySkill(): void {
  registerBundledSkill({
    name: 'verify',
    description: 'Verify a code change does what it should by running the app.',
    userInvocable: true,
    async getPromptForCommand(args) {
      const parts: string[] = [VERIFY_PROMPT]
      if (args) {
        parts.push(`## User Request\n\n${args}`)
      }
      return [{ type: 'text', text: parts.join('\n\n') }]
    },
  })
}

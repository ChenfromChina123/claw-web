/**
 * Debug 技能
 *
 * 帮助用户调试当前会话
 * 从 src/skills/bundled/debug.ts 迁移
 */

import { registerBundledSkill } from '../bundledSkills'

const DEFAULT_DEBUG_LINES_READ = 20

/**
 * 注册 Debug 技能
 */
export function registerDebugSkill(): void {
  registerBundledSkill({
    name: 'debug',
    description: 'Enable debug logging for this session and help diagnose issues',
    allowedTools: ['Read', 'Grep', 'Glob'],
    argumentHint: '[issue description]',
    disableModelInvocation: true,
    userInvocable: true,
    async getPromptForCommand(args) {
      const prompt = `# Debug Skill

Help the user debug an issue they're encountering in this current session.

## Issue Description

${args || 'The user did not describe a specific issue. Please ask for more details.'}

## Instructions

1. Review the user's issue description
2. Check for any error messages or unusual behavior
3. Look for patterns that might indicate the root cause
4. Explain what you found in plain language
5. Suggest concrete fixes or next steps

## Common Debugging Steps

- Check recent changes or errors
- Review configuration files
- Verify file permissions
- Check for missing dependencies
- Look for syntax errors or typos
`

      return [{ type: 'text', text: prompt }]
    },
  })
}

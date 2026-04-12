/**
 * Keybindings 技能
 *
 * 显示键盘快捷键帮助
 * 从 src/skills/bundled/keybindings.ts 迁移
 */

import { registerBundledSkill } from '../bundledSkills'

const KEYBINDINGS_PROMPT = `# Keybindings Help

Display keyboard shortcuts and keybindings for Claude Code.

## Common Shortcuts

### Navigation
- \`Ctrl + C\` - Cancel current operation
- \`Ctrl + D\` - Exit (when input is empty)
- \`Tab\` - Autocomplete
- \`↑\` / \`↓\` - Navigate history

### Input
- \`Enter\` - Submit
- \`Shift + Enter\` - New line
- \`Ctrl + A\` - Select all
- \`Ctrl + E\` - End of line
- \`Ctrl + K\` - Clear to end of line

### Special Commands
- \`/\` - Show skills menu
- \`?\` - Show help
- \`!\` - Execute bash command

## Instructions

1. Show the user the available keyboard shortcuts
2. Explain when each shortcut is useful
3. Answer any questions about keybindings
`

/**
 * 注册 Keybindings 技能
 */
export function registerKeybindingsSkill(): void {
  registerBundledSkill({
    name: 'keybindings',
    description: 'Show keyboard shortcuts and keybindings help.',
    userInvocable: true,
    async getPromptForCommand(args) {
      return [{ type: 'text', text: KEYBINDINGS_PROMPT }]
    },
  })
}

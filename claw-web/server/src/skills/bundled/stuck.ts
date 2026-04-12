/**
 * Stuck 技能
 *
 * 诊断卡住的会话
 * 从 src/skills/bundled/stuck.ts 迁移
 */

import { registerBundledSkill } from '../bundledSkills'

const STUCK_PROMPT = `# /stuck — diagnose frozen/slow sessions

The user thinks another session on this machine is frozen, stuck, or very slow. Investigate and provide a diagnostic report.

## What to look for

Scan for other processes. Signs of a stuck session:
- **High CPU (≥90%) sustained** — likely an infinite loop. Sample twice, 1-2s apart, to confirm it's not a transient spike.
- **Process state \`D\` (uninterruptible sleep)** — often an I/O hang.
- **Process state \`T\` (stopped)** — user probably hit Ctrl+Z by accident.
- **Process state \`Z\` (zombie)** — parent isn't reaping.
- **Very high RSS (≥4GB)** — possible memory leak making the session sluggish.
- **Stuck child process** — a hung \`git\`, \`node\`, or shell subprocess can freeze the parent.

## Investigation steps

1. **List all processes** (macOS/Linux):
   \`\`\`
   ps -axo pid=,pcpu=,rss=,etime=,state=,comm=,command=
   \`\`\`

2. **For anything suspicious**, gather more context:
   - Child processes: \`pgrep -lP <pid>\`
   - If high CPU: sample again after 1-2s to confirm it's sustained
   - If a child looks hung (e.g., a git command), note its full command line

3. **Consider a stack dump** for a truly frozen process (advanced, optional):
   - macOS: \`sample <pid> 3\` gives a 3-second native stack sample

## Report

Provide a structured report with:
- Process status overview
- Any suspicious processes found
- Recommendations for resolution

## Notes
- Don't kill or signal any processes — this is diagnostic only.
- If the user gave an argument (e.g., a specific PID or symptom), focus there first.
`

/**
 * 注册 Stuck 技能
 */
export function registerStuckSkill(): void {
  registerBundledSkill({
    name: 'stuck',
    description: 'Investigate frozen/stuck/slow sessions on this machine and provide a diagnostic report.',
    userInvocable: true,
    async getPromptForCommand(args) {
      let prompt = STUCK_PROMPT
      if (args) {
        prompt += `\n\n## User-provided context\n\n${args}\n`
      }
      return [{ type: 'text', text: prompt }]
    },
  })
}

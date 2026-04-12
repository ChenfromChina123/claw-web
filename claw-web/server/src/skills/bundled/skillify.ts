/**
 * Skillify 技能
 *
 * 将当前会话转换为可重用技能
 * 从 src/skills/bundled/skillify.ts 迁移（简化版）
 */

import { registerBundledSkill } from '../bundledSkills'

const SKILLIFY_PROMPT = `# Skillify

You are capturing this session's repeatable process as a reusable skill.

## Your Task

### Step 1: Analyze the Session

Before asking any questions, analyze the session to identify:
- What repeatable process was performed
- What the inputs/parameters were
- The distinct steps (in order)
- The success artifacts/criteria for each step
- What tools and permissions were needed
- What the goals and success artifacts were

### Step 2: Interview the User

Use AskUserQuestion to understand what the user wants to automate.

**Round 1: High level confirmation**
- Suggest a name and description for the skill based on your analysis. Ask the user to confirm or rename.
- Suggest high-level goal(s) and specific success criteria for the skill.

**Round 2: More details**
- Present the high-level steps you identified as a numbered list.
- If you think the skill will require arguments, suggest arguments based on what you observed.
- Ask where the skill should be saved:
  - **This repo** (\`.claude/skills/<name>/SKILL.md\`) — for workflows specific to this project
  - **Personal** (\`~/.claude/skills/<name>/SKILL.md\`) — follows you across all repos

**Round 3: Breaking down each step**
For each major step, if it's not glaringly obvious, ask:
- What does this step produce that later steps need? (data, artifacts, IDs)
- What proves that this step succeeded, and that we can move on?
- Should the user be asked to confirm before proceeding?
- Are any steps independent and could run in parallel?

Stop interviewing once you have enough information. Don't over-ask for simple processes!

### Step 3: Write the SKILL.md

Create the skill directory and file at the location the user chose.

Use this format:

\`\`\`markdown
---
name: {{skill-name}}
description: {{one-line description}}
allowed-tools:
  {{list of tool permission patterns}}
when_to_use: {{detailed description of when to use}}
argument-hint: "{{hint showing argument placeholders}}"
---

# {{Skill Title}}
Description of skill

## Inputs
- \`$arg_name\`: Description of this input

## Goal
Clearly stated goal for this workflow.

## Steps

### 1. Step Name
What to do in this step. Be specific and actionable.

**Success criteria**: What shows this step is done.

...
\`\`\`

### Step 4: Confirm and Save

Before writing the file, output the complete SKILL.md content so the user can review it. Then ask for confirmation.

After writing, tell the user:
- Where the skill was saved
- How to invoke it: \`/{{skill-name}} [arguments]\`
- That they can edit the SKILL.md directly to refine it
`

/**
 * 注册 Skillify 技能
 */
export function registerSkillifySkill(): void {
  registerBundledSkill({
    name: 'skillify',
    description: "Capture this session's repeatable process into a skill. Call at end of the process you want to capture with an optional description.",
    allowedTools: ['Read', 'Write', 'Glob', 'Grep', 'AskUserQuestion'],
    userInvocable: true,
    disableModelInvocation: true,
    argumentHint: '[description of the process you want to capture]',
    async getPromptForCommand(args) {
      const userDescriptionBlock = args
        ? `The user described this process as: "${args}"`
        : ''

      const prompt = SKILLIFY_PROMPT.replace('{{userDescriptionBlock}}', userDescriptionBlock)

      return [{ type: 'text', text: prompt }]
    },
  })
}

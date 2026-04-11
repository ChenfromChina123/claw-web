---
inject:
  - git_status: "git status --short"
  - git_diff: "git diff --cached"
  - branch: "git rev-parse --abbrev-ref HEAD"
---
# Skill: commit
## Purpose
Generate a concise, semantic Git commit message from staged changes.

## Rules
- Use Conventional Commits format: `<type>(<scope>): <description>`
- Valid types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `style`, `perf`, `ci`, `build`
- Infer scope from file paths (e.g., `ui`, `api`, `config`, `scripts`)
- Description: imperative present tense, lowercase, no period, max 72 chars
- If no staged changes → reply "⚠️ No staged changes. Run `git add` first."
- If ambiguous → ask user one clarifying question (e.g., "Is this a new feature or a bug fix?")

## Output only
The commit message line — nothing else, no explanations, no quotes, no markdown.
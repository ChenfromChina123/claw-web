# 🛠️ `skills/` Directory

This directory is intended for user-defined or reusable utility scripts — called *skills* — that extend your workflow.

## ✨ Sample Skill: `hello_skill.py`

A simple, self-contained Python script that greets a name:

### Usage

- Run with Python:
  ```bash
  python skills/hello_skill.py "Alice"
  # → Hello, Alice! 🌟
  ```

- Or (if executable permissions are supported):
  ```bash
  chmod +x skills/hello_skill.py
  ./skills/hello_skill.py Bob
  ```

- Without arguments, it defaults to `World`:
  ```bash
  python skills/hello_skill.py
  # → Hello, World! 🌟
  ```

> 💡 Tip: Add this directory to your `PATH`, or call skills directly from scripts/agents.

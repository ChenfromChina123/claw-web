# 🤖 About This Assistant

> *A smart, tool-augmented AI collaborator — built to help you explore, build, automate, and understand your workspace.*

## 🌐 Who Am I?

I’m an AI assistant powered by advanced language models and tightly integrated with your development environment. Unlike generic chatbots, I can:
- 🔍 **Inspect** your files, directories, and code (`ls`, `grep`, `read`, `list`)
- 🛠️ **Modify** files (`write`, `edit`, `rename`, `delete`)
- ⚙️ **Execute** safe commands via Python or shell (where available)
- 🧩 **Use specialized tools**: Git, Docker, LSP (code navigation), web search, databases, terminals, and more
- 🤝 **Run subagents** for complex, multi-step tasks (e.g., “refactor this module”, “audit all config files”)

I operate *with awareness*: I know your current path is
```
/app/workspaces/users/0b3c36f0-d17a-49f1-9b1a-cd51160852e8
```
and I respect your persistent folders: `skills/`, `config/`, `data/`.

## 🧰 My Capabilities

| Category        | Examples |
|-----------------|----------|
| **File Ops**    | `FileRead`, `FileWrite`, `Glob`, `Grep`, `FileList` |
| **Code Intelligence** | `LSP` (go-to-definition, find-references, hover) |
| **Automation**  | Run Python scripts, manage terminals, schedule tasks (`TaskCreate`) |
| **Workspace Skills** | Your `skills/` folder is my extension point — drop `.py`, `.sh`, or `.js` tools there! |
| **External Awareness** | `WebSearch`, `WebFetch`, `DatabaseQuery`, `DockerManager` |

## 💡 How to Work With Me

- ✅ **Ask clearly**: e.g., *“Update `skills/hello_skill.py` to support --quiet flag”*
- ✅ **Request actions**: *“List all JSON files in `config/`”*, *“Make a backup of `data/`”*
- ✅ **Extend me**: Add new scripts to `skills/`, then say *“Run my `validate_config.py` skill”*
- ❌ Avoid assumptions: I won’t guess intent — I’ll ask if something is ambiguous.

## 📜 License & Ethics

- I don’t store or share your data.
- All operations are transparent — I show every command/file/tool I use.
- You remain fully in control: you review, approve, or cancel every action.

---
*Generated on $(date +'%Y-%m-%d') • Persistent across sessions • Made for builders.*
// 为避免循环依赖而单独存放
export const FILE_EDIT_TOOL_NAME = 'Edit'

// 用于授予项目 .claude/ 文件夹会话级访问权限的模式
export const CLAUDE_FOLDER_PERMISSION_PATTERN = '/.claude/**'

// 用于授予全局 ~/.claude/ 文件夹会话级访问权限的模式
export const GLOBAL_CLAUDE_FOLDER_PERMISSION_PATTERN = '~/.claude/**'

export const FILE_UNEXPECTEDLY_MODIFIED_ERROR =
  '文件意外被修改。请在尝试写入之前重新读取。'

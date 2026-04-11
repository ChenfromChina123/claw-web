import { quote } from './shellQuote.js'

/**
 * 检测命令是否包含 heredoc 模式
 * 匹配模式如: <<EOF, <<'EOF', <<"EOF", <<-EOF, <<-'EOF', <<\EOF 等
 */
function containsHeredoc(command: string): boolean {
  // 匹配 heredoc 模式: << 后跟可选的 -，然后是可选的引号或反斜杠，最后是单词
  // 匹配: <<EOF, <<'EOF', <<"EOF", <<-EOF, <<-'EOF', <<\EOF
  // 首先检查位移运算符并排除它们
  if (
    /\d\s*<<\s*\d/.test(command) ||
    /\[\[\s*\d+\s*<<\s*\d+\s*\]\]/.test(command) ||
    /\$\(\(.*<<.*\)\)/.test(command)
  ) {
    return false
  }

  // 现在检查 heredoc 模式
  const heredocRegex = /<<-?\s*(?:(['"]?)(\w+)\1|\\(\w+))/
  return heredocRegex.test(command)
}

/**
 * 检测命令是否包含引号内的多行字符串
 */
function containsMultilineString(command: string): boolean {
  // 检查其中包含实际换行符的字符串
  // 使用更复杂的模式处理转义引号
  // 匹配单引号: '...\n...' 其中内容可包含转义引号 \'
  // 匹配双引号: "...\n..." 其中内容可包含转义引号 \"
  const singleQuoteMultiline = /'(?:[^'\\]|\\.)*\n(?:[^'\\]|\\.)*'/
  const doubleQuoteMultiline = /"(?:[^"\\]|\\.)*\n(?:[^"\\]|\\.)*"/

  return (
    singleQuoteMultiline.test(command) || doubleQuoteMultiline.test(command)
  )
}

/**
 * 适当引用 shell 命令，保留 heredoc 和多行字符串
 * @param command 要引用的命令
 * @param addStdinRedirect 是否添加 < /dev/null
 * @returns 正确引用的命令
 */
export function quoteShellCommand(
  command: string,
  addStdinRedirect: boolean = true,
): string {
  // 如果命令包含 heredoc 或多行字符串，需要特殊处理
  // shell-quote 库在这种情况下会错误地将 ! 转义为 \!
  // 我们使用单引号并仅转义命令中的单引号
  if (containsHeredoc(command) || containsMultilineString(command)) {
    // 对于 heredoc 和多行字符串，需要为 eval 引用但避免 shell-quote 的激进转义
    const escaped = command.replace(/'/g, "'\"'\"'")
    const quoted = `'${escaped}'`

    // heredoc 不添加 stdin 重定向，因为它们提供自己的输入
    if (containsHeredoc(command)) {
      return quoted
    }

    // 对于没有 heredoc 的多行字符串，根据需要添加 stdin 重定向
    return addStdinRedirect ? `${quoted} < /dev/null` : quoted
  }

  // 对于常规命令，使用 shell-quote
  if (addStdinRedirect) {
    return quote([command, '<', '/dev/null'])
  }

  return quote([command])
}

/**
 * 检测命令是否已有 stdin 重定向
 * 匹配模式如: < file, </path/to/file, < /dev/null 等
 * 但不匹配 <<EOF (heredoc)、<< (位移) 或 <(进程替换)
 */
export function hasStdinRedirect(command: string): boolean {
  // 查找 < 后跟空格和文件名/路径
  // 负向前瞻排除: <<、<(
  // 必须是空格或命令分隔符或字符串开头的前一个字符
  return /(?:^|[\s;&|])<(?![<(])\s*\S+/.test(command)
}

/**
 * 检查是否应该向命令添加 stdin 重定向
 * @param command 要检查的命令
 * @returns 如果可以安全添加 stdin 重定向则返回 true
 */
export function shouldAddStdinRedirect(command: string): boolean {
  // 对于 heredoc 不添加 stdin 重定向，因为它会干扰 heredoc 终止符
  if (containsHeredoc(command)) {
    return false
  }

  // 如果命令已有 stdin 重定向，则不添加
  if (hasStdinRedirect(command)) {
    return false
  }

  // 对于其他命令，stdin 重定向通常是安全的
  return true
}

/**
 * 将 Windows CMD 风格的 `>nul` 重写为 POSIX `/dev/null`。
 *
 * 模型偶尔会幻觉出 Windows CMD 语法（例如 `ls 2>nul`），
 * 即便我们的 bash shell 始终是 POSIX（Windows 上的 Git Bash / WSL）。
 * 当 Git Bash 看到 `2>nul` 时，它会创建一个名为 `nul` 的字面文件 —— 一个
 * Windows 保留设备名，极难删除并会破坏
 * `git add .` 和 `git clone`。参见 anthropics/claude-code#4928。
 *
 * 匹配: `>nul`, `> NUL`, `2>nul`, `&>nul`, `>>nul`（不区分大小写）
 * 不匹配: `>null`, `>nullable`, `>nul.txt`, `cat nul.txt`
 *
 * 局限性：此正则表达式不解析 shell 引用，因此 `echo ">nul"`
 * 也将被重写。这是可接受的附带损害 —— 极其罕见，
 * 而且在字符串内重写为 `/dev/null` 是无害的。
 */
const NUL_REDIRECT_REGEX = /(\d?&?>+\s*)[Nn][Uu][Ll](?=\s|$|[|&;)\n])/g

export function rewriteWindowsNullRedirect(command: string): string {
  return command.replace(NUL_REDIRECT_REGEX, '$1/dev/null')
}

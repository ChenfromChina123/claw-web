import nodemailer from 'nodemailer'

interface EmailConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
}

function loadEmailConfig(): EmailConfig {
  const host = process.env.SMTP_HOST || ''
  const port = parseInt(process.env.SMTP_PORT || '587', 10)
  const secure = process.env.SMTP_SECURE === 'true'
  const user = process.env.SMTP_USER || ''
  const pass = process.env.SMTP_PASS || ''
  const from = process.env.SMTP_FROM || user

  return { host, port, secure, user, pass, from }
}

let transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter | null {
  const config = loadEmailConfig()

  if (!config.host || !config.user || !config.pass) {
    return null
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    })
  }

  return transporter
}

export interface SendEmailOptions {
  to: string
  subject: string
  text: string
  html?: string
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const config = loadEmailConfig()
  const transport = getTransporter()

  if (!transport) {
    // 开发模式：邮件发送配置未完成，仅记录日志
    console.log('[开发模式] 邮件发送已跳过（配置未完成）')
    console.log(`[开发模式] 收件人: ${options.to}`)
    console.log(`[开发模式] 主题: ${options.subject}`)
    console.log(`[开发模式] 内容: ${options.text.substring(0, 100)}...`)
    return
  }

  try {
    await transport.sendMail({
      from: config.from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    })
    console.log(`邮件已发送到: ${options.to}`)
  } catch (error) {
    console.error('发送邮件失败:', error)
    // 邮件发送失败不抛出异常，避免阻塞业务流程
    console.warn(`邮件发送失败，已记录错误: ${options.to}`)
  }
}

export async function sendVerificationCodeEmail(
  toEmail: string,
  code: string,
  purpose: string
): Promise<void> {
  const subject = `【Claude Code】${purpose}验证码`
  const text = `
尊敬的用户：

您好！

您的${purpose}验证码是：${code}

验证码有效期为5分钟，请尽快使用。

如果这不是您的操作，请忽略此邮件。

———————————————
Claude Code 系统
此邮件为系统自动发送，请勿回复
  `.trim()

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #e94560; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
    .code { font-size: 32px; font-weight: bold; color: #e94560; letter-spacing: 8px; text-align: center; margin: 20px 0; }
    .footer { margin-top: 20px; font-size: 12px; color: #888; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Claude Code</h2>
    </div>
    <div class="content">
      <p>尊敬的用户：</p>
      <p>您好！</p>
      <p>您的<strong>${purpose}验证码</strong>是：</p>
      <div class="code">${code}</div>
      <p>验证码有效期为<strong>5分钟</strong>，请尽快使用。</p>
      <p>如果这不是您的操作，请忽略此邮件。</p>
    </div>
    <div class="footer">
      <p>———————————————</p>
      <p>Claude Code 系统</p>
      <p>此邮件为系统自动发送，请勿回复</p>
    </div>
  </div>
</body>
</html>
  `.trim()

  await sendEmail({ to: toEmail, subject, text, html })
}

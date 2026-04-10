/**
 * Security Module - 安全模块
 * 
 * 提供终端隔离、路径沙箱、命令验证等安全功能
 * 
 * @packageDocumentation
 */

export { 
  PathSandbox, 
  createPathSandbox,
  type PathSandboxConfig,
  type PathValidationResult,
  type CommandValidationResult
} from './pathSandbox'

export {
  SecureTerminal,
  SecureTerminalManager,
  createSecureTerminal,
  getSecureTerminalManager,
  type SecureTerminalConfig,
  type AuditEvent,
  type AuditEventType,
  type InputInterceptResult
} from './secureTerminal'

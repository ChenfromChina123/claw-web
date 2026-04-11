/**
 * 工具输入验证器
 * 
 * 提供 JSON Schema 风格的输入验证，确保工具参数符合规范。
 */

export interface ValidationError {
  field: string
  message: string
  code: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings?: string[]
}

/**
 * JSON Schema 类型定义（简化版）
 */
export interface JsonSchema {
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null'
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  required?: string[]
  enum?: unknown[]
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  description?: string
  default?: unknown
}

/**
 * 验证输入是否符合 JSON Schema
 */
export function validateInputAgainstSchema(
  input: unknown,
  schema: JsonSchema
): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: string[] = []
  
  // 处理 null 和 undefined
  if (input === null || input === undefined) {
    if (schema.required && schema.required.length > 0) {
      for (const field of schema.required) {
        errors.push({
          field,
          message: `字段 "${field}" 是必需的`,
          code: 'REQUIRED_FIELD_MISSING',
        })
      }
    }
    return { valid: errors.length === 0, errors, warnings }
  }
  
  // 类型验证
  if (schema.type) {
    const actualType = getType(input)
    const expectedType = schema.type
    
    if (actualType !== expectedType && expectedType !== 'null') {
      // 特殊处理：null 类型的字段
      if (input === null) {
        if (schema.required && schema.required.length > 0) {
          for (const field of schema.required) {
            errors.push({
              field: 'input',
              message: `字段 "${field}" 不能为 null`,
              code: 'NULL_VALUE_NOT_ALLOWED',
            })
          }
        }
      } else {
        errors.push({
          field: 'input',
          message: `类型错误：期望 ${expectedType}，实际得到 ${actualType}`,
          code: 'TYPE_MISMATCH',
        })
      }
    }
  }
  
  // 对象属性验证
  if (schema.type === 'object' && typeof input === 'object' && input !== null) {
    const obj = input as Record<string, unknown>
    
    // 检查必需字段
    if (schema.required) {
      for (const field of schema.required) {
        if (obj[field] === undefined || obj[field] === null) {
          errors.push({
            field,
            message: `字段 "${field}" 是必需的`,
            code: 'REQUIRED_FIELD_MISSING',
          })
        }
      }
    }
    
    // 验证每个属性
    if (schema.properties) {
      for (const [key, value] of Object.entries(obj)) {
        const propertySchema = schema.properties[key]
        if (propertySchema) {
          const propertyErrors = validateInputAgainstSchema(value, propertySchema)
          for (const error of propertyErrors.errors) {
            errors.push({
              ...error,
              field: `${key}.${error.field}`.replace(/^[^.]+\./, ''),
            })
          }
          warnings.push(...propertyErrors.warnings || [])
        }
      }
    }
  }
  
  // 数组验证
  if (schema.type === 'array' && Array.isArray(input)) {
    if (schema.items) {
      input.forEach((item, index) => {
        const itemErrors = validateInputAgainstSchema(item, schema.items!)
        for (const error of itemErrors.errors) {
          errors.push({
            ...error,
            field: `[${index}].${error.field}`,
          })
        }
      })
    }
  }
  
  // 字符串验证
  if (typeof input === 'string') {
    if (schema.minLength !== undefined && input.length < schema.minLength) {
      errors.push({
        field: 'input',
        message: `字符串长度必须至少为 ${schema.minLength}`,
        code: 'STRING_TOO_SHORT',
      })
    }
    
    if (schema.maxLength !== undefined && input.length > schema.maxLength) {
      errors.push({
        field: 'input',
        message: `字符串长度不能超过 ${schema.maxLength}`,
        code: 'STRING_TOO_LONG',
      })
    }
    
    if (schema.pattern) {
      const regex = new RegExp(schema.pattern)
      if (!regex.test(input)) {
        errors.push({
          field: 'input',
          message: `字符串不符合指定的模式`,
          code: 'PATTERN_MISMATCH',
        })
      }
    }
    
    if (schema.enum && !schema.enum.includes(input)) {
      errors.push({
        field: 'input',
        message: `值必须是以下之一: ${schema.enum.join(', ')}`,
        code: 'ENUM_MISMATCH',
      })
    }
  }
  
  // 数字验证
  if (typeof input === 'number') {
    if (schema.minimum !== undefined && input < schema.minimum) {
      errors.push({
        field: 'input',
        message: `数值必须大于等于 ${schema.minimum}`,
        code: 'NUMBER_TOO_SMALL',
      })
    }
    
    if (schema.maximum !== undefined && input > schema.maximum) {
      errors.push({
        field: 'input',
        message: `数值必须小于等于 ${schema.maximum}`,
        code: 'NUMBER_TOO_LARGE',
      })
    }
    
    if (schema.enum && !schema.enum.includes(input)) {
      errors.push({
        field: 'input',
        message: `值必须是以下之一: ${schema.enum.join(', ')}`,
        code: 'ENUM_MISMATCH',
      })
    }
  }
  
  return { valid: errors.length === 0, errors, warnings }
}

/**
 * 获取值的类型
 */
function getType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

/**
 * 验证工具输入的通用函数
 */
export function validateToolInput(
  input: unknown,
  inputSchema: Record<string, unknown>
): ValidationResult {
  // 解析 inputSchema
  const schema = inputSchema as JsonSchema
  
  if (!schema || !schema.type) {
    return {
      valid: true,
      errors: [],
      warnings: ['inputSchema 格式不正确，跳过验证'],
    }
  }
  
  return validateInputAgainstSchema(input, schema)
}

/**
 * 创建验证错误响应
 */
export function createValidationErrorResponse(errors: ValidationError[]): {
  success: false
  error: string
  validationErrors: ValidationError[]
} {
  return {
    success: false,
    error: `输入验证失败:\n${errors.map(e => `  - ${e.field}: ${e.message}`).join('\n')}`,
    validationErrors: errors,
  }
}

/**
 * 验证必填字段
 */
export function validateRequiredFields(
  input: unknown,
  requiredFields: string[]
): ValidationResult {
  const errors: ValidationError[] = []
  
  if (!input || typeof input !== 'object') {
    for (const field of requiredFields) {
      errors.push({
        field,
        message: `字段 "${field}" 是必需的`,
        code: 'REQUIRED_FIELD_MISSING',
      })
    }
    return { valid: false, errors }
  }
  
  const obj = input as Record<string, unknown>
  
  for (const field of requiredFields) {
    if (obj[field] === undefined || obj[field] === null) {
      errors.push({
        field,
        message: `字段 "${field}" 是必需的`,
        code: 'REQUIRED_FIELD_MISSING',
      })
    } else if (typeof obj[field] === 'string' && (obj[field] as string).trim() === '') {
      errors.push({
        field,
        message: `字段 "${field}" 不能为空`,
        code: 'EMPTY_STRING_NOT_ALLOWED',
      })
    }
  }
  
  return { valid: errors.length === 0, errors }
}

/**
 * 验证枚举值
 */
export function validateEnumValue(
  value: unknown,
  fieldName: string,
  allowedValues: unknown[]
): ValidationResult {
  if (!allowedValues.includes(value)) {
    return {
      valid: false,
      errors: [{
        field: fieldName,
        message: `${fieldName} 必须是以下值之一: ${allowedValues.join(', ')}`,
        code: 'INVALID_ENUM_VALUE',
      }],
    }
  }
  return { valid: true, errors: [] }
}

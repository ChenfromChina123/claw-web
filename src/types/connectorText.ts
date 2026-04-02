/**
 * 连接器文本类型的类型定义。
 * 用于标识来自连接器的文本块和文本增量。
 */

export function isConnectorTextBlock(
  value: unknown,
): value is ConnectorTextBlock {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    (value as { type?: unknown }).type === 'connector_text'
  );
}

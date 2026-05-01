-- 为 chat_images 表添加 analysis_text 字段，用于缓存 LLM 分析图片后的文字描述
ALTER TABLE chat_images ADD COLUMN IF NOT EXISTS analysis_text LONGTEXT COMMENT 'LLM 分析图片后的文字描述缓存';

-- V5_0__add_audio_columns_to_word_dict.sql
-- 为 word_dict 表添加音频相关字段（用于扩展和统计）

ALTER TABLE word_dict 
ADD COLUMN audio_url VARCHAR(500) COMMENT '发音音频 URL（缓存）',
ADD COLUMN audio_source VARCHAR(50) COMMENT '音频来源：youdao/baidu/speech-api',
ADD COLUMN play_count INT DEFAULT 0 COMMENT '播放次数',
ADD COLUMN last_played_at DATETIME COMMENT '最后播放时间',
ADD INDEX idx_play_count (play_count);

-- 添加注释
ALTER TABLE word_dict 
MODIFY COLUMN audio_url VARCHAR(500) COMMENT '发音音频 URL（缓存，可选字段，主要使用 Redis 缓存）',
MODIFY COLUMN audio_source VARCHAR(50) COMMENT '音频来源：youdao（有道）, baidu（百度）, speech-api（浏览器 TTS）',
MODIFY COLUMN play_count INT DEFAULT 0 COMMENT '播放次数（用于统计高频单词）',
MODIFY COLUMN last_played_at DATETIME COMMENT '最后播放时间（用于识别高频单词）';

-- V4_2__create_word_dict_table.sql
-- 创建单词词典表 (对接 ECDICT 300万+ 词库)

CREATE TABLE IF NOT EXISTS word_dict (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    word VARCHAR(100) NOT NULL UNIQUE,
    phonetic VARCHAR(100),
    definition TEXT,
    translation TEXT,
    level_tags VARCHAR(200),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_word (word),
    INDEX idx_level_tags (level_tags),
    INDEX idx_word_like (word(50))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

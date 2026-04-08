CREATE TABLE IF NOT EXISTS anonymous_chat_records (
    id BIGINT NOT NULL AUTO_INCREMENT,
    session_id VARCHAR(255) NOT NULL,
    ip_address VARCHAR(64) NOT NULL,
    role VARCHAR(32) NOT NULL,
    content TEXT,
    reasoning_content TEXT,
    model VARCHAR(128),
    user_agent VARCHAR(512),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_anonymous_session_created (session_id, created_at),
    INDEX idx_anonymous_ip_created (ip_address, created_at),
    INDEX idx_anonymous_session_ip_created (session_id, ip_address, created_at)
);


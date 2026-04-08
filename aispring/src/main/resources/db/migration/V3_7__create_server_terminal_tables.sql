CREATE TABLE IF NOT EXISTS server_connections (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    server_name VARCHAR(255) NOT NULL,
    host VARCHAR(255) NOT NULL,
    username VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    port INT NOT NULL DEFAULT 22,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_server_connections_user_id (user_id),
    CONSTRAINT fk_server_connections_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS server_command_executions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    server_id BIGINT NOT NULL,
    command TEXT NOT NULL,
    stdout TEXT NULL,
    stderr TEXT NULL,
    return_code INT NULL,
    executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_server_command_executions_user_id (user_id),
    INDEX idx_server_command_executions_server_id (server_id),
    INDEX idx_server_command_executions_executed_at (executed_at),
    CONSTRAINT fk_server_command_executions_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_server_command_executions_server_id FOREIGN KEY (server_id) REFERENCES server_connections(id) ON DELETE CASCADE
);

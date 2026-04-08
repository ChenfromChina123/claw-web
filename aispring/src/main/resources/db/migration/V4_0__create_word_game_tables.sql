CREATE TABLE IF NOT EXISTS word_game_packages (
    id VARCHAR(64) PRIMARY KEY,
    user_id BIGINT NOT NULL,
    name VARCHAR(200) NOT NULL,
    description VARCHAR(1000) NOT NULL DEFAULT '',
    icon VARCHAR(5000) NOT NULL DEFAULT '📦',
    level VARCHAR(50) NOT NULL DEFAULT '自定义',
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

SET @idx_exists = (
    SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'word_game_packages' AND index_name = 'idx_wg_pkg_user'
);
SET @ddl = IF(@idx_exists = 0, 'CREATE INDEX idx_wg_pkg_user ON word_game_packages(user_id)', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (
    SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'word_game_packages' AND index_name = 'idx_wg_pkg_public'
);
SET @ddl = IF(@idx_exists = 0, 'CREATE INDEX idx_wg_pkg_public ON word_game_packages(is_public)', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (
    SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'word_game_packages' AND index_name = 'idx_wg_pkg_created'
);
SET @ddl = IF(@idx_exists = 0, 'CREATE INDEX idx_wg_pkg_created ON word_game_packages(created_at)', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS word_game_courses (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    package_id VARCHAR(64) NOT NULL,
    course_index INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_wg_courses_package FOREIGN KEY (package_id) REFERENCES word_game_packages(id) ON DELETE CASCADE,
    CONSTRAINT uq_wg_course UNIQUE (package_id, course_index)
);

SET @idx_exists = (
    SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'word_game_courses' AND index_name = 'idx_wg_course_pkg'
);
SET @ddl = IF(@idx_exists = 0, 'CREATE INDEX idx_wg_course_pkg ON word_game_courses(package_id)', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS word_game_statements (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    package_id VARCHAR(64) NOT NULL,
    course_index INT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    english VARCHAR(2000) NOT NULL,
    chinese VARCHAR(2000) NOT NULL,
    soundmark VARCHAR(200) NOT NULL DEFAULT '',
    CONSTRAINT fk_wg_statements_package FOREIGN KEY (package_id) REFERENCES word_game_packages(id) ON DELETE CASCADE
);

SET @idx_exists = (
    SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'word_game_statements' AND index_name = 'idx_wg_stmt_pkg'
);
SET @ddl = IF(@idx_exists = 0, 'CREATE INDEX idx_wg_stmt_pkg ON word_game_statements(package_id)', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (
    SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'word_game_statements' AND index_name = 'idx_wg_stmt_pkg_course'
);
SET @ddl = IF(@idx_exists = 0, 'CREATE INDEX idx_wg_stmt_pkg_course ON word_game_statements(package_id, course_index)', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS word_game_progress (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    package_id VARCHAR(64) NOT NULL,
    course_index INT NOT NULL,
    current_q INT NOT NULL DEFAULT 0,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    study_secs INT NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_wg_progress UNIQUE (user_id, package_id, course_index)
);

SET @idx_exists = (
    SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'word_game_progress' AND index_name = 'idx_wg_progress_user'
);
SET @ddl = IF(@idx_exists = 0, 'CREATE INDEX idx_wg_progress_user ON word_game_progress(user_id)', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (
    SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'word_game_progress' AND index_name = 'idx_wg_progress_user_pkg'
);
SET @ddl = IF(@idx_exists = 0, 'CREATE INDEX idx_wg_progress_user_pkg ON word_game_progress(user_id, package_id)', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS word_game_package_clicks (
    package_id VARCHAR(64) PRIMARY KEY,
    click_count INT NOT NULL DEFAULT 0
);

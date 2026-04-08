-- AI Study Project - MySQL 初始化脚本
-- 用于初始化数据库基础结构

-- 设置字符集
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- 创建应用数据库（如果不存在）
CREATE DATABASE IF NOT EXISTS aispring DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS claude_code_haha DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 创建只读用户（用于监控）
CREATE USER IF NOT EXISTS 'monitor'@'%' IDENTIFIED BY 'monitor_readonly_password';
GRANT SELECT, PROCESS ON *.* TO 'monitor'@'%';
FLUSH PRIVILEGES;

-- 显示创建结果
SHOW DATABASES;

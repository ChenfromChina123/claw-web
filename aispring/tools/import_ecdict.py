#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ECDICT 词典库高效批量导入脚本
直接连接 MySQL 数据库进行批量导入，跳过 Spring Boot 应用层
"""

import os
import sys
import csv
import time
import mysql.connector
from mysql.connector import Error

DB_CONFIG = {
    'host': os.environ.get('DB_HOST', 'localhost'),
    'port': int(os.environ.get('DB_PORT', 3306)),
    'database': os.environ.get('DB_NAME', 'ipv6_education'),
    'user': os.environ.get('DB_USERNAME', 'root'),
    'password': os.environ.get('DB_PASSWORD', ''),
}

CSV_FILE = r'd:\Users\Administrator\AistudyProject\new_pro\ai-tutor-system\aispring\ecdict.csv'
BATCH_SIZE = 2000
CHECKPOINT_FILE = 'import_checkpoint.txt'

def get_start_position():
    """获取已导入位置"""
    if os.path.exists(CHECKPOINT_FILE):
        with open(CHECKPOINT_FILE, 'r') as f:
            return int(f.read().strip())
    return 0

def save_checkpoint(position):
    """保存导入位置"""
    with open(CHECKPOINT_FILE, 'w') as f:
        f.write(str(position))

def split_csv_line(line):
    """简单CSV解析，处理引号内的逗号"""
    parts = []
    current = ''
    in_quotes = False
    for char in line:
        if char == '"':
            in_quotes = not in_quotes
        elif char == ',' and not in_quotes:
            parts.append(current.strip())
            current = ''
        else:
            current += char
    parts.append(current.strip())
    return parts

def create_table_if_not_exists(cursor):
    """创建表"""
    sql = """
    CREATE TABLE IF NOT EXISTS word_dict (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        word VARCHAR(100) NOT NULL UNIQUE,
        phonetic VARCHAR(100),
        definition TEXT,
        translation TEXT,
        level_tags VARCHAR(200),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_word (word),
        INDEX idx_level_tags (level_tags)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """
    cursor.execute(sql)

def import_ecdict():
    print("=" * 50)
    print("ECDICT 词典库批量导入脚本")
    print("=" * 50)
    print(f"数据库: {DB_CONFIG['database']}@{DB_CONFIG['host']}:{DB_CONFIG['port']}")
    print(f"数据文件: {CSV_FILE}")
    print(f"批次大小: {BATCH_SIZE}")
    print("=" * 50)

    if not os.path.exists(CSV_FILE):
        print(f"错误: 文件不存在 {CSV_FILE}")
        return

    conn = None
    try:
        print("正在连接数据库...")
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()

        create_table_if_not_exists(cursor)
        print("数据库连接成功!")

        start_pos = get_start_position()
        if start_pos > 0:
            print(f"从断点恢复，已跳过 {start_pos} 行")

        start_time = time.time()
        total_imported = start_pos
        batch = []
        line_num = 0

        with open(CSV_FILE, 'r', encoding='utf-8') as f:
            for line in f:
                line_num += 1

                if line_num <= start_pos:
                    continue

                if line_num == 1:
                    continue

                parts = split_csv_line(line)
                if len(parts) < 2:
                    continue

                word = parts[0].strip()
                if not word or len(word) > 100:
                    continue

                phonetic = parts[1].strip() if len(parts) > 1 else None
                definition = parts[2].strip() if len(parts) > 2 else None
                translation = parts[3].strip() if len(parts) > 3 else None
                level_tags = parts[4].strip() if len(parts) > 4 else None

                batch.append((word, phonetic, definition, translation, level_tags))

                if len(batch) >= BATCH_SIZE:
                    try:
                        sql = """
                        INSERT IGNORE INTO word_dict (word, phonetic, definition, translation, level_tags)
                        VALUES (%s, %s, %s, %s, %s)
                        """
                        cursor.executemany(sql, batch)
                        conn.commit()
                        total_imported += len(batch)

                        elapsed = time.time() - start_time
                        speed = total_imported / elapsed if elapsed > 0 else 0

                        print(f"已导入 {total_imported:,} 条记录 (速度: {speed:.0f} 条/秒)")

                        save_checkpoint(line_num)
                        batch = []
                    except Error as e:
                        print(f"插入错误: {e}")
                        conn.rollback()
                        batch = []

        if batch:
            try:
                sql = """
                INSERT IGNORE INTO word_dict (word, phonetic, definition, translation, level_tags)
                VALUES (%s, %s, %s, %s, %s)
                """
                cursor.executemany(sql, batch)
                conn.commit()
                total_imported += len(batch)
            except Error as e:
                print(f"最终批次插入错误: {e}")

        elapsed = time.time() - start_time
        print("=" * 50)
        print(f"导入完成!")
        print(f"总计导入: {total_imported:,} 条记录")
        print(f"耗时: {elapsed:.1f} 秒")
        print(f"平均速度: {total_imported / elapsed:.0f} 条/秒")
        print("=" * 50)

        if os.path.exists(CHECKPOINT_FILE):
            os.remove(CHECKPOINT_FILE)

    except Error as e:
        print(f"数据库错误: {e}")
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()
            print("数据库连接已关闭")

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='ECDICT 批量导入工具')
    parser.add_argument('--host', default=None, help='数据库主机')
    parser.add_argument('--port', type=int, default=None, help='数据库端口')
    parser.add_argument('--database', default=None, help='数据库名')
    parser.add_argument('--user', default=None, help='数据库用户')
    parser.add_argument('--password', default=None, help='数据库密码')
    parser.add_argument('--file', default=None, help='CSV文件路径')
    args = parser.parse_args()

    if args.host:
        DB_CONFIG['host'] = args.host
    if args.port:
        DB_CONFIG['port'] = args.port
    if args.database:
        DB_CONFIG['database'] = args.database
    if args.user:
        DB_CONFIG['user'] = args.user
    if args.password:
        DB_CONFIG['password'] = args.password
    if args.file:
        global CSV_FILE
        CSV_FILE = args.file

    import_ecdict()

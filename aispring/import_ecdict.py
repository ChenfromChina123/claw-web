#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ECDICT 词典库导入脚本
从 CSV 文件导入单词数据到 MySQL 数据库

使用方法:
    python import_ecdict.py [--file <csv_file>] [--batch <batch_size>] [--limit <max_records>]

示例:
    python import_ecdict.py                                    # 从默认URL下载并导入
    python import_ecdict.py --file ecdict.csv                  # 从本地文件导入
    python import_ecdict.py --batch 2000 --limit 100000        # 每批2000条，最多导入10万条
"""

import argparse
import csv
import os
import sys
import time
from datetime import datetime
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

try:
    import mysql.connector
    from mysql.connector import Error
except ImportError:
    print("错误: 请先安装 mysql-connector-python")
    print("运行: pip install mysql-connector-python")
    sys.exit(1)

# 数据库配置
DB_CONFIG = {
    'host': 'localhost',
    'port': 3306,
    'user': 'aispring',
    'password': 'xGDswMCdHhsajfxF',
    'database': 'aispring',
    'charset': 'utf8mb4',
    'collation': 'utf8mb4_unicode_ci',
    'autocommit': False,
    'use_pure': True
}

# ECDICT 下载地址
ECDICT_URL = 'https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv'
# 备用地址（国内镜像）
ECDICT_URL_BACKUP = 'https://cdn.jsdelivr.net/gh/skywind3000/ECDICT@master/ecdict.csv'

# 默认配置
DEFAULT_BATCH_SIZE = 2000
DEFAULT_CSV_FILE = 'ecdict.csv'
DOWNLOAD_CHUNK_SIZE = 1024 * 1024  # 1MB


def create_connection():
    """
    创建数据库连接

    Returns:
        mysql.connector.connection.MySQLConnection: 数据库连接对象
    """
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        print(f"✅ 数据库连接成功: {DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['database']}")
        return conn
    except Error as e:
        print(f"❌ 数据库连接失败: {e}")
        sys.exit(1)


def check_table_exists(conn):
    """
    检查 word_dict 表是否存在

    Args:
        conn: 数据库连接对象

    Returns:
        bool: 表是否存在
    """
    cursor = conn.cursor()
    cursor.execute("SHOW TABLES LIKE 'word_dict'")
    result = cursor.fetchone()
    cursor.close()
    return result is not None


def create_table(conn):
    """
    创建 word_dict 表

    Args:
        conn: 数据库连接对象
    """
    cursor = conn.cursor()
    create_sql = """
    CREATE TABLE IF NOT EXISTS word_dict (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        word VARCHAR(100) NOT NULL UNIQUE,
        phonetic VARCHAR(100),
        definition TEXT,
        translation TEXT,
        pos VARCHAR(50),
        collins TINYINT,
        oxford TINYINT,
        level_tags VARCHAR(200),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_word (word),
        INDEX idx_level (level_tags),
        INDEX idx_collins (collins),
        INDEX idx_oxford (oxford)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    """
    cursor.execute(create_sql)
    conn.commit()
    cursor.close()
    print("✅ word_dict 表已创建")


def alter_table_add_columns(conn):
    """
    为现有表添加新字段

    Args:
        conn: 数据库连接对象
    """
    cursor = conn.cursor()

    # 检查并添加 pos 列
    cursor.execute("SHOW COLUMNS FROM word_dict LIKE 'pos'")
    if not cursor.fetchone():
        cursor.execute("ALTER TABLE word_dict ADD COLUMN pos VARCHAR(50) AFTER translation")
        print("  ✅ 添加 pos 列")

    # 检查并添加 collins 列
    cursor.execute("SHOW COLUMNS FROM word_dict LIKE 'collins'")
    if not cursor.fetchone():
        cursor.execute("ALTER TABLE word_dict ADD COLUMN collins TINYINT AFTER pos")
        print("  ✅ 添加 collins 列")

    # 检查并添加 oxford 列
    cursor.execute("SHOW COLUMNS FROM word_dict LIKE 'oxford'")
    if not cursor.fetchone():
        cursor.execute("ALTER TABLE word_dict ADD COLUMN oxford TINYINT AFTER collins")
        print("  ✅ 添加 oxford 列")

    # 添加索引
    try:
        cursor.execute("ALTER TABLE word_dict ADD INDEX idx_collins (collins)")
    except:
        pass
    try:
        cursor.execute("ALTER TABLE word_dict ADD INDEX idx_oxford (oxford)")
    except:
        pass

    conn.commit()
    cursor.close()


def get_current_count(conn):
    """
    获取当前数据库中的单词数量

    Args:
        conn: 数据库连接对象

    Returns:
        int: 当前单词数量
    """
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM word_dict")
    count = cursor.fetchone()[0]
    cursor.close()
    return count


def download_csv(url, dest_file):
    """
    下载 CSV 文件

    Args:
        url: 下载地址
        dest_file: 目标文件路径

    Returns:
        bool: 是否下载成功
    """
    print(f"📥 开始下载: {url}")

    try:
        request = Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        response = urlopen(request, timeout=30)

        total_size = int(response.headers.get('content-length', 0))
        downloaded = 0

        with open(dest_file, 'wb') as f:
            while True:
                chunk = response.read(DOWNLOAD_CHUNK_SIZE)
                if not chunk:
                    break
                f.write(chunk)
                downloaded += len(chunk)

                if total_size > 0:
                    percent = (downloaded / total_size) * 100
                    mb_downloaded = downloaded / (1024 * 1024)
                    mb_total = total_size / (1024 * 1024)
                    print(f"\r⏳ 下载进度: {percent:.1f}% ({mb_downloaded:.1f}/{mb_total:.1f} MB)", end='', flush=True)

        print(f"\n✅ 下载完成: {dest_file} ({downloaded / (1024 * 1024):.1f} MB)")
        return True

    except (URLError, HTTPError) as e:
        print(f"\n❌ 下载失败: {e}")
        return False


def parse_csv_row(row):
    """
    解析 CSV 行数据

    CSV 列结构:
        0: word - 单词
        1: phonetic - 音标
        2: definition - 定义
        3: translation - 翻译
        4: pos - 词性
        5: collins - 柯林斯星级 (1-5)
        6: oxford - 牛津标记 (0/1)
        7: tag - 分类标签 (zk/gk/cet4/cet6/ky/toefl/gre/ielts)

    Args:
        row: CSV 行数据列表

    Returns:
        tuple: (word, phonetic, definition, translation, pos, collins, oxford, level_tags) 或 None
    """
    if not row or len(row) < 1:
        return None

    word = row[0].strip()
    if not word or len(word) > 100:
        return None

    phonetic = row[1].strip() if len(row) > 1 and row[1] else None
    definition = row[2].strip() if len(row) > 2 and row[2] else None
    translation = row[3].strip() if len(row) > 3 and row[3] else None

    # 新增字段
    pos = row[4].strip() if len(row) > 4 and row[4] else None

    # collins 星级 (转换为整数)
    collins = None
    if len(row) > 5 and row[5]:
        try:
            collins = int(row[5].strip())
        except ValueError:
            pass

    # oxford 标记 (转换为整数)
    oxford = None
    if len(row) > 6 and row[6]:
        try:
            oxford = int(row[6].strip())
        except ValueError:
            pass

    # tag 分类标签
    level_tags = row[7].strip() if len(row) > 7 and row[7] else None

    return (word, phonetic, definition, translation, pos, collins, oxford, level_tags)


def import_from_csv(conn, csv_file, batch_size=DEFAULT_BATCH_SIZE, limit=None):
    """
    从 CSV 文件导入数据到数据库（支持去重）

    Args:
        conn: 数据库连接对象
        csv_file: CSV 文件路径
        batch_size: 批量插入大小
        limit: 最大导入数量（None 表示不限制）

    Returns:
        int: 导入的记录数
    """
    if not os.path.exists(csv_file):
        print(f"❌ 文件不存在: {csv_file}")
        return 0

    file_size = os.path.getsize(csv_file) / (1024 * 1024)
    print(f"📄 CSV 文件: {csv_file} ({file_size:.1f} MB)")
    print("🔄 正在读取并去重...")

    cursor = conn.cursor()

    # 准备插入语句（使用 INSERT IGNORE 避免数据库重复）
    insert_sql = """
    INSERT IGNORE INTO word_dict (word, phonetic, definition, translation, pos, collins, oxford, level_tags, created_at)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    """

    # 使用字典进行去重，key 为单词（小写），value 为数据元组
    word_dict = {}
    total_lines = 0
    invalid_lines = 0

    # 尝试不同的编码
    encodings = ['utf-8', 'utf-8-sig', 'gbk', 'latin-1']

    for encoding in encodings:
        try:
            with open(csv_file, 'r', encoding=encoding, errors='ignore') as f:
                reader = csv.reader(f)

                # 跳过标题行
                try:
                    next(reader)
                except StopIteration:
                    pass

                for row in reader:
                    total_lines += 1

                    parsed = parse_csv_row(row)
                    if parsed:
                        word_key = parsed[0].lower()  # 使用小写作为 key 进行去重
                        if word_key not in word_dict:
                            word_dict[word_key] = parsed
                    else:
                        invalid_lines += 1

                break  # 成功读取，跳出编码循环

        except UnicodeDecodeError:
            continue
        except Exception as e:
            print(f"⚠️ 读取文件失败 ({encoding}): {e}")
            continue

    # 去重统计
    duplicates = total_lines - invalid_lines - len(word_dict)
    print(f"📊 CSV 文件统计:")
    print(f"   - 总行数: {total_lines:,}")
    print(f"   - 无效行数: {invalid_lines:,}")
    print(f"   - 重复单词: {duplicates:,}")
    print(f"   - 去重后数量: {len(word_dict):,}")

    # 应用 limit 限制
    words_to_import = list(word_dict.values())
    if limit and len(words_to_import) > limit:
        words_to_import = words_to_import[:limit]
        print(f"   - 限制导入: {limit:,}")

    # 批量导入
    print("\n🚀 开始导入数据库...")
    imported = 0
    db_duplicates = 0
    batch = []
    start_time = time.time()
    now = datetime.now()

    for parsed in words_to_import:
        batch.append((*parsed, now))

        if len(batch) >= batch_size:
            try:
                cursor.executemany(insert_sql, batch)
                # 计算实际插入数量
                inserted_rows = cursor.rowcount
                imported += inserted_rows
                db_duplicates += len(batch) - inserted_rows
                conn.commit()

                elapsed = time.time() - start_time
                speed = imported / elapsed if elapsed > 0 else 0
                print(f"\r⏳ 已导入: {imported:,} 条 | 速度: {speed:.0f} 条/秒", end='', flush=True)

            except Error as e:
                conn.rollback()
                print(f"\n⚠️ 批量插入失败: {e}")

            batch = []

    # 处理最后一批
    if batch:
        try:
            cursor.executemany(insert_sql, batch)
            inserted_rows = cursor.rowcount
            imported += inserted_rows
            db_duplicates += len(batch) - inserted_rows
            conn.commit()
        except Error as e:
            conn.rollback()
            print(f"\n⚠️ 最后一批插入失败: {e}")

    cursor.close()

    elapsed = time.time() - start_time
    print(f"\n")
    print(f"{'='*50}")
    print(f"✅ 导入完成!")
    print(f"   - 成功导入: {imported:,} 条")
    print(f"   - CSV 重复跳过: {duplicates:,} 条")
    print(f"   - 数据库重复跳过: {db_duplicates:,} 条")
    print(f"   - 无效记录: {invalid_lines:,} 条")
    print(f"   - 耗时: {elapsed:.1f} 秒")
    print(f"   - 平均速度: {imported / elapsed:.0f} 条/秒")
    print(f"{'='*50}")

    return imported


def main():
    """
    主函数
    """
    parser = argparse.ArgumentParser(
        description='ECDICT 词典库导入脚本',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
    python import_ecdict.py                                    # 从默认URL下载并导入
    python import_ecdict.py --file ecdict.csv                  # 从本地文件导入
    python import_ecdict.py --batch 2000 --limit 100000        # 每批2000条，最多导入10万条
    python import_ecdict.py --download-only                    # 仅下载文件，不导入
        """
    )

    parser.add_argument('--file', '-f', default=None, help='CSV 文件路径（不指定则自动下载）')
    parser.add_argument('--batch', '-b', type=int, default=DEFAULT_BATCH_SIZE, help=f'批量插入大小（默认: {DEFAULT_BATCH_SIZE}）')
    parser.add_argument('--limit', '-l', type=int, default=None, help='最大导入数量（默认: 不限制）')
    parser.add_argument('--download-only', action='store_true', help='仅下载文件，不导入数据库')
    parser.add_argument('--skip-download', action='store_true', help='跳过下载，使用已有文件')

    args = parser.parse_args()

    print("="*50)
    print("📚 ECDICT 词典库导入工具")
    print("="*50)

    # 确定CSV文件路径
    csv_file = args.file
    if not csv_file:
        csv_file = DEFAULT_CSV_FILE

    # 如果文件不存在且不是跳过下载，则下载
    if not args.skip_download and not os.path.exists(csv_file):
        # 尝试主地址
        if not download_csv(ECDICT_URL, csv_file):
            # 尝试备用地址
            print("🔄 尝试备用下载地址...")
            if not download_csv(ECDICT_URL_BACKUP, csv_file):
                print("❌ 所有下载地址均失败，请手动下载 CSV 文件")
                print(f"   下载地址: {ECDICT_URL}")
                sys.exit(1)

    # 如果只是下载，到此结束
    if args.download_only:
        print("✅ 文件下载完成，退出")
        sys.exit(0)

    # 检查文件是否存在
    if not os.path.exists(csv_file):
        print(f"❌ CSV 文件不存在: {csv_file}")
        print("   请使用 --file 参数指定文件路径，或移除 --skip-download 参数自动下载")
        sys.exit(1)

    # 连接数据库
    conn = create_connection()

    try:
        # 检查表是否存在
        if not check_table_exists(conn):
            print("⚠️  word_dict 表不存在，正在创建...")
            create_table(conn)
        else:
            # 表已存在，检查并添加新字段
            print("🔧 检查并更新表结构...")
            alter_table_add_columns(conn)

        # 显示当前数据量
        current_count = get_current_count(conn)
        print(f"📊 当前数据库已有: {current_count:,} 条记录")

        # 导入数据
        import_from_csv(conn, csv_file, args.batch, args.limit)

        # 显示最终数据量
        final_count = get_current_count(conn)
        print(f"📊 导入后数据库共有: {final_count:,} 条记录")

    finally:
        conn.close()
        print("👋 数据库连接已关闭")


if __name__ == '__main__':
    main()

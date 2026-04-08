#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
更新现有单词记录的分类信息
"""

import csv
import time
import mysql.connector
from mysql.connector import Error

# 数据库配置
DB_CONFIG = {
    'host': 'localhost',
    'port': 3306,
    'user': 'root',
    'password': '123456',
    'database': 'ipv6_education',
    'charset': 'utf8mb4',
    'collation': 'utf8mb4_unicode_ci',
    'autocommit': False,
    'use_pure': True
}

DEFAULT_BATCH_SIZE = 1000
CSV_FILE = 'ecdict.csv'


def update_existing_records(csv_file=CSV_FILE, batch_size=DEFAULT_BATCH_SIZE):
    """
    更新现有记录的分类信息

    Args:
        csv_file: CSV 文件路径
        batch_size: 批量更新大小
    """
    conn = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor()
    
    # 使用 INSERT ... ON DUPLICATE KEY UPDATE 来更新现有记录
    update_sql = """
    INSERT INTO word_dict (word, phonetic, definition, translation, pos, collins, oxford, level_tags, created_at)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
    ON DUPLICATE KEY UPDATE
        pos = VALUES(pos),
        collins = VALUES(collins),
        oxford = VALUES(oxford),
        level_tags = VALUES(level_tags)
    """
    
    print("🔄 正在读取 CSV 文件...")
    
    # 读取 CSV 并构建更新数据
    update_data = {}
    total_lines = 0
    
    with open(csv_file, 'r', encoding='utf-8', errors='ignore') as f:
        reader = csv.reader(f)
        next(reader)  # 跳过标题行
        
        for row in reader:
            total_lines += 1
            if not row or len(row) < 8:
                continue
            
            word = row[0].strip()
            if not word:
                continue
            
            phonetic = row[1].strip() if len(row) > 1 and row[1] else None
            definition = row[2].strip() if len(row) > 2 and row[2] else None
            translation = row[3].strip() if len(row) > 3 and row[3] else None
            pos = row[4].strip() if len(row) > 4 and row[4] else None
            
            collins = None
            if len(row) > 5 and row[5]:
                try:
                    collins = int(row[5].strip())
                except ValueError:
                    pass
            
            oxford = None
            if len(row) > 6 and row[6]:
                try:
                    oxford = int(row[6].strip())
                except ValueError:
                    pass
            
            level_tags = row[7].strip() if len(row) > 7 and row[7] else None
            
            # 只保留有分类信息的记录
            if pos or collins or oxford or level_tags:
                update_data[word.lower()] = (word, phonetic, definition, translation, pos, collins, oxford, level_tags)
    
    print(f"📊 CSV 总行数: {total_lines:,}")
    print(f"📊 有分类信息的记录: {len(update_data):,}")
    
    # 批量更新
    print("\n🚀 开始更新数据库...")
    updated = 0
    batch = []
    start_time = time.time()
    
    for data in update_data.values():
        batch.append(data)
        
        if len(batch) >= batch_size:
            try:
                cursor.executemany(update_sql, batch)
                updated += cursor.rowcount
                conn.commit()
                
                elapsed = time.time() - start_time
                speed = updated / elapsed if elapsed > 0 else 0
                print(f"\r⏳ 已更新: {updated:,} 条 | 速度: {speed:.0f} 条/秒", end='', flush=True)
            
            except Error as e:
                conn.rollback()
                print(f"\n⚠️ 批量更新失败: {e}")
            
            batch = []
    
    # 处理最后一批
    if batch:
        try:
            cursor.executemany(update_sql, batch)
            updated += cursor.rowcount
            conn.commit()
        except Error as e:
            conn.rollback()
            print(f"\n⚠️ 最后一批更新失败: {e}")
    
    cursor.close()
    conn.close()
    
    elapsed = time.time() - start_time
    print(f"\n")
    print(f"{'='*50}")
    print(f"✅ 更新完成!")
    print(f"   - 更新记录: {updated:,} 条")
    print(f"   - 耗时: {elapsed:.1f} 秒")
    print(f"   - 平均速度: {updated / elapsed:.0f} 条/秒")
    print(f"{'='*50}")


if __name__ == '__main__':
    update_existing_records()

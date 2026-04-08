#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
检查单词词典中的分类信息
"""

import mysql.connector

def check_categories():
    conn = mysql.connector.connect(
        host='localhost',
        port=3306,
        user='root',
        password='123456',
        database='ipv6_education',
        charset='utf8mb4'
    )
    
    cursor = conn.cursor()
    
    print('='*60)
    print('📊 单词分类统计 (level_tags 字段)')
    print('='*60)
    
    # 统计有分类的记录数
    cursor.execute("SELECT COUNT(*) FROM word_dict WHERE level_tags IS NOT NULL AND level_tags != ''")
    with_tags = cursor.fetchone()[0]
    
    cursor.execute('SELECT COUNT(*) FROM word_dict')
    total = cursor.fetchone()[0]
    
    print(f'总记录数: {total:,}')
    print(f'有分类的记录: {with_tags:,} ({with_tags/total*100:.1f}%)')
    print()
    
    # 查看分类类型
    print('='*60)
    print('🏷️ 分类标签统计 (Top 20)')
    print('='*60)
    
    cursor.execute("""
        SELECT level_tags, COUNT(*) as cnt 
        FROM word_dict 
        WHERE level_tags IS NOT NULL AND level_tags != '' 
        GROUP BY level_tags 
        ORDER BY cnt DESC 
        LIMIT 20
    """)
    
    print(f"{'分类标签':<30} {'数量':>15}")
    print('-'*50)
    for row in cursor.fetchall():
        tag = row[0][:25] if row[0] else ''
        print(f'{tag:<30} {row[1]:>15,}')
    
    print()
    print('='*60)
    print('📝 各分类示例单词')
    print('='*60)
    
    # 获取几个分类的示例单词
    cursor.execute("""
        SELECT level_tags, word, translation 
        FROM word_dict 
        WHERE level_tags IS NOT NULL AND level_tags != '' 
        LIMIT 15
    """)
    
    for row in cursor.fetchall():
        trans = row[2][:50] if row[2] and len(row[2]) > 50 else row[2]
        print(f'[{row[0]}] {row[1]}: {trans}')
    
    cursor.close()
    conn.close()

if __name__ == '__main__':
    check_categories()

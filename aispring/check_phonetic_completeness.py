#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
检查 word_dict 表中 phonetic 字段的完整性
"""

import mysql.connector

def check_phonetic_completeness():
    """检查 phonetic 字段的完整性"""
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
    print('📊 检查 phonetic 字段完整性')
    print('='*60)
    
    # 1. 总记录数
    cursor.execute("SELECT COUNT(*) FROM word_dict")
    total = cursor.fetchone()[0]
    print(f'\n总单词数：{total:,}')
    
    # 2. 有 phonetic 的记录数
    cursor.execute("SELECT COUNT(*) FROM word_dict WHERE phonetic IS NOT NULL AND phonetic != ''")
    with_phonetic = cursor.fetchone()[0]
    print(f'有 phonetic 的单词数：{with_phonetic:,}')
    
    # 3. 无 phonetic 的记录数
    cursor.execute("SELECT COUNT(*) FROM word_dict WHERE phonetic IS NULL OR phonetic = ''")
    without_phonetic = cursor.fetchone()[0]
    print(f'无 phonetic 的单词数：{without_phonetic:,}')
    
    # 4. 计算百分比
    if total > 0:
        percent_with = (with_phonetic / total) * 100
        percent_without = (without_phonetic / total) * 100
        print(f'\n有 phonetic 的比例：{percent_with:.2f}%')
        print(f'无 phonetic 的比例：{percent_without:.2f}%')
    
    # 5. 示例：有 phonetic 的单词
    print('\n' + '='*60)
    print('📝 有 phonetic 的单词示例（前 10 个）')
    print('='*60)
    cursor.execute("""
        SELECT word, phonetic, translation 
        FROM word_dict 
        WHERE phonetic IS NOT NULL AND phonetic != '' 
        LIMIT 10
    """)
    for row in cursor.fetchall():
        word = row[0]
        phonetic = row[1] or ''
        translation = (row[2][:50] if row[2] and len(row[2]) > 50 else row[2]) or ''
        print(f'  {word}: [{phonetic}] - {translation}')
    
    # 6. 示例：无 phonetic 的单词
    print('\n' + '='*60)
    print('⚠️  无 phonetic 的单词示例（前 10 个）')
    print('='*60)
    cursor.execute("""
        SELECT word, translation 
        FROM word_dict 
        WHERE phonetic IS NULL OR phonetic = '' 
        LIMIT 10
    """)
    results = cursor.fetchall()
    if results:
        for row in results:
            word = row[0]
            translation = (row[1][:50] if row[1] and len(row[1]) > 50 else row[1]) or ''
            print(f'  {word}: {translation}')
    else:
        print('  ✅ 所有单词都有 phonetic 字段！')
    
    # 7. 按长度分析
    print('\n' + '='*60)
    print('📈 按单词长度分析 phonetic 覆盖率')
    print('='*60)
    cursor.execute("""
        SELECT 
            CASE 
                WHEN LENGTH(word) <= 3 THEN '1-3 字母'
                WHEN LENGTH(word) <= 5 THEN '4-5 字母'
                WHEN LENGTH(word) <= 7 THEN '6-7 字母'
                WHEN LENGTH(word) <= 10 THEN '8-10 字母'
                ELSE '11+ 字母'
            END as length_range,
            COUNT(*) as total,
            SUM(CASE WHEN phonetic IS NOT NULL AND phonetic != '' THEN 1 ELSE 0 END) as with_phonetic
        FROM word_dict
        GROUP BY length_range
        ORDER BY MIN(LENGTH(word))
    """)
    for row in cursor.fetchall():
        length_range = row[0]
        total_count = row[1]
        with_phonetic_count = row[2]
        percent = (with_phonetic_count / total_count) * 100 if total_count > 0 else 0
        print(f'  {length_range}: 总计 {total_count:,}, 有 phonetic: {with_phonetic_count:,} ({percent:.1f}%)')
    
    # 8. 按分类标签分析
    print('\n' + '='*60)
    print('📈 按分类标签分析 phonetic 覆盖率（Top 10）')
    print('='*60)
    cursor.execute("""
        SELECT 
            level_tags,
            COUNT(*) as total,
            SUM(CASE WHEN phonetic IS NOT NULL AND phonetic != '' THEN 1 ELSE 0 END) as with_phonetic
        FROM word_dict
        WHERE level_tags IS NOT NULL AND level_tags != ''
        GROUP BY level_tags
        ORDER BY total DESC
        LIMIT 10
    """)
    for row in cursor.fetchall():
        tags = row[0]
        total_count = row[1]
        with_phonetic_count = row[2]
        percent = (with_phonetic_count / total_count) * 100 if total_count > 0 else 0
        print(f'  {tags}: 总计 {total_count:,}, 有 phonetic: {with_phonetic_count:,} ({percent:.1f}%)')
    
    cursor.close()
    conn.close()
    
    print('\n' + '='*60)
    print('✅ 检查完成！')
    print('='*60)

if __name__ == '__main__':
    try:
        check_phonetic_completeness()
    except Exception as e:
        print(f'❌ 检查失败：{e}')
        import traceback
        traceback.print_exc()

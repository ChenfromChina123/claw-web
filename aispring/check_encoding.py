#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
检查 word_dict 表中的乱码问题
"""

import mysql.connector

def check_encoding():
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
    print('📊 数据库编码检查')
    print('='*60)
    
    # 检查数据库字符集
    cursor.execute("SHOW VARIABLES LIKE 'character_set%'")
    print('\n数据库字符集设置:')
    for row in cursor.fetchall():
        print(f'  {row[0]}: {row[1]}')
    
    # 检查表字符集
    cursor.execute("SHOW CREATE TABLE word_dict")
    create_table = cursor.fetchone()[1]
    print(f'\n表字符集: {create_table}')
    
    print('\n' + '='*60)
    print('📝 检查包含中文的记录')
    print('='*60)
    
    cursor.execute("""
        SELECT id, word, phonetic, translation 
        FROM word_dict 
        WHERE translation IS NOT NULL AND translation != '' 
        LIMIT 10
    """)
    
    for row in cursor.fetchall():
        trans = row[3][:80] if row[3] and len(row[3]) > 80 else row[3]
        print(f'\nID: {row[0]}')
        print(f'  Word: {row[1]}')
        print(f'  Phonetic: {row[2]}')
        print(f'  Translation: {trans}')
    
    print('\n' + '='*60)
    print('🔤 检查音标字段')
    print('='*60)
    
    cursor.execute("""
        SELECT id, word, phonetic 
        FROM word_dict 
        WHERE phonetic IS NOT NULL AND phonetic != '' 
        LIMIT 10
    """)
    
    for row in cursor.fetchall():
        print(f'ID: {row[0]}, Word: {row[1]}, Phonetic: {row[2]}')
    
    print('\n' + '='*60)
    print('⚠️ 检查可能的乱码记录')
    print('='*60)
    
    # 检查包含替换字符的记录
    cursor.execute("""
        SELECT id, word, translation 
        FROM word_dict 
        WHERE translation LIKE '%\ufffd%' 
        LIMIT 10
    """)
    bad_rows = cursor.fetchall()
    
    if bad_rows:
        print(f'发现 {len(bad_rows)} 条可能的乱码记录:')
        for row in bad_rows:
            trans = row[2][:100] if row[2] and len(row[2]) > 100 else row[2]
            print(f'  ID: {row[0]}, Word: {row[1]}, Translation: {trans}')
    else:
        print('✅ 未发现明显的乱码记录')
    
    # 统计信息
    print('\n' + '='*60)
    print('📈 统计信息')
    print('='*60)
    
    cursor.execute("SELECT COUNT(*) FROM word_dict")
    total = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM word_dict WHERE translation IS NOT NULL AND translation != ''")
    with_trans = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM word_dict WHERE phonetic IS NOT NULL AND phonetic != ''")
    with_phonetic = cursor.fetchone()[0]
    
    print(f'总记录数: {total:,}')
    print(f'有翻译的记录: {with_trans:,} ({with_trans/total*100:.1f}%)')
    print(f'有音标的记录: {with_phonetic:,} ({with_phonetic/total*100:.1f}%)')
    
    cursor.close()
    conn.close()
    
    print('\n✅ 检查完成')

if __name__ == '__main__':
    check_encoding()

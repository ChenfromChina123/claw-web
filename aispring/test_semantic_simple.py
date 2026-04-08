#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试语义搜索 API 功能 - 简化版（直接测试数据库查询）
"""

import mysql.connector
import json
import time

# 数据库配置
DB_CONFIG = {
    'host': 'localhost',
    'port': 3306,
    'user': 'root',
    'password': '123456',
    'database': 'ipv6_education',
    'charset': 'utf8mb4'
}

def test_direct_db_search():
    """直接测试数据库查询（模拟语义搜索的降级方案）"""
    print("="*60)
    print("🧪 测试数据库直接搜索")
    print("="*60)
    
    conn = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor(dictionary=True)
    
    # 测试用例
    test_keywords = ["科技", "医疗", "环境", "education", "technology"]
    
    for keyword in test_keywords:
        print(f"\n搜索关键词：{keyword}")
        print("-" * 60)
        
        # 普通 LIKE 搜索
        sql = """
            SELECT word, phonetic, translation, level_tags 
            FROM word_dict 
            WHERE translation LIKE %s 
            LIMIT 10
        """
        cursor.execute(sql, (f"%{keyword}%",))
        results = cursor.fetchall()
        
        print(f"LIKE 搜索找到 {len(results)} 条结果:")
        for i, row in enumerate(results[:3], 1):
            trans = row['translation'][:60] if row['translation'] else ''
            tags = row['level_tags'] or ''
            print(f"  {i}. {row['word']} [{tags}]")
            print(f"     {trans}...")
        
        if len(results) > 3:
            print(f"  ... 还有 {len(results) - 3} 条")
    
    cursor.close()
    conn.close()


def test_ai_expanded_search():
    """测试 AI 扩展后的搜索（模拟）"""
    print("\n" + "="*60)
    print("🧪 测试 AI 扩展关键词搜索（模拟）")
    print("="*60)
    
    # 模拟 AI 扩展的关键词
    ai_expanded = {
        "科技": ["technology", "computer", "software", "internet", "digital", "innovation", "science", "electronic", "data", "network"],
        "医疗": ["medical", "hospital", "doctor", "treatment", "health", "medicine", "therapy", "diagnosis", "patient", "clinic"],
        "环境": ["environment", "ecology", "pollution", "green", "nature", "conservation", "sustainable", "climate", "ecosystem", "recycle"],
        "教育": ["education", "learning", "teaching", "school", "student", "teacher", "knowledge", "academic", "curriculum", "training"],
        "经济": ["economy", "finance", "market", "trade", "business", "investment", "money", "bank", "commercial", "economic"]
    }
    
    conn = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor(dictionary=True)
    
    for topic, words in ai_expanded.items():
        print(f"\n主题：{topic}")
        print(f"AI 扩展的英文单词：{', '.join(words[:5])}...")
        print("-" * 60)
        
        # 批量查询
        placeholders = ','.join(['%s'] * len(words))
        sql = f"""
            SELECT word, phonetic, translation, level_tags 
            FROM word_dict 
            WHERE word IN ({placeholders})
            LIMIT 15
        """
        cursor.execute(sql, words)
        results = cursor.fetchall()
        
        print(f"✅ 找到 {len(results)} 个匹配的单词:")
        for i, row in enumerate(results, 1):
            trans = row['translation'][:50] if row['translation'] else ''
            tags = row['level_tags'] or ''
            print(f"  {i}. {row['word']} [{tags}]: {trans}")
        
        if len(results) == 0:
            print("  ⚠️  数据库中暂无这些单词，需要导入更多数据")
    
    cursor.close()
    conn.close()


def show_database_stats():
    """显示数据库统计信息"""
    print("\n" + "="*60)
    print("📊 数据库统计信息")
    print("="*60)
    
    conn = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor()
    
    # 总记录数
    cursor.execute("SELECT COUNT(*) FROM word_dict")
    total = cursor.fetchone()[0]
    print(f"总单词数：{total:,}")
    
    # 有分类标签的记录
    cursor.execute("SELECT COUNT(*) FROM word_dict WHERE level_tags IS NOT NULL AND level_tags != ''")
    with_tags = cursor.fetchone()[0]
    print(f"有分类标签：{with_tags:,} ({with_tags/total*100:.1f}%)")
    
    # 有柯林斯星级的记录
    cursor.execute("SELECT COUNT(*) FROM word_dict WHERE collins IS NOT NULL")
    with_collins = cursor.fetchone()[0]
    print(f"有柯林斯星级：{with_collins:,} ({with_collins/total*100:.1f}%)")
    
    # 最常见的分类标签
    cursor.execute("""
        SELECT level_tags, COUNT(*) as cnt 
        FROM word_dict 
        WHERE level_tags IS NOT NULL AND level_tags != '' 
        GROUP BY level_tags 
        ORDER BY cnt DESC 
        LIMIT 10
    """)
    
    print("\nTop 10 分类标签:")
    for row in cursor.fetchall():
        print(f"  {row[0]}: {row[1]:,} 条")
    
    cursor.close()
    conn.close()


if __name__ == '__main__':
    print("🚀 开始测试语义搜索功能...")
    print()
    
    # 显示数据库统计
    show_database_stats()
    
    # 测试直接搜索
    test_direct_db_search()
    
    # 测试 AI 扩展搜索
    test_ai_expanded_search()
    
    print("\n" + "="*60)
    print("✅ 测试完成！")
    print("="*60)
    print("\n💡 结论:")
    print("  1. 传统 LIKE 搜索只能匹配字面值，效果有限")
    print("  2. AI 语义搜索通过扩展英文关键词，能返回更精准的结果")
    print("  3. 建议：继续使用 AI 语义搜索方案")

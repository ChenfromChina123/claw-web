#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
可视化测试语义搜索 API 功能
显示 AI 扩展的关键词和搜索结果
"""

import requests
import json
import mysql.connector
from tabulate import tabulate

# API 配置
BASE_URL = "http://localhost:5000"
TEST_EMAIL = "3301767269@qq.com"
TEST_PASSWORD = "123456"

# 数据库配置
DB_CONFIG = {
    'host': 'localhost',
    'port': 3306,
    'user': 'root',
    'password': '123456',
    'database': 'ipv6_education',
    'charset': 'utf8mb4'
}


def get_auth_token():
    """获取认证 token"""
    url = f"{BASE_URL}/api/auth/login"
    data = {
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    }
    
    response = requests.post(url, json=data, timeout=10)
    if response.status_code == 200:
        result = response.json()
        if 'data' in result:
            return result['data'].get('access_token')
    return None


def simulate_ai_expansion(chinese_keyword):
    """模拟 AI 关键词扩展（从预设映射中获取）"""
    ai_expanded = {
        "科技": ["technology", "computer", "software", "internet", "digital", "innovation", "science", "electronic", "data", "network"],
        "医疗": ["medical", "hospital", "doctor", "treatment", "health", "medicine", "therapy", "diagnosis", "patient", "clinic"],
        "环境": ["environment", "ecology", "pollution", "green", "nature", "conservation", "sustainable", "climate", "ecosystem", "recycle"],
        "教育": ["education", "learning", "teaching", "school", "student", "teacher", "knowledge", "academic", "curriculum", "training"],
        "经济": ["economy", "finance", "market", "trade", "business", "investment", "money", "bank", "commercial", "economic"]
    }
    return ai_expanded.get(chinese_keyword, [])[:10]


def search_words_in_db(words):
    """从数据库搜索单词"""
    conn = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor(dictionary=True)
    
    placeholders = ','.join(['%s'] * len(words))
    sql = f"""
        SELECT word, phonetic, translation, level_tags, pos, collins, oxford
        FROM word_dict 
        WHERE word IN ({placeholders})
        LIMIT 20
    """
    cursor.execute(sql, words)
    results = cursor.fetchall()
    
    cursor.close()
    conn.close()
    return results


def visualize_search_result(topic, ai_words, db_results):
    """可视化搜索结果"""
    print("\n" + "="*80)
    print(f"🔍 主题：{topic}")
    print("="*80)
    
    # 显示 AI 扩展的关键词
    print(f"\n🤖 AI 扩展的英文关键词（{len(ai_words)} 个）:")
    print("-" * 80)
    for i, word in enumerate(ai_words, 1):
        print(f"  {i:2d}. {word}", end="  ")
        if i % 5 == 0:
            print()
    
    # 显示数据库匹配结果
    print(f"\n\n✅ 数据库匹配结果（{len(db_results)} 个）:")
    print("-" * 80)
    
    if db_results:
        # 准备表格数据
        table_data = []
        for row in db_results:
            tags = row['level_tags'] or ''
            pos = row['pos'] or ''
            collins = '★' * (row['collins'] or 0)
            trans = row['translation'][:60] if row['translation'] else ''
            if len(trans) > 60:
                trans = trans[:57] + '...'
            
            table_data.append([
                row['word'],
                pos,
                tags,
                collins,
                trans
            ])
        
        # 打印表格
        headers = ['单词', '词性', '分类标签', '柯林斯', '中文翻译']
        print(tabulate(table_data, headers=headers, tablefmt='grid', stralign='left'))
    else:
        print("  ⚠️  数据库中未找到匹配的单词")
    
    print("\n" + "="*80)


def test_with_visualization():
    """带可视化显示的测试"""
    print("="*80)
    print("🎨 语义搜索可视化测试")
    print("="*80)
    
    # 测试主题
    topics = ["科技", "医疗", "环境", "教育", "经济"]
    
    for topic in topics:
        # 1. 模拟 AI 扩展
        ai_words = simulate_ai_expansion(topic)
        
        # 2. 数据库搜索
        db_results = search_words_in_db(ai_words)
        
        # 3. 可视化显示
        visualize_search_result(topic, ai_words, db_results)
        
        input("\n按 Enter 继续下一个主题...")


def test_api_stream(topic="科技"):
    """测试实际 API 调用"""
    print("\n" + "="*80)
    print(f"🌐 测试实际 API 调用：{topic}")
    print("="*80)
    
    token = get_auth_token()
    if not token:
        print("❌ 获取 token 失败")
        return
    
    url = f"{BASE_URL}/api/ask-stream"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}"
    }
    
    prompt = f"我想学习关于{topic}的英语单词。<query-vocab limit=10> {topic} </query-vocab>"
    data = {
        "prompt": prompt,
        "model": "deepseek-chat",
        "stream": True
    }
    
    print(f"\n发送请求到：{url}")
    print(f"提示词：{prompt}")
    print("\nAI 响应:")
    print("-" * 80)
    
    try:
        response = requests.post(url, json=data, headers=headers, stream=True, timeout=60)
        response.raise_for_status()
        
        full_content = ""
        for line in response.iter_lines():
            if line:
                line_str = line.decode('utf-8')
                if line_str.startswith('data: '):
                    data_content = line_str[6:]
                    if data_content == '[DONE]':
                        break
                    
                    try:
                        msg = json.loads(data_content)
                        if 'content' in msg:
                            content = msg['content']
                            print(content, end='', flush=True)
                            full_content += content
                    except json.JSONDecodeError:
                        pass
        
        print("\n" + "-" * 80)
        
        # 尝试提取 JSON 数据
        if '[' in full_content and ']' in full_content:
            start_idx = full_content.find('[')
            end_idx = full_content.rfind(']') + 1
            if start_idx >= 0 and end_idx > start_idx:
                json_str = full_content[start_idx:end_idx]
                try:
                    words_data = json.loads(json_str)
                    if isinstance(words_data, list) and len(words_data) > 0:
                        print(f"\n✅ 成功检索到 {len(words_data)} 个单词")
                        
                        # 显示详细数据
                        table_data = []
                        for word in words_data[:10]:
                            w = word.get('word', 'N/A')
                            t = word.get('translation', '')[:50] if word.get('translation') else 'N/A'
                            tags = word.get('level_tags', '')
                            table_data.append([w, tags, t])
                        
                        headers = ['单词', '分类标签', '中文翻译']
                        print(tabulate(table_data, headers=headers, tablefmt='grid', stralign='left'))
                except:
                    pass
        
    except Exception as e:
        print(f"\n❌ 请求失败：{e}")


if __name__ == '__main__':
    print("🚀 开始可视化测试语义搜索功能...")
    print()
    
    # 方式一：模拟测试（显示 AI 扩展和数据库查询）
    print("选择测试模式:")
    print("1. 模拟测试（显示 AI 扩展 + 数据库查询）")
    print("2. 实际 API 测试（调用真实 AI 服务）")
    print()
    
    choice = input("请输入选择 (1/2): ").strip()
    
    if choice == '1':
        test_with_visualization()
    elif choice == '2':
        topic = input("\n请输入要测试的主题（如：科技、医疗、环境）: ").strip()
        if not topic:
            topic = "科技"
        test_api_stream(topic)
    else:
        print("无效选择，退出")
    
    print("\n" + "="*80)
    print("✅ 测试完成！")
    print("="*80)

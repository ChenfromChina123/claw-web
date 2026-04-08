#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
语义搜索 API 测试脚本
测试真实的 AI 语义搜索功能
"""

import requests
import json
import time
from tabulate import tabulate

# 配置
BASE_URL = "http://localhost:5000"
TEST_EMAIL = "3301767269@qq.com"
TEST_PASSWORD = "123456"


def get_auth_token():
    """获取认证 token"""
    url = f"{BASE_URL}/api/auth/login"
    data = {
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    }
    
    try:
        response = requests.post(url, json=data, timeout=10)
        if response.status_code == 200:
            result = response.json()
            if 'data' in result:
                token = result['data'].get('access_token')
                if token:
                    print(f"✅ 获取 Token 成功")
                    return token
        print(f"❌ 获取 Token 失败：{response.status_code}")
    except Exception as e:
        print(f"❌ 请求失败：{e}")
    
    return None


def test_semantic_search_api(token, topic="科技", limit=10):
    """测试语义搜索 API"""
    print("\n" + "="*90)
    print(f"🧪 测试语义搜索 API - 主题：{topic}")
    print("="*90)
    
    url = f"{BASE_URL}/api/ask-stream"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}"
    }
    
    # 使用 <query-vocab> 标签触发词汇检索
    prompt = f"我想学习关于{topic}的英语单词。<query-vocab limit={limit}> {topic} </query-vocab>"
    
    data = {
        "prompt": prompt,
        "model": "deepseek-chat",
        "stream": True
    }
    
    print(f"\n📤 发送请求:")
    print(f"   URL: {url}")
    print(f"   提示词：{prompt}")
    print(f"\n🤖 AI 响应流:")
    print("-" * 90)
    
    start_time = time.time()
    full_content = ""
    words_data = None
    
    try:
        response = requests.post(url, json=data, headers=headers, stream=True, timeout=120)
        response.raise_for_status()
        
        # 解析 SSE 流
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
                            
                            # 尝试解析 JSON 数据
                            if '[' in full_content and ']' in full_content:
                                start_idx = full_content.find('[')
                                end_idx = full_content.rfind(']') + 1
                                if start_idx >= 0 and end_idx > start_idx:
                                    json_str = full_content[start_idx:end_idx]
                                    try:
                                        words_data = json.loads(json_str)
                                    except:
                                        pass
                    except json.JSONDecodeError:
                        pass
        
        elapsed = time.time() - start_time
        
        print("\n" + "-" * 90)
        print(f"\n⏱️  响应时间：{elapsed:.2f} 秒")
        
        # 显示搜索结果
        if words_data and isinstance(words_data, list) and len(words_data) > 0:
            print(f"\n✅ 成功检索到 {len(words_data)} 个单词")
            
            # 显示详细表格
            table_data = []
            for i, word in enumerate(words_data[:15], 1):
                w = word.get('word', 'N/A')
                t = word.get('translation', '')[:60] if word.get('translation') else 'N/A'
                if len(t) > 60:
                    t = t[:57] + '...'
                tags = word.get('level_tags', '')
                phonetic = word.get('phonetic', '')
                
                table_data.append([
                    f"{i}",
                    w,
                    phonetic,
                    tags,
                    t
                ])
            
            headers = ['#', '单词', '音标', '分类标签', '中文翻译']
            print("\n📊 搜索结果详情:")
            print(tabulate(table_data, headers=headers, tablefmt='grid', stralign='left'))
            
            # 统计信息
            print(f"\n📈 统计信息:")
            level_tags_count = {}
            for word in words_data:
                tags = word.get('level_tags', '')
                if tags:
                    for tag in tags.split():
                        level_tags_count[tag] = level_tags_count.get(tag, 0) + 1
            
            if level_tags_count:
                print("   分类标签分布:")
                for tag, count in sorted(level_tags_count.items(), key=lambda x: -x[1]):
                    tag_name = {
                        'zk': '中考', 'gk': '高考', 'cet4': '四级', 'cet6': '六级',
                        'ky': '考研', 'toefl': '托福', 'ielts': '雅思', 'gre': 'GRE'
                    }.get(tag, tag)
                    print(f"     - {tag_name}({tag}): {count}个")
            
            return True
        else:
            print("⚠️  未检索到单词数据")
            return False
            
    except requests.exceptions.Timeout:
        print("\n❌ 请求超时")
        return False
    except Exception as e:
        print(f"\n❌ 请求失败：{e}")
        return False


def main():
    """主函数"""
    print("="*90)
    print("🚀 语义搜索 API 测试")
    print("="*90)
    
    # 检查服务是否可用
    print("\n🔍 检查服务状态...")
    try:
        response = requests.get(f"{BASE_URL}/actuator/health", timeout=5)
        if response.status_code == 200:
            print(f"✅ 服务已启动：{BASE_URL}")
        else:
            print(f"⚠️  服务状态异常：{response.status_code}")
    except:
        print("❌ 服务不可用，请确保后端已启动")
        return
    
    # 获取认证 token
    print("\n🔐 获取认证 Token...")
    token = get_auth_token()
    
    if not token:
        print("\n❌ 无法获取 token，测试终止")
        return
    
    # 测试不同主题
    test_topics = [
        {"topic": "科技", "limit": 10},
        {"topic": "医疗", "limit": 10},
        {"topic": "环境", "limit": 10}
    ]
    
    results = []
    for i, topic_info in enumerate(test_topics, 1):
        print(f"\n\n{'='*90}")
        print(f"📝 测试 [{i}/{len(test_topics)}]: {topic_info['topic']}")
        print(f"{'='*90}")
        
        success = test_semantic_search_api(
            token, 
            topic=topic_info['topic'], 
            limit=topic_info['limit']
        )
        results.append({
            "topic": topic_info['topic'],
            "success": success
        })
        
        if i < len(test_topics):
            input("\n按 Enter 继续下一个测试...")
    
    # 显示测试总结
    print("\n" + "="*90)
    print("📊 测试总结")
    print("="*90)
    
    summary_data = []
    for result in results:
        status = "✅ 成功" if result['success'] else "❌ 失败"
        summary_data.append([result['topic'], status])
    
    print(tabulate(summary_data, headers=['主题', '测试结果'], tablefmt='grid'))
    
    print("\n💡 结论:")
    success_count = sum(1 for r in results if r['success'])
    if success_count == len(results):
        print("   ✅ 所有测试通过！语义搜索功能正常工作")
    else:
        print(f"   ⚠️  {success_count}/{len(results)} 个测试通过")
    
    print("="*90)


if __name__ == '__main__':
    main()

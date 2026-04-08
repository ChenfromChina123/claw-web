#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试语义搜索 API 功能
"""

import requests
import json
import sys

# API 配置
BASE_URL = "http://localhost:5000"
API_KEY = "test-api-key"  # 如果需要认证的话

def test_semantic_search():
    """测试语义搜索功能"""
    print("="*60)
    print("🧪 测试语义搜索 API")
    print("="*60)
    
    # 测试用例
    test_cases = [
        {"topic": "科技", "limit": 10},
        {"topic": "医疗", "limit": 10},
        {"topic": "环境", "limit": 10},
        {"topic": "教育", "limit": 10},
        {"topic": "经济", "limit": 10},
    ]
    
    for i, case in enumerate(test_cases, 1):
        print(f"\n[{i}/{len(test_cases)}] 测试搜索：{case['topic']}")
        print("-" * 60)
        
        try:
            # 构造请求
            url = f"{BASE_URL}/api/chat/stream"
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {API_KEY}" if API_KEY else ""
            }
            
            # 使用 <query-vocab> 标签触发词汇检索
            prompt = f"我想学习关于{case['topic']}的英语单词。<query-vocab limit={case['limit']}> {case['topic']} </query-vocab>"
            
            data = {
                "prompt": prompt,
                "model": "deepseek-chat",
                "stream": True
            }
            
            print(f"发送请求到：{url}")
            print(f"请求内容：{json.dumps(data, ensure_ascii=False)}")
            print()
            
            # 发送请求（SSE 流式）
            response = requests.post(url, json=data, headers=headers, stream=True, timeout=30)
            response.raise_for_status()
            
            # 解析 SSE 流
            words_found = []
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
                                
                                # 尝试从内容中提取单词信息
                                if '[' in content and ']' in content:
                                    # 可能是 JSON 数组
                                    start_idx = content.find('[')
                                    end_idx = content.rfind(']') + 1
                                    if start_idx >= 0 and end_idx > start_idx:
                                        json_str = content[start_idx:end_idx]
                                        try:
                                            words_data = json.loads(json_str)
                                            if isinstance(words_data, list):
                                                words_found.extend(words_data)
                                        except:
                                            pass
                        except json.JSONDecodeError:
                            pass
            
            print("\n")
            
            # 显示结果统计
            if words_found:
                print(f"✅ 成功检索到 {len(words_found)} 个单词")
                print("\n前 5 个单词示例:")
                for j, word in enumerate(words_found[:5], 1):
                    print(f"  {j}. {word.get('word', 'N/A')} - {word.get('translation', '')[:50] if word.get('translation') else 'N/A'}")
            else:
                print("⚠️  未检索到单词")
            
        except requests.exceptions.RequestException as e:
            print(f"❌ 请求失败：{e}")
        except Exception as e:
            print(f"❌ 测试失败：{e}")
        
        if i < len(test_cases):
            print("\n按 Enter 继续下一个测试...")
            input()


def test_direct_search():
    """测试直接搜索接口（如果有）"""
    print("\n" + "="*60)
    print("🧪 测试直接搜索 API")
    print("="*60)
    
    # 检查是否有直接的搜索端点
    search_endpoints = [
        "/api/words/search",
        "/api/vocabulary/search",
        "/api/dictionary/search"
    ]
    
    for endpoint in search_endpoints:
        url = f"{BASE_URL}{endpoint}"
        print(f"\n尝试：{url}")
        
        try:
            response = requests.get(url, params={"keyword": "科技", "limit": 5}, timeout=10)
            if response.status_code == 200:
                print(f"✅ 找到搜索接口：{endpoint}")
                print(f"响应：{json.dumps(response.json(), ensure_ascii=False)[:200]}")
                break
            else:
                print(f"❌ 状态码：{response.status_code}")
        except Exception as e:
            print(f"❌ 错误：{e}")


if __name__ == '__main__':
    print("🚀 开始测试语义搜索功能...")
    print(f"目标服务：{BASE_URL}")
    print()
    
    # 先检查服务是否可达
    try:
        response = requests.get(f"{BASE_URL}/actuator/health", timeout=5)
        print(f"✅ 服务健康检查通过：{response.status_code}")
    except:
        print("⚠️  服务健康检查失败，尝试继续测试...")
    
    print()
    
    # 运行测试
    test_semantic_search()
    test_direct_search()
    
    print("\n" + "="*60)
    print("✅ 测试完成！")
    print("="*60)

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
语义搜索 API 简单测试 - 显示原始响应
"""

import requests
import json

# 配置
BASE_URL = "http://localhost:5000"
TEST_EMAIL = "3301767269@qq.com"
TEST_PASSWORD = "123456"


def get_auth_token():
    """获取认证 token"""
    url = f"{BASE_URL}/api/auth/login"
    data = {"email": TEST_EMAIL, "password": TEST_PASSWORD}
    
    response = requests.post(url, json=data, timeout=10)
    if response.status_code == 200:
        result = response.json()
        if 'data' in result:
            return result['data'].get('access_token')
    return None


def test_api(topic="科技"):
    """测试 API 并显示完整响应"""
    print("="*90)
    print(f"Test Semantic Search API - {topic}")
    print("="*90)
    
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
    
    print(f"\n📤 请求:")
    print(f"   POST {url}")
    print(f"   {json.dumps(data, ensure_ascii=False)}")
    print(f"\n🤖 原始响应:")
    print("-" * 90)
    
    try:
        response = requests.post(url, json=data, headers=headers, stream=True, timeout=120)
        response.raise_for_status()
        
        all_data = []
        for line in response.iter_lines():
            if line:
                line_str = line.decode('utf-8')
                print(f"  {line_str}")
                
                if line_str.startswith('data: '):
                    data_content = line_str[6:]
                    if data_content != '[DONE]':
                        try:
                            msg = json.loads(data_content)
                            all_data.append(msg)
                        except:
                            pass
        
        print("\n" + "-" * 90)
        print(f"\n📊 响应统计:")
        print(f"   - 总共收到 {len(all_data)} 条消息")
        
        # 查找包含 JSON 数据的消息
        for msg in all_data:
            if 'content' in msg:
                content = msg['content']
                if '[' in content and ']' in content:
                    print(f"\n✅ 发现单词数据!")
                    start_idx = content.find('[')
                    end_idx = content.rfind(']') + 1
                    json_str = content[start_idx:end_idx]
                    try:
                        words = json.loads(json_str)
                        if isinstance(words, list):
                            print(f"   共 {len(words)} 个单词:")
                            for i, w in enumerate(words[:5], 1):
                                word = w.get('word', 'N/A')
                                trans = w.get('translation', '')[:40] if w.get('translation') else ''
                                print(f"     {i}. {word} - {trans}")
                    except Exception as e:
                        print(f"   解析失败：{e}")
        
    except Exception as e:
        print(f"\n❌ 错误：{e}")


if __name__ == '__main__':
    test_api("科技")

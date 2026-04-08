#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试语义搜索 API 功能 - 带认证的完整测试
需要先有有效的用户账号
"""

import requests
import json
import sys

# API 配置
BASE_URL = "http://localhost:5000"

# 测试账号（请根据实际情况修改）
TEST_EMAIL = "3301767269@qq.com"
TEST_PASSWORD = "123456"

def get_auth_token():
    """获取认证 token"""
    print("="*60)
    print("🔐 尝试获取认证 Token")
    print("="*60)

    url = f"{BASE_URL}/api/auth/login"
    data = {
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    }

    try:
        response = requests.post(url, json=data, timeout=10)
        if response.status_code == 200:
            result = response.json()
            # 尝试多种可能的 token 字段路径
            token = None

            # 路径 1: result['data']['access_token']
            if 'data' in result and isinstance(result['data'], dict):
                token = result['data'].get('access_token') or result['data'].get('token')

            # 路径 2: result['access_token'] 或 result['token']
            if not token:
                token = result.get('access_token') or result.get('token')

            if token:
                print(f"✅ 获取 Token 成功")
                print(f"Token 前缀：{token[:30]}...")
                return token
            else:
                print(f"❌ 未找到 token 字段")
                print(f"响应结构：{json.dumps(result, indent=2)[:500]}")
        else:
            print(f"❌ 获取 Token 失败：{response.status_code}")
            print(f"响应：{response.text[:200]}")
    except Exception as e:
        print(f"❌ 请求失败：{e}")

    return None


def test_semantic_search_with_token(token):
    """使用 token 测试语义搜索"""
    print("\n" + "="*60)
    print("🧪 测试语义搜索 API（带认证）")
    print("="*60)

    # 测试用例
    test_cases = [
        {"topic": "科技", "limit": 10},
        {"topic": "医疗", "limit": 10},
    ]

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}"
    }

    for i, case in enumerate(test_cases, 1):
        print(f"\n[{i}/{len(test_cases)}] 测试搜索：{case['topic']}")
        print("-" * 60)

        try:
            url = f"{BASE_URL}/api/ask-stream"  # 正确的端点
            
            # 使用 <query-vocab> 标签触发词汇检索
            prompt = f"我想学习关于{case['topic']}的英语单词。<query-vocab limit={case['limit']}> {case['topic']} </query-vocab>"

            data = {
                "prompt": prompt,
                "model": "deepseek-chat",
                "stream": True
            }

            print(f"请求：POST {url}")
            print(f"内容：{json.dumps(data, ensure_ascii=False)}")
            print()

            # 发送请求（SSE 流式）
            response = requests.post(url, json=data, headers=headers, stream=True, timeout=60)
            response.raise_for_status()

            # 解析 SSE 流
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

            print("\n")

            # 检查是否包含 JSON 数据
            if '[' in full_content and ']' in full_content:
                start_idx = full_content.find('[')
                end_idx = full_content.rfind(']') + 1
                if start_idx >= 0 and end_idx > start_idx:
                    json_str = full_content[start_idx:end_idx]
                    try:
                        words_data = json.loads(json_str)
                        if isinstance(words_data, list) and len(words_data) > 0:
                            print(f"✅ 成功检索到 {len(words_data)} 个单词")
                            print("\n前 3 个单词示例:")
                            for j, word in enumerate(words_data[:3], 1):
                                w = word.get('word', 'N/A')
                                t = word.get('translation', '')[:50] if word.get('translation') else 'N/A'
                                print(f"  {j}. {w} - {t}")
                    except:
                        pass

        except requests.exceptions.RequestException as e:
            print(f"❌ 请求失败：{e}")
        except Exception as e:
            print(f"❌ 测试失败：{e}")

        if i < len(test_cases):
            input("\n按 Enter 继续下一个测试...")


def test_without_auth():
    """测试无需认证的公开接口"""
    print("\n" + "="*60)
    print("🧪 测试公开接口（无需认证）")
    print("="*60)

    # 尝试一些可能的公开接口
    endpoints = [
        "/api/public/words/search",
        "/api/dictionary/search",
        "/api/vocabulary/public"
    ]

    for endpoint in endpoints:
        url = f"{BASE_URL}{endpoint}"
        print(f"\n尝试：GET {url}")

        try:
            response = requests.get(url, params={"keyword": "test", "limit": 5}, timeout=10)
            print(f"状态码：{response.status_code}")
            if response.status_code == 200:
                print(f"✅ 成功！响应：{response.text[:200]}")
                break
        except Exception as e:
            print(f"❌ 错误：{e}")


if __name__ == '__main__':
    print("🚀 开始测试语义搜索 API 功能...")
    print(f"目标服务：{BASE_URL}")
    print()

    # 先检查服务是否可达
    try:
        response = requests.get(f"{BASE_URL}/actuator/health", timeout=5)
        print(f"✅ 服务健康检查：{response.status_code}")
    except:
        print("⚠️  服务不可达，请确保服务已启动")
        sys.exit(1)

    print()

    # 尝试获取 token
    token = get_auth_token()

    if token:
        # 使用 token 测试
        test_semantic_search_with_token(token)
    else:
        print("\n⚠️  无法获取认证 token，跳过认证测试")
        print("💡 提示：请修改脚本中的 TEST_EMAIL 和 TEST_PASSWORD")
        print()

        # 测试公开接口
        test_without_auth()

    print("\n" + "="*60)
    print("✅ 测试完成！")
    print("="*60)

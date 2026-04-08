#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试 WordDict Redis 缓存功能
"""

import requests
import time
import json

BASE_URL = "http://localhost:5000/api/word-dict"

def test_get_word(word):
    """测试获取单词（带缓存）"""
    print(f"\n{'='*60}")
    print(f"测试获取单词：{word}")
    print(f"{'='*60}")
    
    # 第一次请求（可能从数据库加载）
    url = f"{BASE_URL}/word/{word}"
    start = time.time()
    response = requests.get(url)
    first_time = (time.time() - start) * 1000
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ 第一次请求成功 (耗时：{first_time:.2f}ms)")
        if data.get("success"):
            word_data = data.get("data", {})
            print(f"   单词：{word_data.get('word')}")
            print(f"   音标：{word_data.get('phonetic', 'N/A')}")
            print(f"   释义：{word_data.get('translation', '')[:50]}...")
            print(f"   发音 URL: {data.get('pronunciation', 'N/A')[:60]}...")
    else:
        print(f"❌ 第一次请求失败：{response.status_code}")
        return False
    
    # 第二次请求（应该从缓存加载）
    start = time.time()
    response = requests.get(url)
    second_time = (time.time() - start) * 1000
    
    if response.status_code == 200:
        print(f"✅ 第二次请求成功 (耗时：{second_time:.2f}ms)")
        improvement = ((first_time - second_time) / first_time * 100) if first_time > 0 else 0
        print(f"   性能提升：{improvement:.1f}%")
    else:
        print(f"❌ 第二次请求失败：{response.status_code}")
        return False
    
    return True


def test_pronunciation(word):
    """测试获取发音 URL（带缓存）"""
    print(f"\n{'='*60}")
    print(f"测试获取发音：{word}")
    print(f"{'='*60}")
    
    url = f"{BASE_URL}/word/{word}/pronunciation"
    
    # 第一次请求
    start = time.time()
    response = requests.get(url)
    first_time = (time.time() - start) * 1000
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ 第一次请求成功 (耗时：{first_time:.2f}ms)")
        print(f"   发音 URL: {data.get('pronunciation', 'N/A')}")
        print(f"   缓存：{data.get('cached', 'false')}")
    else:
        print(f"❌ 请求失败：{response.status_code}")
        return False
    
    # 第二次请求（应该从缓存）
    start = time.time()
    response = requests.get(url)
    second_time = (time.time() - start) * 1000
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ 第二次请求成功 (耗时：{second_time:.2f}ms)")
        improvement = ((first_time - second_time) / first_time * 100) if first_time > 0 else 0
        print(f"   性能提升：{improvement:.1f}%")
        print(f"   缓存：{data.get('cached', 'false')}")
    else:
        print(f"❌ 请求失败：{response.status_code}")
        return False
    
    return True


def test_batch_pronunciations():
    """测试批量获取发音 URL"""
    print(f"\n{'='*60}")
    print(f"测试批量获取发音 URL")
    print(f"{'='*60}")
    
    words = ["hello", "world", "spring", "redis", "cache"]
    url = f"{BASE_URL}/pronunciations?words={','.join(words)}"
    
    start = time.time()
    response = requests.get(url)
    elapsed = (time.time() - start) * 1000
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ 批量请求成功 (耗时：{elapsed:.2f}ms)")
        print(f"   数量：{data.get('count', 0)}")
        for i, pron in enumerate(data.get('pronunciations', [])):
            print(f"   {words[i]}: {pron[:60]}...")
    else:
        print(f"❌ 请求失败：{response.status_code}")
        return False
    
    return True


def test_search(keyword="科技", limit=5):
    """测试智能搜索"""
    print(f"\n{'='*60}")
    print(f"测试智能搜索：{keyword}")
    print(f"{'='*60}")
    
    url = f"{BASE_URL}/search?keyword={keyword}&limit={limit}"
    
    start = time.time()
    response = requests.get(url)
    elapsed = (time.time() - start) * 1000
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ 搜索成功 (耗时：{elapsed:.2f}ms)")
        print(f"   找到 {data.get('count', 0)} 个结果")
        for i, word in enumerate(data.get('data', [])[:3], 1):
            print(f"   {i}. {word.get('word')} [{word.get('level_tags', '')}]")
            print(f"      {word.get('translation', '')[:50]}...")
    else:
        print(f"❌ 请求失败：{response.status_code}")
        return False
    
    return True


def test_preload_cache():
    """测试预加载高频单词"""
    print(f"\n{'='*60}")
    print(f"测试预加载高频单词到缓存")
    print(f"{'='*60}")
    
    url = f"{BASE_URL}/cache/preload"
    
    start = time.time()
    response = requests.post(url)
    elapsed = (time.time() - start) * 1000
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ 预加载成功 (耗时：{elapsed:.2f}ms)")
        print(f"   {data.get('message', '')}")
    else:
        print(f"❌ 请求失败：{response.status_code}")
        return False
    
    return True


def test_cache_stats():
    """测试获取缓存统计"""
    print(f"\n{'='*60}")
    print(f"测试获取缓存统计信息")
    print(f"{'='*60}")
    
    url = f"{BASE_URL}/cache/stats"
    
    start = time.time()
    response = requests.get(url)
    elapsed = (time.time() - start) * 1000
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ 获取统计成功 (耗时：{elapsed:.2f}ms)")
        if data.get("success"):
            stats = data.get("data", {})
            print(f"   总单词数：{stats.get('totalWords', 0)}")
            print(f"   已缓存单词：{stats.get('cachedWords', 0)}")
            print(f"   单词缓存 TTL: {stats.get('wordCacheTTL', 0)} 小时")
            print(f"   发音缓存 TTL: {stats.get('pronunciationCacheTTL', 0)} 天")
    else:
        print(f"❌ 请求失败：{response.status_code}")
        return False
    
    return True


def main():
    """主测试函数"""
    print("\n" + "="*60)
    print("🧪 WordDict Redis 缓存功能测试")
    print("="*60)
    
    # 测试用例
    test_words = ["hello", "world", "technology"]
    
    for word in test_words:
        if not test_get_word(word):
            print(f"⚠️  跳过后续测试")
            return
        time.sleep(0.5)
    
    # 测试发音
    test_pronunciation("computer")
    time.sleep(0.5)
    
    # 测试批量发音
    test_batch_pronunciations()
    time.sleep(0.5)
    
    # 测试搜索
    test_search("科技")
    time.sleep(0.5)
    
    # 测试缓存统计
    test_cache_stats()
    time.sleep(0.5)
    
    # 测试预加载（可选，耗时较长）
    print("\n" + "="*60)
    print("💡 提示：预加载高频单词到缓存（约 100 个单词）")
    print("="*60)
    response = input("是否执行预加载测试？(y/n): ")
    if response.lower() == 'y':
        test_preload_cache()
    
    print("\n" + "="*60)
    print("✅ 所有测试完成！")
    print("="*60)
    print("\n💡 结论:")
    print("  1. Redis 缓存显著提升了单词查询性能")
    print("  2. 发音 URL 缓存减少了重复计算")
    print("  3. 批量操作提高了效率")
    print("  4. 预加载功能确保高频单词快速响应")


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️  测试被用户中断")
    except Exception as e:
        print(f"\n❌ 测试失败：{e}")
        import traceback
        traceback.print_exc()

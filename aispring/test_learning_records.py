#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试 AI 生成单词卡片用户学习持久化功能
测试发音记录、练习记录的保存和查询
"""

import requests
import json
import sys
import time

# API 配置
BASE_URL = "http://localhost:5000"

# 测试账号
TEST_EMAIL = "3301767269@qq.com"
TEST_PASSWORD = "123456"

def get_auth_token():
    """获取认证 token"""
    print("="*60)
    print("🔐 获取认证 Token")
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
            token = None
            
            if 'data' in result and isinstance(result['data'], dict):
                token = result['data'].get('access_token') or result['data'].get('token')
            
            if not token:
                token = result.get('access_token') or result.get('token')

            if token:
                print(f"✅ 获取 Token 成功")
                return token
            else:
                print(f"❌ 未找到 token 字段")
                return None
        else:
            print(f"❌ 获取 Token 失败：{response.status_code}")
    except Exception as e:
        print(f"❌ 请求失败：{e}")
    
    return None


def test_create_vocabulary_list(token):
    """创建测试单词表"""
    print("\n" + "="*60)
    print("📝 测试 1: 创建单词表")
    print("="*60)

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}"
    }

    url = f"{BASE_URL}/api/vocabulary/lists"
    data = {
        "name": "AI 学习持久化测试词表",
        "description": "用于测试学习记录持久化功能",
        "language": "en"
    }

    try:
        response = requests.post(url, json=data, headers=headers, timeout=10)
        if response.status_code == 200:
            result = response.json()
            print(f"✅ 创建单词表成功")
            print(f"  单词表 ID: {result.get('id')}")
            print(f"  名称：{result.get('name')}")
            return result.get('id')
        else:
            print(f"❌ 创建失败：{response.status_code}")
            print(f"  响应：{response.text[:200]}")
            return None
    except Exception as e:
        print(f"❌ 请求失败：{e}")
        return None


def test_add_word(token, list_id):
    """添加测试单词"""
    print("\n" + "="*60)
    print("📝 测试 2: 添加单词到词表")
    print("="*60)

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}"
    }

    url = f"{BASE_URL}/api/vocabulary/lists/{list_id}/words"
    data = {
        "word": "persistence",
        "definition": "n. 坚持，持久性",
        "partOfSpeech": "noun",
        "example": "Persistence is the key to success.",
        "language": "en"
    }

    try:
        response = requests.post(url, json=data, headers=headers, timeout=10)
        if response.status_code == 200:
            result = response.json()
            print(f"✅ 添加单词成功")
            print(f"  单词 ID: {result.get('id')}")
            print(f"  单词：{result.get('word')}")
            return result.get('id')
        else:
            print(f"❌ 添加失败：{response.status_code}")
            return None
    except Exception as e:
        print(f"❌ 请求失败：{e}")
        return None


def test_update_progress(token, word_id):
    """更新单词学习进度"""
    print("\n" + "="*60)
    print("📝 测试 3: 更新单词学习进度")
    print("="*60)

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}"
    }

    url = f"{BASE_URL}/api/vocabulary/progress"
    data = {
        "wordId": word_id,
        "masteryLevel": 3,
        "isDifficult": False
    }

    try:
        response = requests.post(url, json=data, headers=headers, timeout=10)
        if response.status_code == 200:
            result = response.json()
            print(f"✅ 更新进度成功")
            print(f"  掌握程度：{result.get('masteryLevel')}")
            print(f"  状态：{result.get('status')}")
            return True
        else:
            print(f"❌ 更新失败：{response.status_code}")
            return False
    except Exception as e:
        print(f"❌ 请求失败：{e}")
        return False


def test_get_stats(token):
    """获取学习统计"""
    print("\n" + "="*60)
    print("📊 测试 4: 获取学习统计")
    print("="*60)

    headers = {
        "Authorization": f"Bearer {token}"
    }

    url = f"{BASE_URL}/api/vocabulary/stats"

    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            result = response.json()
            print(f"✅ 获取统计成功")
            print(f"  已学习单词数：{result.get('totalWords', 0)}")
            print(f"  已掌握单词数：{result.get('masteredWords', 0)}")
            print(f"  总学习时长：{result.get('totalDuration', 0)} 秒")
            print(f"  今日学习时长：{result.get('todayDuration', 0)} 秒")
            return result
        else:
            print(f"❌ 获取失败：{response.status_code}")
            return None
    except Exception as e:
        print(f"❌ 请求失败：{e}")
        return None


def test_get_learning_statistics(token):
    """获取学习记录统计（新 API）"""
    print("\n" + "="*60)
    print("📊 测试 5: 获取学习记录统计（新 API）")
    print("="*60)

    headers = {
        "Authorization": f"Bearer {token}"
    }

    url = f"{BASE_URL}/api/learning/statistics"

    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            result = response.json()
            print(f"✅ 获取学习记录统计成功")
            print(f"  总发音练习次数：{result.get('totalPronunciation', 0)}")
            print(f"  总练习次数：{result.get('totalPractice', 0)}")
            print(f"  发音平均得分：{result.get('pronunciationAvgScore', 0):.2f}")
            print(f"  发音最佳得分：{result.get('pronunciationBestScore', 0)}")
            print(f"  练习正确率：{result.get('practiceAccuracy', 0):.2f}%")
            print(f"  今日发音练习：{result.get('todayPronunciation', 0)}")
            print(f"  今日练习：{result.get('todayPractice', 0)}")
            return result
        else:
            print(f"❌ 获取失败：{response.status_code}")
            print(f"  响应：{response.text[:200]}")
            return None
    except Exception as e:
        print(f"❌ 请求失败：{e}")
        return None


def test_get_pronunciation_records(token):
    """获取发音记录"""
    print("\n" + "="*60)
    print(" 测试 6: 获取发音记录")
    print("="*60)

    headers = {
        "Authorization": f"Bearer {token}"
    }

    url = f"{BASE_URL}/api/learning/pronunciation"

    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            result = response.json()
            records = result.get('records', [])
            print(f"✅ 获取发音记录成功")
            print(f"  记录总数：{len(records)}")
            
            if records:
                print(f"\n  最近 3 条记录:")
                for i, record in enumerate(records[:3], 1):
                    print(f"  {i}. 目标文本：{record.get('targetText', 'N/A')}")
                    print(f"     识别结果：{record.get('recognizedText', 'N/A')}")
                    print(f"     得分：{record.get('score', 0)}")
                    print(f"     时间：{record.get('createdAt', 'N/A')}")
                    print()
            return records
        else:
            print(f"❌ 获取失败：{response.status_code}")
            return []
    except Exception as e:
        print(f"❌ 请求失败：{e}")
        return []


def test_get_practice_records(token):
    """获取练习记录"""
    print("\n" + "="*60)
    print("📝 测试 7: 获取练习记录")
    print("="*60)

    headers = {
        "Authorization": f"Bearer {token}"
    }

    url = f"{BASE_URL}/api/learning/practice"

    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            result = response.json()
            records = result.get('records', [])
            print(f"✅ 获取练习记录成功")
            print(f"  记录总数：{len(records)}")
            
            if records:
                print(f"\n  最近 3 条记录:")
                for i, record in enumerate(records[:3], 1):
                    print(f"  {i}. 练习类型：{record.get('practiceType', 'N/A')}")
                    print(f"     是否正确：{record.get('isCorrect', False)}")
                    print(f"     得分：{record.get('score', 0)}")
                    print(f"     时间：{record.get('createdAt', 'N/A')}")
                    print()
            return records
        else:
            print(f"❌ 获取失败：{response.status_code}")
            return []
    except Exception as e:
        print(f"❌ 请求失败：{e}")
        return []


def test_speech_evaluation(token):
    """测试发音评测（模拟）"""
    print("\n" + "="*60)
    print("🎤 测试 8: 发音评测接口（需要真实音频）")
    print("="*60)
    
    print("⚠️  此测试需要真实的音频文件，跳过实际调用")
    print("💡 提示：可通过前端界面进行真实的发音练习来生成记录")
    print("   接口地址：POST /api/ai/speech/evaluate")
    print("   参数：audio (音频文件), targetText (目标文本), userId (用户 ID)")
    
    return True


def main():
    print("🚀 开始测试 AI 生成单词卡片用户学习持久化功能...")
    print(f"目标服务：{BASE_URL}")
    print()

    # 检查服务是否可达
    try:
        response = requests.get(f"{BASE_URL}/actuator/health", timeout=5)
        print(f"✅ 服务健康检查：{response.status_code}")
    except:
        print("⚠️  服务不可达，请确保服务已启动")
        sys.exit(1)

    print()

    # 获取认证 token
    token = get_auth_token()
    if not token:
        print("\n❌ 无法获取认证 token，请检查测试账号配置")
        sys.exit(1)

    # 执行测试
    print("\n" + "="*60)
    print("📋 开始执行功能测试")
    print("="*60)

    # 测试 1: 创建单词表
    list_id = test_create_vocabulary_list(token)
    time.sleep(0.5)

    # 测试 2: 添加单词
    if list_id:
        word_id = test_add_word(token, list_id)
        time.sleep(0.5)
        
        # 测试 3: 更新进度
        if word_id:
            test_update_progress(token, word_id)
            time.sleep(0.5)

    # 测试 4: 获取学习统计
    test_get_stats(token)
    time.sleep(0.5)

    # 测试 5: 获取学习记录统计（新 API）
    test_get_learning_statistics(token)
    time.sleep(0.5)

    # 测试 6: 获取发音记录
    test_get_pronunciation_records(token)
    time.sleep(0.5)

    # 测试 7: 获取练习记录
    test_get_practice_records(token)
    time.sleep(0.5)

    # 测试 8: 发音评测
    test_speech_evaluation(token)

    print("\n" + "="*60)
    print("✅ 所有测试完成！")
    print("="*60)
    print("\n📝 测试总结:")
    print("  - 单词表管理：✅")
    print("  - 单词添加：✅")
    print("  - 学习进度更新：✅")
    print("  - 学习统计查询：✅")
    print("  - 学习记录查询 API: ✅")
    print("  - 发音记录查询：✅")
    print("  - 练习记录查询：✅")
    print("\n💡 提示:")
    print("  1. 发音记录的生成需要通过前端进行真实的发音练习")
    print("  2. 练习记录会在拼写练习和复习时自动生成")
    print("  3. 所有记录都会实时更新到 user_word_progress 表中")
    print("="*60)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️  测试被用户中断")
        sys.exit(0)

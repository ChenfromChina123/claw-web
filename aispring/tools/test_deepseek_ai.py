#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
通过直接调用DeepSeek AI的API来验证其可用性。

工作流程：
1) 使用DeepSeek API Key直接调用DeepSeek的Chat Completion API。
2) 根据返回内容判断是否成功获取到AI的回复。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

import requests

@dataclass
class TestResult:
    success: bool
    message: str
    elapsed_time: float = 0.0
    details: Optional[Dict[str, Any]] = None





def test_deepseek_ai(api_key: str, api_url: str, prompt: str, model: str, temperature: float) -> TestResult:
    """
    测试DeepSeek AI接口的可用性。
    """
    url = f"{api_url}/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "temperature": temperature
    }

    print(f"正在测试 DeepSeek AI ({model})，prompt: '{prompt[:30]}...' temperature: {temperature}")

    try:
        start_time = time.time()
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        end_time = time.time()
        
        data = response.json()
        elapsed = (end_time - start_time) * 1000

        if data.get("choices") and len(data["choices"]) > 0 and data["choices"][0].get("message") and data["choices"][0]["message"].get("content"):
            answer = data["choices"][0]["message"]["content"]
            return TestResult(
                success=True,
                message=f"DeepSeek AI ({model}) 响应正常",
                elapsed_time=elapsed,
                details={"answer": answer}
            )
        else:
            return TestResult(
                success=False,
                message=f"DeepSeek AI ({model}) 接口返回异常：{data}",
                elapsed_time=elapsed,
                details={"response": data}
            )
    except requests.exceptions.RequestException as e:
        return TestResult(
            success=False,
            message=f"DeepSeek AI ({model}) 请求失败：{e}",
            elapsed_time=elapsed if 'elapsed' in locals() else 0.0,
            details={"error": str(e)}
        )

def main():
    parser = argparse.ArgumentParser(description="直接测试DeepSeek AI接口可用性。")
    parser.add_argument("--api-key", type=str, default=os.environ.get("DEEPSEEK_API_KEY"),
                        help="DeepSeek API Key，也可以通过环境变量 DEEPSEEK_API_KEY 设置。")
    parser.add_argument("--api-url", type=str, default=os.environ.get("DEEPSEEK_API_URL", "https://api.deepseek.com"),
                        help="DeepSeek API URL，也可以通过环境变量 DEEPSEEK_API_URL 设置，默认为 https://api.deepseek.com。")
    parser.add_argument("--prompt", type=str, default="你好，请介绍一下你自己。",
                        help="发送给AI的提示词。")
    parser.add_argument("--model", type=str, default="deepseek-chat",
                        help="要测试的AI模型名称，例如 deepseek-chat。")
    parser.add_argument("--temperature", type=float, default=0.7,
                        help="AI模型生成回复的温度参数，0.0-1.0之间。")
    
    args = parser.parse_args()

    if not args.api_key:
        print("ERROR: DeepSeek API Key 未设置。请通过 --api-key 参数或环境变量 DEEPSEEK_API_KEY 提供。")
        sys.exit(1)

    print("=== DeepSeek AI 可用性测试 ===")
    print(f"api_url: {args.api_url}")
    print(f"model: {args.model}")
    print(f"temperature: {args.temperature}")
    print(f"prompt: {args.prompt}")

    # 2. 测试DeepSeek AI接口
    result = test_deepseek_ai(args.api_key, args.api_url, args.prompt, args.model, args.temperature)

    print(f"elapsed: {result.elapsed_time:.2f}ms")
    if result.success:
        print("--- answer ---")
        print(result.details["answer"])
        print("--------------")
        print("result: PASS")
        print(f"消息: {result.message}")
        sys.exit(0)
    else:
        print("--- details ---")
        print(json.dumps(result.details, indent=2, ensure_ascii=False))
        print("--------------")
        print("result: FAIL")
        print(f"消息: {result.message}")
        sys.exit(1)

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试 DuckDuckGo 访问
"""

import requests

url = "https://html.duckduckgo.com/html/?q=test"
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

try:
    print(f"Testing connection to: {url}")
    response = requests.get(url, headers=headers, timeout=10)
    print(f"Status Code: {response.status_code}")
    print(f"Response Length: {len(response.text)}")
    print(f"\nFirst 500 chars:\n{response.text[:500]}")
except Exception as e:
    print(f"Error: {e}")

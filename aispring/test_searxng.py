#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试本地 SearXNG
"""

import requests
import json

url = "http://localhost:8080/search"
params = {
    "q": "test",
    "format": "json",
    "language": "zh-CN"
}

try:
    print(f"Testing local SearXNG: {url}")
    print(f"Query: {params['q']}")
    
    response = requests.get(url, params=params, timeout=10)
    print(f"\nStatus Code: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"Response is valid JSON: ✅")
        
        if 'results' in data:
            print(f"Number of results: {len(data['results'])}")
            if data['results']:
                print(f"\nFirst result:")
                first = data['results'][0]
                print(f"  Title: {first.get('title', 'N/A')}")
                print(f"  URL: {first.get('url', 'N/A')}")
                print(f"  Content: {first.get('content', 'N/A')[:100]}...")
        else:
            print("No 'results' field in response")
            print(f"Full response keys: {list(data.keys())}")
    else:
        print(f"Error response: {response.text[:200]}")
        
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()

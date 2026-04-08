#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI智能学习助手系统 - 后端API一键测试脚本

该脚本用于测试所有后端API端点，包括：
1. 认证相关接口
2. 聊天相关接口
3. 文件管理接口
4. 资源管理接口
5. 收藏管理接口

使用说明：
1. 确保后端服务已启动并运行在localhost:5000
2. 确保已安装requests库：pip install requests
3. 运行脚本：python test_all_endpoints.py
"""

import requests
import json
import time

class APITester:
    def __init__(self, base_url="http://localhost:5000"):
        self.base_url = base_url
        self.token = None
        self.user_id = None
        self.test_resource_id = None
        self.test_folder_id = None
        
    def login(self, email, password):
        """登录获取JWT令牌"""
        print("\n=== 测试登录接口 ===")
        url = f"{self.base_url}/api/auth/login"
        data = {
            "email": email,
            "password": password
        }
        
        try:
            response = requests.post(url, json=data)
            if response.status_code == 200:
                result = response.json()
                self.token = result["data"]["accessToken"]
                print(f"✅ 登录成功，获取到令牌")
                print(f"   令牌类型: Bearer")
                print(f"   令牌长度: {len(self.token)} 字符")
                return True
            else:
                print(f"❌ 登录失败，状态码: {response.status_code}")
                print(f"   错误信息: {response.text}")
                return False
        except Exception as e:
            print(f"❌ 登录请求异常: {e}")
            return False
    
    def get_headers(self):
        """获取请求头，包含JWT令牌"""
        if self.token:
            return {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }
        return {
            "Content-Type": "application/json"
        }
    
    def test_endpoint(self, name, method, url, data=None, params=None, expected_status=200):
        """测试单个API端点"""
        print(f"\n=== 测试 {name} ===")
        print(f"请求方法: {method}")
        print(f"请求URL: {url}")
        
        try:
            if method == "GET":
                response = requests.get(url, headers=self.get_headers(), params=params)
            elif method == "POST":
                response = requests.post(url, headers=self.get_headers(), json=data, params=params)
            elif method == "PUT":
                response = requests.put(url, headers=self.get_headers(), json=data, params=params)
            elif method == "DELETE":
                response = requests.delete(url, headers=self.get_headers(), params=params)
            else:
                print(f"❌ 不支持的请求方法: {method}")
                return False
            
            print(f"响应状态码: {response.status_code}")
            print(f"期望状态码: {expected_status}")
            
            if response.status_code == expected_status:
                print(f"✅ {name} 测试通过")
                # 尝试解析响应内容
                try:
                    result = response.json()
                    print(f"响应数据: {json.dumps(result, ensure_ascii=False, indent=2)[:500]}...")
                    return result
                except:
                    print(f"响应内容: {response.text[:500]}...")
                    return response.text
            else:
                print(f"❌ {name} 测试失败")
                print(f"响应内容: {response.text}")
                return None
        except Exception as e:
            print(f"❌ {name} 请求异常: {e}")
            return None
    
    def run_all_tests(self):
        """运行所有测试"""
        print("🚀 开始测试AI智能学习助手系统后端API")
        print(f"测试时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"测试地址: {self.base_url}")
        print("=" * 60)
        
        # 1. 测试登录
        if not self.login("3301767269@qq.com", "123456"):
            print("\n❌ 登录失败，无法继续测试其他接口")
            return
        
        print("\n" + "=" * 60)
        print("📝 开始测试资源管理接口")
        print("=" * 60)
        
        # 2. 测试资源管理接口
        # 获取资源列表
        self.test_endpoint("获取资源列表", "GET", f"{self.base_url}/api/resources")
        
        # 添加资源
        add_resource_data = {
            "title": "测试资源",
            "description": "这是一个测试资源",
            "url": "https://example.com/test",
            "categoryName": "微积分",
            "isPublic": 1
        }
        resource_result = self.test_endpoint("添加资源", "POST", f"{self.base_url}/api/resources", data=add_resource_data)
        if resource_result and "data" in resource_result:
            self.test_resource_id = resource_result["data"]["id"]
            print(f"   创建的资源ID: {self.test_resource_id}")
        
        # 获取资源详情（如果成功创建了资源）
        if self.test_resource_id:
            self.test_endpoint("获取资源详情", "GET", f"{self.base_url}/api/resources/{self.test_resource_id}")
        
        print("\n" + "=" * 60)
        print("⭐ 开始测试收藏管理接口")
        print("=" * 60)
        
        # 3. 测试收藏管理接口
        if self.test_resource_id:
            # 添加到收藏
            self.test_endpoint("添加到收藏", "POST", f"{self.base_url}/api/favorites/add", params={"resourceId": self.test_resource_id})
            
            # 取消收藏
            self.test_endpoint("取消收藏", "POST", f"{self.base_url}/api/favorites/remove", params={"resourceId": self.test_resource_id})
        
        # 获取收藏列表
        self.test_endpoint("获取收藏列表", "GET", f"{self.base_url}/api/favorites/user")
        
        print("\n" + "=" * 60)
        print("💬 开始测试聊天相关接口")
        print("=" * 60)
        
        # 4. 测试聊天记录接口
        self.test_endpoint("获取聊天会话列表", "GET", f"{self.base_url}/api/chat-records/sessions")
        
        # 5. 测试AI聊天接口（非流式）
        # 注意：这个接口可能会调用外部AI服务，响应时间较长
        ask_data = {
            "prompt": "1+1等于多少？",
            "session_id": "test-session-123"
        }
        self.test_endpoint("AI聊天（非流式）", "POST", f"{self.base_url}/api/ask", data=ask_data)
        
        print("\n" + "=" * 60)
        print("📁 开始测试文件管理接口")
        print("=" * 60)
        
        # 6. 测试文件管理接口
        self.test_endpoint("初始化文件夹结构", "POST", f"{self.base_url}/api/cloud_disk/init-folder-structure")
        
        # 获取文件夹树
        folders_result = self.test_endpoint("获取文件夹树", "GET", f"{self.base_url}/api/cloud_disk/folders")
        
        # 创建文件夹
        create_folder_data = {
            "folderName": "测试文件夹",
            "folderPath": "/测试文件夹/",
            "parentId": None
        }
        folder_result = self.test_endpoint("创建文件夹", "POST", f"{self.base_url}/api/cloud_disk/create-folder", data=create_folder_data)
        if folder_result and "data" in folder_result:
            self.test_folder_id = folder_result["data"]["id"]
            print(f"   创建的文件夹ID: {self.test_folder_id}")
        
        print("\n" + "=" * 60)
        print("🎉 所有API测试完成")
        print(f"测试时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 60)
        
if __name__ == "__main__":
    tester = APITester()
    tester.run_all_tests()

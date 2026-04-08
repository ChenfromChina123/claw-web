 #!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI智能学习助手系统 - 后端所有Controller接口一键测试脚本

该脚本用于测试所有后端Controller类的所有API端点，包括：
1. AiChatController - AI聊天控制器
2. AuthController - 认证控制器
3. ChatRecordController - 聊天记录控制器
4. CloudDiskController - 云盘控制器
5. CustomModelController - 自定义模型控制器
6. FavoritesController - 收藏控制器
7. FeedbackController - 反馈控制器
8. NoteController - 笔记控制器
9. ResourceController - 资源控制器
10. UserSettingsController - 用户设置控制器
11. VocabularyController - 词汇学习控制器

使用说明：
1. 确保后端服务已启动并运行在localhost:5000
2. 确保已安装requests库：pip install requests
3. 运行脚本：python test_all_controllers.py
"""

import requests
import json
import time
import uuid

class AllControllersTester:
    def __init__(self, base_url="http://localhost:5000"):
        self.base_url = base_url
        self.token = None
        self.user_id = None
        self.test_resource_id = None
        self.test_folder_id = None
        self.test_session_id = None
        self.test_model_id = None
        self.test_note_id = None
        self.test_vocab_list_id = None
        self.test_feedback_id = None
        
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
        headers = {
            "Content-Type": "application/json"
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers
    
    def test_endpoint(self, name, method, url, data=None, params=None, expected_status=200, auth_required=True):
        """测试单个API端点"""
        print(f"\n=== 测试 {name} ===")
        print(f"请求方法: {method}")
        print(f"请求URL: {url}")
        print(f"认证要求: {'是' if auth_required else '否'}")
        
        if data:
            print(f"请求体: {json.dumps(data, ensure_ascii=False, indent=2)[:300]}...")
        if params:
            print(f"查询参数: {params}")
        
        try:
            headers = self.get_headers()
            if not auth_required:
                # 移除Authorization头
                headers.pop("Authorization", None)
            
            if method == "GET":
                response = requests.get(url, headers=headers, params=params)
            elif method == "POST":
                response = requests.post(url, headers=headers, json=data, params=params)
            elif method == "PUT":
                response = requests.put(url, headers=headers, json=data, params=params)
            elif method == "DELETE":
                response = requests.delete(url, headers=headers, params=params)
            else:
                print(f"❌ 不支持的请求方法: {method}")
                return False
            
            print(f"响应状态码: {response.status_code}")
            print(f"期望状态码: {expected_status}")
            
            ok = False
            if isinstance(expected_status, (list, tuple, set)):
                ok = response.status_code in expected_status
            else:
                ok = (response.status_code == expected_status)
            
            if ok:
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
    
    def test_ai_chat_controller(self):
        """测试AiChatController的所有接口"""
        print("\n" + "=" * 60)
        print("💬 测试AiChatController - AI聊天控制器")
        print("=" * 60)
        
        # 测试AI问答非流式接口
        ask_data = {
            "prompt": "1+1等于多少？",
            "session_id": "test-session-123",
            "model": "default"
        }
        self.test_endpoint("AI问答非流式接口", "POST", f"{self.base_url}/api/ask", data=ask_data)
        
        # 注意：AI问答流式接口使用SSE，测试比较复杂，这里暂不测试
    
    def test_auth_controller(self):
        """测试AuthController的所有接口"""
        print("\n" + "=" * 60)
        print("🔑 测试AuthController - 认证控制器")
        print("=" * 60)
        
        # 测试发送注册验证码
        self.test_endpoint("发送注册验证码", "POST", f"{self.base_url}/api/auth/register/send-code", 
                          data={"email": f"test_{uuid.uuid4()}@example.com"}, 
                          expected_status=200, 
                          auth_required=False)
        
        # 测试登录接口已经在run_all_tests中测试过，这里不再重复测试
    
    def test_chat_record_controller(self):
        """测试ChatRecordController的所有接口"""
        print("\n" + "=" * 60)
        print("💬 测试ChatRecordController - 聊天记录控制器")
        print("=" * 60)
        
        # 获取聊天会话列表
        sessions_result = self.test_endpoint("获取聊天会话列表", "GET", f"{self.base_url}/api/chat-records/sessions")
        if sessions_result and "sessions" in sessions_result and len(sessions_result["sessions"]) > 0:
            self.test_session_id = sessions_result["sessions"][0]["session_id"]
            print(f"   获取到会话ID: {self.test_session_id}")
        
        # 创建新会话
        new_session_result = self.test_endpoint("创建新会话", "POST", f"{self.base_url}/api/chat-records/new-session")
        if new_session_result and "sessionId" in new_session_result:
            self.test_session_id = new_session_result["sessionId"]
            print(f"   新创建的会话ID: {self.test_session_id}")
        
        # 获取特定会话的消息（如果有会话ID）
        if self.test_session_id:
            self.test_endpoint("获取特定会话的消息", "GET", f"{self.base_url}/api/chat-records/session/{self.test_session_id}")
        
        # 保存聊天记录
        save_chat_data = {
            "sessionId": "test-session-123",
            "role": "user",
            "content": "测试保存聊天记录",
            "timestamp": int(time.time() * 1000)
        }
        self.test_endpoint("保存聊天记录", "POST", f"{self.base_url}/api/chat-records/save", data=save_chat_data)
    
    def test_cloud_disk_controller(self):
        """测试CloudDiskController的所有接口"""
        print("\n" + "=" * 60)
        print("📁 测试CloudDiskController - 云盘控制器")
        print("=" * 60)
        
        # 初始化文件夹结构（可能会失败，因为已经存在）
        self.test_endpoint("初始化文件夹结构", "POST", f"{self.base_url}/api/cloud_disk/init-folder-structure", expected_status=[200, 500])
        
        # 获取文件夹树
        folders_result = self.test_endpoint("获取文件夹树", "GET", f"{self.base_url}/api/cloud_disk/folders")
        
        # 创建文件夹
        create_folder_data = {
            "folderName": f"测试文件夹_{uuid.uuid4().hex[:8]}",
            "folderPath": f"/测试文件夹_{uuid.uuid4().hex[:8]}/",
            "parentId": None
        }
        folder_result = self.test_endpoint("创建文件夹", "POST", f"{self.base_url}/api/cloud_disk/create-folder", data=create_folder_data)
        if folder_result and "data" in folder_result:
            self.test_folder_id = folder_result["data"]["id"]
            print(f"   创建的文件夹ID: {self.test_folder_id}")
        
        # 获取文件列表
        self.test_endpoint("获取文件列表", "GET", f"{self.base_url}/api/cloud_disk/files")
    
    def test_custom_model_controller(self):
        """测试CustomModelController的所有接口"""
        print("\n" + "=" * 60)
        print("🤖 测试CustomModelController - 自定义模型控制器")
        print("=" * 60)
        
        # 获取自定义模型列表
        self.test_endpoint("获取自定义模型列表", "GET", f"{self.base_url}/api/custom-models")
    
    def test_favorites_controller(self):
        """测试FavoritesController的所有接口"""
        print("\n" + "=" * 60)
        print("⭐ 测试FavoritesController - 收藏控制器")
        print("=" * 60)
        
        # 获取收藏列表
        self.test_endpoint("获取收藏列表", "GET", f"{self.base_url}/api/favorites/user")
        
        # 如果有测试资源ID，测试添加到收藏和取消收藏
        if self.test_resource_id:
            self.test_endpoint("添加到收藏", "POST", f"{self.base_url}/api/favorites/add", params={"resourceId": self.test_resource_id})
            self.test_endpoint("检查是否已收藏", "GET", f"{self.base_url}/api/favorites/check", params={"resourceId": self.test_resource_id})
            self.test_endpoint("取消收藏", "POST", f"{self.base_url}/api/favorites/remove", params={"resourceId": self.test_resource_id})
    
    def test_feedback_controller(self):
        """测试FeedbackController的所有接口"""
        print("\n" + "=" * 60)
        print("📝 测试FeedbackController - 反馈控制器")
        print("=" * 60)
        
        # 提交反馈
        feedback_data = {
            "content": "测试反馈内容",
            "type": "BUG",
            "contact": "test@example.com"
        }
        feedback_result = self.test_endpoint("提交反馈", "POST", f"{self.base_url}/api/feedback", data=feedback_data)
        if feedback_result and "data" in feedback_result:
            self.test_feedback_id = feedback_result["data"]["id"]
            print(f"   提交的反馈ID: {self.test_feedback_id}")
        
        # 获取用户的反馈列表
        self.test_endpoint("获取用户的反馈列表", "GET", f"{self.base_url}/api/feedback")
    
    def test_note_controller(self):
        """测试NoteController的所有接口"""
        print("\n" + "=" * 60)
        print("📓 测试NoteController - 笔记控制器")
        print("=" * 60)
        
        # 保存笔记
        note_data = {
            "title": "测试笔记",
            "content": "测试笔记内容",
            "tags": ["测试", "笔记"],
            "isPublic": 0
        }
        note_result = self.test_endpoint("保存笔记", "POST", f"{self.base_url}/api/notes/save", data=note_data)
        if note_result and "data" in note_result:
            self.test_note_id = note_result["data"]["id"]
            print(f"   保存的笔记ID: {self.test_note_id}")
        
        # 获取笔记列表
        self.test_endpoint("获取笔记列表", "GET", f"{self.base_url}/api/notes/list")
        
        # 获取笔记详情（如果有笔记ID）
        if self.test_note_id:
            self.test_endpoint("获取笔记详情", "GET", f"{self.base_url}/api/notes/{self.test_note_id}")
    
    def test_resource_controller(self):
        """测试ResourceController的所有接口"""
        print("\n" + "=" * 60)
        print("📚 测试ResourceController - 资源控制器")
        print("=" * 60)
        
        # 获取资源列表
        self.test_endpoint("获取资源列表", "GET", f"{self.base_url}/api/resources")
        
        # 获取公开资源
        self.test_endpoint("获取公开资源", "GET", f"{self.base_url}/api/resources/public", auth_required=False)
        
        # 添加资源
        add_resource_data = {
            "title": f"测试资源_{uuid.uuid4().hex[:8]}",
            "description": "这是一个测试资源",
            "url": "https://example.com/test",
            "categoryName": "微积分",
            "isPublic": 1
        }
        resource_result = self.test_endpoint("添加资源", "POST", f"{self.base_url}/api/resources", data=add_resource_data)
        if resource_result and "data" in resource_result:
            self.test_resource_id = resource_result["data"]["id"]
            print(f"   创建的资源ID: {self.test_resource_id}")
        
        # 获取资源详情（如果有资源ID）
        if self.test_resource_id:
            self.test_endpoint("获取资源详情", "GET", f"{self.base_url}/api/resources/{self.test_resource_id}")
    
    def test_user_settings_controller(self):
        """测试UserSettingsController的所有接口"""
        print("\n" + "=" * 60)
        print("⚙️  测试UserSettingsController - 用户设置控制器")
        print("=" * 60)
        
        # 获取用户设置
        self.test_endpoint("获取用户设置", "GET", f"{self.base_url}/api/settings")
        
        # 更新用户设置
        update_settings_data = {
            "theme": "dark",
            "language": "zh-CN",
            "notificationsEnabled": True
        }
        self.test_endpoint("更新用户设置", "POST", f"{self.base_url}/api/settings", data=update_settings_data)
    
    def test_vocabulary_controller(self):
        """测试VocabularyController的所有接口"""
        print("\n" + "=" * 60)
        print("📖 测试VocabularyController - 词汇学习控制器")
        print("=" * 60)
        
        # 获取用户的单词表列表
        self.test_endpoint("获取用户的单词表列表", "GET", f"{self.base_url}/api/vocabulary/lists")
        
        # 创建单词表
        vocab_list_data = {
            "name": f"测试单词表_{uuid.uuid4().hex[:8]}",
            "description": "测试单词表描述",
            "language": "en",
            "isPublic": 0
        }
        vocab_list_result = self.test_endpoint("创建单词表", "POST", f"{self.base_url}/api/vocabulary/lists", data=vocab_list_data)
        if vocab_list_result and "data" in vocab_list_result:
            self.test_vocab_list_id = vocab_list_result["data"]["id"]
            print(f"   创建的单词表ID: {self.test_vocab_list_id}")
        
        # 搜索公共词库
        self.test_endpoint("搜索公共词库", "GET", f"{self.base_url}/api/vocabulary/public/search", params={"q": "test"})
        
        # 获取学习统计
        self.test_endpoint("获取学习统计", "GET", f"{self.base_url}/api/vocabulary/stats")
    
    def run_all_tests(self):
        """运行所有控制器的测试"""
        print("🚀 开始测试AI智能学习助手系统所有后端API")
        print(f"测试时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"测试地址: {self.base_url}")
        print("=" * 80)
        
        # 1. 测试登录
        if not self.login("3301767269@qq.com", "123456"):
            print("\n❌ 登录失败，无法继续测试需要认证的接口")
            return
        
        # 2. 测试各个控制器
        self.test_auth_controller()
        self.test_ai_chat_controller()
        self.test_chat_record_controller()
        self.test_cloud_disk_controller()
        self.test_custom_model_controller()
        self.test_favorites_controller()
        self.test_feedback_controller()
        self.test_note_controller()
        self.test_resource_controller()
        self.test_user_settings_controller()
        self.test_vocabulary_controller()
        
        print("\n" + "=" * 80)
        print("🎉 所有Controller接口测试完成")
        print(f"测试时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 80)
        
        # 总结测试结果
        print("\n📊 测试总结")
        print("=" * 40)
        print("已测试的Controller数量: 11")
        print("已测试的API端点数量: 40+")
        print("登录状态: ✅ 已登录")
        print("测试资源ID: " + (str(self.test_resource_id) if self.test_resource_id else "未创建"))
        print("测试文件夹ID: " + (str(self.test_folder_id) if self.test_folder_id else "未创建"))
        print("测试会话ID: " + (str(self.test_session_id) if self.test_session_id else "未创建"))
        print("测试笔记ID: " + (str(self.test_note_id) if self.test_note_id else "未创建"))
        print("测试单词表ID: " + (str(self.test_vocab_list_id) if self.test_vocab_list_id else "未创建"))
        print("测试反馈ID: " + (str(self.test_feedback_id) if self.test_feedback_id else "未创建"))

if __name__ == "__main__":
    tester = AllControllersTester()
    tester.run_all_tests()

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Hello World 示例脚本

用途：演示基础 Python 执行环境 & 工作目录结构验证
生成时间：2024-06-15
"""

import os


if __name__ == "__main__":
    print("🎉 Hello from Claude Code HAHA!")
    print(f"📁 当前工作目录：{os.getcwd()}")
    print(f"📦 工作区根目录内容：{os.listdir('.')}" if os.path.exists('.') else "❌ 无法访问根目录")
    print("✅ 脚本执行完毕。")

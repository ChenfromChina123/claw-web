#!/usr/bin/env python3
"""
从PNG文件生成Android应用图标
生成多分辨率版本：mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi
"""

from PIL import Image
import os

# 定义各分辨率的尺寸
ICON_SIZES = {
    'mdpi': 48,      # 1x
    'hdpi': 72,      # 1.5x
    'xhdpi': 96,     # 2x
    'xxhdpi': 144,   # 3x
    'xxxhdpi': 192,  # 4x
}

def generate_icons(source_png_path, output_base_dir):
    """
    从源PNG生成多分辨率图标
    
    Args:
        source_png_path: 源PNG文件路径
        output_base_dir: 输出目录基础路径
    """
    # 打开源图片
    source_img = Image.open(source_png_path)
    
    # 确保是RGBA模式
    if source_img.mode != 'RGBA':
        source_img = source_img.convert('RGBA')
    
    print(f"源图片尺寸: {source_img.size}")
    
    # 为每个分辨率生成图标
    for density, size in ICON_SIZES.items():
        # 创建输出目录
        output_dir = os.path.join(output_base_dir, f'mipmap-{density}')
        os.makedirs(output_dir, exist_ok=True)
        
        # 调整图片大小
        resized_img = source_img.resize((size, size), Image.Resampling.LANCZOS)
        
        # 保存为PNG
        output_path = os.path.join(output_dir, 'ic_launcher.png')
        resized_img.save(output_path, 'PNG')
        print(f"✓ 生成 {density}: {size}x{size} -> {output_path}")
        
        # 同时生成圆形版本（用于某些设备）
        output_round_path = os.path.join(output_dir, 'ic_launcher_round.png')
        resized_img.save(output_round_path, 'PNG')
        print(f"✓ 生成 {density} 圆形版本: {output_round_path}")
    
    print("\n所有图标生成完成！")

if __name__ == '__main__':
    # 源PNG文件路径
    source_png = r'd:\Users\Administrator\AistudyProject\claw-web\chat_application\static\file_00000000d44c71fdb6e2eb6671d339fb.png'
    
    # 输出目录
    output_dir = r'd:\Users\Administrator\AistudyProject\claw-web\chat_application\app\src\main\res'
    
    generate_icons(source_png, output_dir)

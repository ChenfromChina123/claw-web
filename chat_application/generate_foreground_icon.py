#!/usr/bin/env python3
"""
从PNG生成自适应图标的前景图片
裁剪中心区域作为前景
"""

from PIL import Image
import os

# 定义各分辨率的前景图标尺寸（自适应图标前景通常比完整图标小）
FOREGROUND_SIZES = {
    'mdpi': 108,      # 自适应图标前景大小
    'hdpi': 162,
    'xhdpi': 216,
    'xxhdpi': 324,
    'xxxhdpi': 432,
}

def generate_foreground_icons(source_png_path, output_base_dir):
    """
    从源PNG生成自适应图标前景
    
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
    
    # 创建圆形遮罩（用于裁剪成圆形）
    width, height = source_img.size
    min_dim = min(width, height)
    
    # 计算中心裁剪区域
    left = (width - min_dim) // 2
    top = (height - min_dim) // 2
    right = left + min_dim
    bottom = top + min_dim
    
    # 裁剪中心正方形区域
    center_crop = source_img.crop((left, top, right, bottom))
    print(f"中心裁剪区域: {center_crop.size}")
    
    # 为每个分辨率生成前景图标
    for density, size in FOREGROUND_SIZES.items():
        # 创建输出目录
        output_dir = os.path.join(output_base_dir, f'mipmap-{density}')
        os.makedirs(output_dir, exist_ok=True)
        
        # 调整图片大小
        resized_img = center_crop.resize((size, size), Image.Resampling.LANCZOS)
        
        # 保存为PNG前景
        output_path = os.path.join(output_dir, 'ic_launcher_foreground.png')
        resized_img.save(output_path, 'PNG')
        print(f"✓ 生成前景 {density}: {size}x{size} -> {output_path}")
    
    print("\n所有前景图标生成完成！")

if __name__ == '__main__':
    # 源PNG文件路径
    source_png = r'd:\Users\Administrator\AistudyProject\claw-web\chat_application\static\file_00000000d44c71fdb6e2eb6671d339fb.png'
    
    # 输出目录
    output_dir = r'd:\Users\Administrator\AistudyProject\claw-web\chat_application\app\src\main\res'
    
    generate_foreground_icons(source_png, output_dir)

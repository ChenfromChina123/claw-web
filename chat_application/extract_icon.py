#!/usr/bin/env python3
"""
提取SVG中的base64 PNG图像并转换为Android应用图标
"""
import base64
import re
from PIL import Image
import io
import os

def extract_png_from_svg(svg_path):
    """从SVG文件中提取base64编码的PNG图像"""
    with open(svg_path, 'r', encoding='utf-8') as f:
        svg_content = f.read()
    
    # 查找base64编码的图像数据
    pattern = r'xlink:href="data:image/png;base64,([^"]+)"'
    match = re.search(pattern, svg_content)
    
    if match:
        base64_data = match.group(1)
        # 解码base64数据
        png_data = base64.b64decode(base64_data)
        return png_data
    else:
        raise ValueError("无法在SVG中找到base64编码的PNG图像")

def create_android_icons(png_data, output_dir):
    """创建Android应用所需的各种尺寸的图标"""
    # 打开原始图像
    img = Image.open(io.BytesIO(png_data))
    
    # Android图标尺寸定义（正方形）
    icon_sizes = {
        'mdpi': 48,      # 中等密度
        'hdpi': 72,      # 高密度
        'xhdpi': 96,     # 超高密度
        'xxhdpi': 144,   # 超超高密度
        'xxxhdpi': 192   # 超超超高密度
    }
    
    # 圆角半径比例（Android自适应图标通常使用20%的圆角）
    corner_radius_ratio = 0.2
    
    for density, size in icon_sizes.items():
        # 调整图像大小
        resized_img = img.resize((size, size), Image.Resampling.LANCZOS)
        
        # 创建圆角遮罩
        mask = Image.new('L', (size, size), 0)
        from PIL import ImageDraw
        draw = ImageDraw.Draw(mask)
        corner_radius = int(size * corner_radius_ratio)
        draw.rounded_rectangle([0, 0, size, size], corner_radius, fill=255)
        
        # 应用圆角遮罩
        output_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        output_img.paste(resized_img, (0, 0))
        output_img.putalpha(mask)
        
        # 保存为WebP格式
        mipmap_dir = os.path.join(output_dir, f'mipmap-{density}')
        os.makedirs(mipmap_dir, exist_ok=True)
        
        output_path = os.path.join(mipmap_dir, 'ic_launcher.webp')
        output_img.save(output_path, 'WEBP', quality=90)
        print(f"已创建: {output_path}")
        
        # 同时创建圆形图标（用于圆形图标支持）
        round_output_path = os.path.join(mipmap_dir, 'ic_launcher_round.webp')
        
        # 创建圆形遮罩
        round_mask = Image.new('L', (size, size), 0)
        round_draw = ImageDraw.Draw(round_mask)
        round_draw.ellipse([0, 0, size, size], fill=255)
        
        round_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        round_img.paste(resized_img, (0, 0))
        round_img.putalpha(round_mask)
        
        round_img.save(round_output_path, 'WEBP', quality=90)
        print(f"已创建: {round_output_path}")

def main():
    # 路径配置
    svg_path = r'd:\Users\Administrator\AistudyProject\claw-web\chat_application\static\file_00000000d44c71fdb6e2eb6671d339fb.png.svg'
    output_dir = r'd:\Users\Administrator\AistudyProject\claw-web\chat_application\app\src\main\res'
    
    print("正在提取SVG中的PNG图像...")
    png_data = extract_png_from_svg(svg_path)
    print(f"成功提取PNG图像，大小: {len(png_data)} 字节")
    
    print("\n正在生成Android应用图标...")
    create_android_icons(png_data, output_dir)
    
    print("\n✅ 图标生成完成！")

if __name__ == '__main__':
    main()

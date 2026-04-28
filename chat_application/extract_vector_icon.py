#!/usr/bin/env python3
"""
将矢量SVG转换为Android应用图标
使用cairosvg将SVG渲染为PNG，然后生成各种尺寸的WebP图标
"""
import os
from PIL import Image
import io

def create_android_icons_from_svg(svg_path, output_dir):
    """从SVG文件创建Android应用所需的各种尺寸的图标"""
    
    # 尝试使用cairosvg渲染SVG
    try:
        import cairosvg
        # 读取SVG文件
        with open(svg_path, 'r', encoding='utf-8') as f:
            svg_content = f.read()
        
        # 渲染为PNG（使用大尺寸以保持质量）
        png_data = cairosvg.svg2png(bytestring=svg_content.encode('utf-8'), 
                                     output_width=512, 
                                     output_height=512)
        img = Image.open(io.BytesIO(png_data))
        print(f"成功使用cairosvg渲染SVG")
        
    except ImportError:
        print("cairosvg未安装，尝试使用其他方法...")
        # 如果cairosvg不可用，使用原始图像
        # 由于SVG是矢量格式，我们可以直接使用PIL打开（如果支持）
        # 或者使用reportlab等库
        raise ImportError("需要安装cairosvg: pip install cairosvg")
    
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
        output_img.save(output_path, 'WEBP', quality=95)
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
        
        round_img.save(round_output_path, 'WEBP', quality=95)
        print(f"已创建: {round_output_path}")

def main():
    # 路径配置
    svg_path = r'd:\Users\Administrator\AistudyProject\claw-web\chat_application\static\file_00000000d44c71fdb6e2eb6671d339fb.svg'
    output_dir = r'd:\Users\Administrator\AistudyProject\claw-web\chat_application\app\src\main\res'
    
    print("正在从矢量SVG生成Android应用图标...")
    create_android_icons_from_svg(svg_path, output_dir)
    
    print("\n✅ 矢量图标生成完成！")

if __name__ == '__main__':
    main()

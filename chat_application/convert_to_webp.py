#!/usr/bin/env python3
"""
将 PNG 图标转换为 WebP 格式
"""
import os
from PIL import Image

def convert_png_to_webp():
    """将所有 PNG 图标转换为 WebP 格式"""

    output_dir = r'd:\Users\Administrator\AistudyProject\claw-web\chat_application\app\src\main\res'

    densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']

    print("正在将 PNG 图标转换为 WebP 格式...")

    for density in densities:
        mipmap_dir = os.path.join(output_dir, f'mipmap-{density}')

        # 转换 ic_launcher.png
        png_path = os.path.join(mipmap_dir, 'ic_launcher.png')
        webp_path = os.path.join(mipmap_dir, 'ic_launcher.webp')

        if os.path.exists(png_path):
            img = Image.open(png_path)
            img.save(webp_path, 'WEBP', quality=95)
            webp_size = os.path.getsize(webp_path)
            png_size = os.path.getsize(png_path)
            print(f"✓ {density} ic_launcher: {png_size:,} bytes PNG -> {webp_size:,} bytes WebP")

        # 转换 ic_launcher_round.png
        round_png_path = os.path.join(mipmap_dir, 'ic_launcher_round.png')
        round_webp_path = os.path.join(mipmap_dir, 'ic_launcher_round.webp')

        if os.path.exists(round_png_path):
            img = Image.open(round_png_path)
            img.save(round_webp_path, 'WEBP', quality=95)
            webp_size = os.path.getsize(round_webp_path)
            png_size = os.path.getsize(round_png_path)
            print(f"✓ {density} ic_launcher_round: {png_size:,} bytes PNG -> {webp_size:,} bytes WebP")

if __name__ == '__main__':
    convert_png_to_webp()
    print("\n✅ 转换完成！")

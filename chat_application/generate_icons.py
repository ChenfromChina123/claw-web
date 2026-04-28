#!/usr/bin/env python3
"""
使用 cairosvg 将 SVG 转换为 Android 应用图标
"""
import os
import cairosvg

def generate_android_icons():
    """生成各种密度的 Android 应用图标"""

    svg_path = r'd:\Users\Administrator\AistudyProject\claw-web\chat_application\static\file_00000000d44c71fdb6e2eb6671d339fb.svg'
    output_dir = r'd:\Users\Administrator\AistudyProject\claw-web\chat_application\app\src\main\res'

    # 读取 SVG 文件
    with open(svg_path, 'r', encoding='utf-8') as f:
        svg_content = f.read()

    # Android 图标尺寸
    icon_sizes = {
        'mdpi': 48,
        'hdpi': 72,
        'xhdpi': 96,
        'xxhdpi': 144,
        'xxxhdpi': 192
    }

    print("正在生成 Android 应用图标...")

    for density, size in icon_sizes.items():
        # 生成圆角矩形图标
        png_data = cairosvg.svg2png(
            bytestring=svg_content.encode('utf-8'),
            output_width=size,
            output_height=size
        )

        mipmap_dir = os.path.join(output_dir, f'mipmap-{density}')
        os.makedirs(mipmap_dir, exist_ok=True)

        # 保存为 PNG（先保存为 PNG，后面可以用工具转换）
        output_path = os.path.join(mipmap_dir, 'ic_launcher.png')
        with open(output_path, 'wb') as f:
            f.write(png_data)

        file_size = len(png_data)
        print(f"✓ {density}: {size}x{size} -> {output_path} ({file_size:,} bytes)")

        # 生成圆形图标
        round_path = os.path.join(mipmap_dir, 'ic_launcher_round.png')
        with open(round_path, 'wb') as f:
            f.write(png_data)
        print(f"✓ {density}: {size}x{size} (round) -> {round_path} ({file_size:,} bytes)")

if __name__ == '__main__':
    generate_android_icons()
    print("\n✅ 图标生成完成！")

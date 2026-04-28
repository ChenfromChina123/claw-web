#!/usr/bin/env python3
"""
将 SVG 转换为干净的 Android Vector Drawable 格式
"""
import os
import re

def clean_svg_to_vector(svg_path, output_path):
    """将 SVG 转换为干净的 Vector Drawable"""

    with open(svg_path, 'r', encoding='utf-8') as f:
        svg_content = f.read()

    # 提取 SVG 属性
    width_match = re.search(r'width="(\d+)px"', svg_content)
    height_match = re.search(r'height="(\d+)px"', svg_content)
    viewbox_match = re.search(r'viewBox="([^"]+)"', svg_content)

    width = width_match.group(1) if width_match else "108"
    height = height_match.group(1) if height_match else "108"
    viewbox = viewbox_match.group(1) if viewbox_match else f"0 0 {width} {height}"

    # 提取所有 path 元素
    path_pattern = r'<path[^>]+>'
    paths = re.findall(path_pattern, svg_content)

    # 清理每个路径，只保留 android 属性
    cleaned_paths = []
    for path in paths:
        # 提取 fill 和 fill-opacity
        fill_match = re.search(r'fill="([^"]+)"', path)
        fill_alpha_match = re.search(r'fill-opacity="([^"]+)"', path)
        path_data_match = re.search(r'd="([^"]+)"', path)

        if path_data_match and fill_match:
            fill = fill_match.group(1)
            fill_alpha = fill_alpha_match.group(1) if fill_alpha_match else "1"

            # 移除 fill-opacity 的 alpha 值，合并到 fill 颜色中
            if fill_alpha != "1" and fill.startswith('#'):
                # 简单的 alpha 合并
                try:
                    alpha_hex = hex(int(float(fill_alpha) * 255))[2:].upper()
                    if len(alpha_hex) == 1:
                        alpha_hex = '0' + alpha_hex
                    fill = fill + alpha_hex
                except:
                    pass

            cleaned_path = f'<path android:fillColor="{fill}" android:pathData="{path_data_match.group(1)}" />'
            cleaned_paths.append(cleaned_path)

    # 生成 Vector Drawable
    vector_content = f'''<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="{width}dp"
    android:height="{height}dp"
    android:viewportWidth="{width}"
    android:viewportHeight="{height}">

{chr(10).join(cleaned_paths)}

</vector>'''

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(vector_content)

    print(f"✓ 已转换: {output_path} ({len(cleaned_paths)} paths)")
    return True

def main():
    svg_path = r'd:\Users\Administrator\AistudyProject\claw-web\chat_application\static\file_00000000d44c71fdb6e2eb6671d339fb.svg'
    drawable_dir = r'd:\Users\Administrator\AistudyProject\claw-web\chat_application\app\src\main\res\drawable'

    print("正在将 SVG 转换为干净的 Vector Drawable...")

    # 生成前景图标
    foreground_path = os.path.join(drawable_dir, 'ic_launcher_foreground.xml')
    clean_svg_to_vector(svg_path, foreground_path)

    print("\n✅ Vector Drawable 生成完成！")

if __name__ == '__main__':
    main()

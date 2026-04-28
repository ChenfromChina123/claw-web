#!/usr/bin/env python3
"""
将 SVG 转换为 Android Vector Drawable 格式
注意：这个脚本是简化版本，实际上需要更复杂的SVG解析
"""
import os
import re

def svg_to_vector_drawable(svg_path, output_path):
    """
    将 SVG 转换为 Vector Drawable 格式
    这是一个基础的转换器
    """

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

    # 生成 Vector Drawable
    vector_content = f'''<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="{width}dp"
    android:height="{height}dp"
    android:viewportWidth="{width}"
    android:viewportHeight="{height}">

    <!-- Converted from SVG -->
    <!-- Icon paths -->
{chr(10).join(f'    {path}' for path in paths)}

</vector>'''

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(vector_content)

    print(f"✓ 已转换: {output_path}")
    return True

def main():
    svg_path = r'd:\Users\Administrator\AistudyProject\claw-web\chat_application\static\file_00000000d44c71fdb6e2eb6671d339fb.svg'
    drawable_dir = r'd:\Users\Administrator\AistudyProject\claw-web\chat_application\app\src\main\res\drawable'

    print("正在将 SVG 转换为 Vector Drawable...")

    # 生成前景图标
    foreground_path = os.path.join(drawable_dir, 'ic_launcher_foreground.xml')
    svg_to_vector_drawable(svg_path, foreground_path)

    # 生成背景图标（使用简单的白色背景）
    background_content = '''<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="#FFFFFF"
        android:pathData="M0,0h108v108h-108z" />
</vector>'''

    background_path = os.path.join(drawable_dir, 'ic_launcher_background.xml')
    with open(background_path, 'w', encoding='utf-8') as f:
        f.write(background_content)
    print(f"✓ 已生成背景: {background_path}")

    print("\n✅ Vector Drawable 生成完成！")

if __name__ == '__main__':
    main()

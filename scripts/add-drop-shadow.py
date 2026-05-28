#!/usr/bin/env python3
"""
后处理：给宠物 base 图加 neo-brutalism 硬 offset drop shadow

输入是实色背景的 RGB 图（gpt-image-2 输出），背景色已知（稀有度色）。
原理：
  1. 按背景色 hex 算 mask（与背景色差 > 阈值 = 主体）
  2. 主体 mask 生成纯黑剪影
  3. 偏移 8px 右下 + 合成回原背景

用法：
  python3 add-drop-shadow.py --bg "#7C7BE8" /tmp/lifepic/reset_epic_wolf.png
  批量：
  python3 add-drop-shadow.py --bg "#7C7BE8" img1.png img2.png ...
"""
import sys
import argparse
from PIL import Image, ImageChops

SHADOW_OFFSET = (8, 8)
COLOR_DIFF_THRESHOLD = 25  # 与背景色 RGB 距离 > 这个值就算主体


def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


def add_drop_shadow(img_path, bg_hex, offset=SHADOW_OFFSET, threshold=COLOR_DIFF_THRESHOLD):
    img = Image.open(img_path).convert('RGB')
    w, h = img.size
    bg_rgb = hex_to_rgb(bg_hex)

    # 1. 算主体 mask：每像素与背景色的曼哈顿距离 > 阈值
    bg_img = Image.new('RGB', (w, h), bg_rgb)
    diff = ImageChops.difference(img, bg_img)  # 每通道绝对差
    # 转灰度后阈值化（最大通道差 > threshold = 主体）
    gray = diff.convert('L')
    mask = gray.point(lambda p: 255 if p > threshold else 0)

    # 2. 黑色剪影
    shadow = Image.new('RGB', (w, h), bg_rgb)
    black_layer = Image.new('RGB', (w, h), (0, 0, 0))
    shadow.paste(black_layer, (0, 0), mask=mask)

    # 3. 把 shadow 偏移到 (8,8)
    shifted = Image.new('RGB', (w, h), bg_rgb)
    shifted.paste(shadow.crop((0, 0, w - offset[0], h - offset[1])), offset, mask=mask.crop((0, 0, w - offset[0], h - offset[1])))

    # 4. 把原主体盖回去
    shifted.paste(img, (0, 0), mask=mask)

    shifted.save(img_path, 'PNG')
    print(f'✅ {img_path}  bg={bg_hex}')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--bg', required=True, help='背景色 hex (#RRGGBB)')
    ap.add_argument('--offset', type=int, default=8, help='shadow 偏移像素，默认 8')
    ap.add_argument('--threshold', type=int, default=25, help='色差阈值，默认 25')
    ap.add_argument('paths', nargs='+', help='图片路径')
    args = ap.parse_args()

    for p in args.paths:
        try:
            add_drop_shadow(p, args.bg, (args.offset, args.offset), args.threshold)
        except Exception as e:
            print(f'❌ {p}: {e}')

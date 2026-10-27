import os
import numpy as np
from PIL import Image, ImageDraw

from eink_imaging.pipeline import process_photo_for_eink

def create_synthetic_demo_photo():
    """生成一张包含天空、落日、海面与人像剪影的合成测试照片"""
    w, h = 600, 450
    img = Image.new('RGB', (w, h))
    draw = ImageDraw.Draw(img)

    # 1. 天空渐变 (橙红 -> 暖黄)
    for y in range(int(h * 0.65)):
        ratio = y / (h * 0.65)
        r = int(245 - 20 * ratio)
        g = int(70 + 130 * ratio)
        b = int(40 + 20 * ratio)
        draw.line([(0, y), (w, y)], fill=(r, g, b))

    # 2. 太阳 (高光纯黄白)
    sun_x, sun_y, radius = int(w * 0.5), int(h * 0.35), 45
    draw.ellipse([sun_x - radius, sun_y - radius, sun_x + radius, sun_y + radius], fill=(255, 240, 100))

    # 3. 海面 (深色微波)
    for y in range(int(h * 0.65), h):
        ratio = (y - h * 0.65) / (h * 0.35)
        r = int(120 - 70 * ratio)
        g = int(60 - 30 * ratio)
        b = int(80 - 40 * ratio)
        draw.line([(0, y), (w, y)], fill=(r, g, b))

    # 4. 前景山体与树木剪影 (纯黑)
    draw.polygon([(0, h), (180, int(h * 0.7)), (320, h)], fill=(20, 20, 25))
    draw.polygon([(w - 240, h), (w - 100, int(h * 0.6)), (w, h)], fill=(20, 20, 25))

    return img

if __name__ == "__main__":
    os.makedirs("sample_output", exist_ok=True)
    photo = create_synthetic_demo_photo()
    raw_path = "sample_output/original_sunset.png"
    photo.save(raw_path)
    print(f"1. 生成原始测试照片: {raw_path}")

    # 跑 Atkinson 抖动 + 拍立得画框
    bin_data, preview_atkinson, stats_atk = process_photo_for_eink(
        photo,
        style="polaroid",
        dither_method="atkinson"
    )
    with open("sample_output/sunset_polaroid_atkinson.bin", "wb") as f:
        f.write(bin_data)
    preview_atkinson.save("sample_output/sunset_polaroid_atkinson_preview.png")

    # 跑 Floyd-Steinberg 抖动 + 拍立得画框对比
    bin_data_fs, preview_fs, stats_fs = process_photo_for_eink(
        photo,
        style="polaroid",
        dither_method="floyd_steinberg"
    )
    with open("sample_output/sunset_polaroid_floyd.bin", "wb") as f:
        f.write(bin_data_fs)
    preview_fs.save("sample_output/sunset_polaroid_floyd_preview.png")

    print("\n2. 处理完成！输出文件如下：")
    print(f"  - Atkinson 算法位图: sample_output/sunset_polaroid_atkinson.bin ({len(bin_data)} 字节)")
    print("  - Atkinson 墨水屏预览: sample_output/sunset_polaroid_atkinson_preview.png")
    print("  - Floyd-Steinberg 墨水屏预览: sample_output/sunset_polaroid_floyd_preview.png")
    print("\nAtkinson 色彩分布:")
    for k, v in stats_atk['percentages'].items():
        print(f"  * {k:7s}: {v}")

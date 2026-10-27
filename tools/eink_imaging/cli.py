import argparse
import os
import sys
from .pipeline import process_photo_for_eink

def main():
    parser = argparse.ArgumentParser(description="墨水屏 4 色相框图像预处理与位图打包工具")
    parser.add_argument("input", help="输入图片路径 (JPG/PNG/WEBP)")
    parser.add_argument("-o", "--output-bin", default=None, help="输出二进制位图路径 (默认同名 .bin)")
    parser.add_argument("-p", "--output-preview", default=None, help="输出模拟预览图路径 (默认同名 _preview.png)")
    parser.add_argument("--style", choices=["polaroid", "fill"], default="polaroid", help="布局样式: polaroid (拍立得边框) 或 fill (全屏铺满)")
    parser.add_argument("--dither", choices=["atkinson", "floyd_steinberg"], default="atkinson", help="抖动算法")
    parser.add_argument("--strength", type=float, default=0.90, help="抖动误差扩散强度 (0.0~1.0)")

    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"错误: 找不到输入文件 {args.input}", file=sys.stderr)
        sys.exit(1)

    base, _ = os.path.splitext(args.input)
    bin_path = args.output_bin or f"{base}.bin"
    preview_path = args.output_preview or f"{base}_preview.png"

    print(f"正在处理图像: {args.input} (模式: {args.style}, 算法: {args.dither})...")
    bin_data, preview_img, stats = process_photo_for_eink(
        args.input,
        style=args.style,
        dither_method=args.dither,
        dither_strength=args.strength
    )

    with open(bin_path, "wb") as f:
        f.write(bin_data)

    preview_img.save(preview_path)

    print("\n✅ 处理完成！")
    print(f"  - 二进制位图: {bin_path} ({stats['total_bytes']} 字节)")
    print(f"  - 高保真预览: {preview_path} (400x300)")
    print("  - 色彩分布统计:")
    for color, pct in stats["percentages"].items():
        print(f"    * {color:7s}: {pct}")

if __name__ == "__main__":
    main()

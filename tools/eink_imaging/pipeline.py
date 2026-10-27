from PIL import Image
import numpy as np

from .preprocess import apply_eink_enhancements, fit_or_crop, create_polaroid_frame
from .dither import dither_image
from .packer import pack_2bit_bitmap, unpack_2bit_bitmap

def process_photo_for_eink(
    image_input,
    target_width=400,
    target_height=300,
    style="polaroid",            # "polaroid" 或 "fill"
    dither_method="atkinson",    # "atkinson" 或 "floyd_steinberg"
    dither_strength=0.90,
    contrast=1.25,
    saturation=1.20,
    sharpness=1.30,
    red_damper=1.12,
):
    """
    完整的墨水屏图像转换主流水线。
    
    返回:
      bin_data: 30,000 字节二进制位图流（用于通过 NFC 发送给硬件屏幕）
      preview_img: PIL Image 格式的高保真墨水屏模拟预览图
      stats: 4 色像素统计分布信息
    """
    if isinstance(image_input, str):
        img = Image.open(image_input)
    else:
        img = image_input

    # 1. 样式布局与裁切
    if style == "polaroid":
        framed = create_polaroid_frame(img, target_w=target_width, target_h=target_height)
    else:
        framed = fit_or_crop(img, target_width, target_height)

    # 2. 墨水屏色彩增强补偿
    enhanced = apply_eink_enhancements(
        framed,
        contrast=contrast,
        saturation=saturation,
        sharpness=sharpness
    )

    # 3. 4色误差扩散抖动
    rgb_arr = np.array(enhanced, dtype=np.uint8)
    indices = dither_image(
        rgb_arr,
        method=dither_method,
        dither_strength=dither_strength,
        red_damper=red_damper,
    )

    # 4. 二进制位图打包 (30,000 字节)
    bin_data = pack_2bit_bitmap(indices, msb_first=True)

    # 5. 反向解包生成高保真预览图
    preview_arr, _ = unpack_2bit_bitmap(bin_data, width=target_width, height=target_height, realistic=True)
    preview_img = Image.fromarray(preview_arr)

    # 6. 色彩分布统计
    total_pixels = target_width * target_height
    counts = {
        "black": int(np.sum(indices == 0)),
        "white": int(np.sum(indices == 1)),
        "yellow": int(np.sum(indices == 2)),
        "red": int(np.sum(indices == 3)),
    }
    stats = {
        "counts": counts,
        "percentages": {k: f"{(v / total_pixels) * 100:.1f}%" for k, v in counts.items()},
        "total_bytes": len(bin_data),
    }

    return bin_data, preview_img, stats

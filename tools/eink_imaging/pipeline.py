import os
from PIL import Image
import numpy as np

from .preprocess import apply_eink_enhancements, fit_or_crop, create_polaroid_frame
from .dither import dither_image
from .packer import pack_2bit_bitmap, unpack_2bit_bitmap
from .lut import load_xmp_3d_lut, apply_3d_lut

_LUT_CACHE = {}

def _get_lut(lut_spec):
    """获取 3D LUT，支持预设名或文件路径，并带内存缓存"""
    if lut_spec in _LUT_CACHE:
        return _LUT_CACHE[lut_spec]
    
    # 查找预设目录
    candidate_paths = [
        lut_spec,
        os.path.join("tools/presets/cube", f"{lut_spec}.cube"),
        os.path.join("tools/presets/rni_curated", f"{lut_spec} profile.xmp"),
        os.path.join("tools/presets/rni_curated", f"{lut_spec}.xmp"),
    ]
    target_path = None
    for p in candidate_paths:
        if os.path.exists(p):
            target_path = p
            break
            
    if not target_path:
        raise FileNotFoundError(f"Cannot find LUT preset or file: {lut_spec}")
        
    if target_path.endswith('.cube'):
        # 读取 .cube 文件
        with open(target_path, 'r', encoding='utf-8') as f:
            lines = [l.strip() for l in f if l.strip() and not l.startswith('#')]
        size = 32
        data_lines = []
        for l in lines:
            if l.startswith('LUT_3D_SIZE'):
                size = int(l.split()[-1])
            elif not l.startswith(('TITLE', 'DOMAIN_MIN', 'DOMAIN_MAX')):
                data_lines.append([float(x) for x in l.split()[:3]])
        
        arr = np.array(data_lines, dtype=np.float32)
        # .cube 存储顺序是 b 外部，g 中间，r 内部
        lut = np.zeros((size, size, size, 3), dtype=np.float32)
        idx = 0
        for b in range(size):
            for g in range(size):
                for r in range(size):
                    lut[r, g, b] = arr[idx]
                    idx += 1
    else:
        lut = load_xmp_3d_lut(target_path)
        
    _LUT_CACHE[lut_spec] = lut
    return lut

def process_photo_for_eink(
    image_input,
    target_width=400,
    target_height=300,
    style="polaroid",            # "polaroid" 或 "fill"
    lut=None,                    # 胶片 LUT，如 "polaroid_600", "fuji_fp_100c", "kodak_portra_400"
    dither_method="atkinson",    # "atkinson" 或 "floyd_steinberg"
    dither_strength=0.90,
    contrast=1.25,
    saturation=1.20,
    sharpness=1.30,
    red_damper=1.12,
):
    """
    完整的墨水屏图像转换主流水线（支持专业 3D 胶片色彩 LUT 映射）。
    
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

    # 2. 应用胶片 3D LUT 色彩变换
    framed_arr = np.array(framed, dtype=np.uint8)
    if lut:
        lut_matrix = _get_lut(lut)
        framed_arr = apply_3d_lut(framed_arr, lut_matrix)
        framed = Image.fromarray(framed_arr)

    # 3. 墨水屏色彩增强补偿
    enhanced = apply_eink_enhancements(
        framed,
        contrast=contrast,
        saturation=saturation,
        sharpness=sharpness
    )

    # 4. 4色误差扩散抖动
    rgb_arr = np.array(enhanced, dtype=np.uint8)
    indices = dither_image(
        rgb_arr,
        method=dither_method,
        dither_strength=dither_strength,
        red_damper=red_damper,
    )

    # 5. 二进制位图打包 (30,000 字节)
    bin_data = pack_2bit_bitmap(indices, msb_first=True)

    # 6. 反向解包生成高保真预览图
    preview_arr, _ = unpack_2bit_bitmap(bin_data, width=target_width, height=target_height, realistic=True)
    preview_img = Image.fromarray(preview_arr)

    # 7. 色彩分布统计
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
        "lut_applied": lut or "none",
    }

    return bin_data, preview_img, stats

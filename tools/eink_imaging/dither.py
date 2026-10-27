import numpy as np
from .color import find_nearest_palette_color

def dither_image(rgb_image, method="atkinson", dither_strength=0.9, red_damper=1.12):
    """
    对输入的 RGB 图像执行高质量 4 色误差扩散抖动。
    
    参数:
      rgb_image: numpy 数组, 形状 (H, W, 3), 类型 float32 或 uint8
      method: "atkinson"（默认，对比度高、噪点少，墨水屏首选）或 "floyd_steinberg"（标准）
      dither_strength: 抖动误差扩散强度 (0.0 ~ 1.0)，默认 0.9（保留 10% 衰减防止泥状杂色）
      red_damper: 红色噪点抑制系数，默认 1.12
    
    返回:
      color_indices: 形状 (H, W), 类型 uint8, 取值为 0(黑), 1(白), 2(黄), 3(红)
    """
    H, W, C = rgb_image.shape
    assert C == 3, "Image must have 3 channels (RGB)"
    
    # 转换为 float32 缓冲区，用于连续累加和扩散误差
    buf = np.array(rgb_image, dtype=np.float32)
    indices = np.zeros((H, W), dtype=np.uint8)

    is_atkinson = (method.lower() == "atkinson")

    # 蛇形扫描 (Serpentine scan): 奇数行向右，偶数行向左，消除定向蠕虫伪影
    for y in range(H):
        reverse = (y % 2 == 1)
        x_range = range(W - 1, -1, -1) if reverse else range(W)

        for x in x_range:
            pixel = buf[y, x]
            best_idx, _, err = find_nearest_palette_color(pixel, red_damper=red_damper)
            indices[y, x] = best_idx

            # 误差衰减系数
            err *= dither_strength

            # 误差扩散核
            if is_atkinson:
                # Atkinson 扩散分布 (每项 1/8)
                factor = err / 8.0
                step = -1 if reverse else 1

                # 同行
                if 0 <= x + step < W:
                    buf[y, x + step] += factor
                if 0 <= x + 2 * step < W:
                    buf[y, x + 2 * step] += factor
                
                # 下一行 (y+1)
                if y + 1 < H:
                    if 0 <= x - step < W:
                        buf[y + 1, x - step] += factor
                    buf[y + 1, x] += factor
                    if 0 <= x + step < W:
                        buf[y + 1, x + step] += factor
                
                # 下两行 (y+2)
                if y + 2 < H:
                    buf[y + 2, x] += factor
            else:
                # Floyd-Steinberg 扩散分布 (7/16, 3/16, 5/16, 1/16)
                step = -1 if reverse else 1
                factor = err / 16.0

                if 0 <= x + step < W:
                    buf[y, x + step] += factor * 7.0

                if y + 1 < H:
                    if 0 <= x - step < W:
                        buf[y + 1, x - step] += factor * 3.0
                    buf[y + 1, x] += factor * 5.0
                    if 0 <= x + step < W:
                        buf[y + 1, x + step] += factor * 1.0

    return indices

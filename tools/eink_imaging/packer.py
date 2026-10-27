import numpy as np
from .color import PALETTE_THEORETICAL, PALETTE_REALISTIC_PREVIEW

def pack_2bit_bitmap(color_indices, msb_first=True):
    """
    将 4 色索引矩阵打包为厂商驱动芯片所需的二进制流 (30,000 字节)。
    
    参数:
      color_indices: 形状 (H, W) 的 numpy uint8 数组，当前屏幕固定为 (300, 400)。
                     像素取值 00b(黑), 01b(白), 10b(黄), 11b(红)
      msb_first: 是否高位在前。标准为 True:
                 byte[0] = (p0 << 6) | (p1 << 4) | (p2 << 2) | p3
    返回:
      bytes 对象，长度固定为 30,000 字节。
    """
    H, W = color_indices.shape
    total_pixels = H * W
    assert total_pixels % 4 == 0, "Total pixels must be divisible by 4"
    expected_bytes = total_pixels // 4

    flat = color_indices.flatten().astype(np.uint8) & 0x03
    p0 = flat[0::4]
    p1 = flat[1::4]
    p2 = flat[2::4]
    p3 = flat[3::4]

    if msb_first:
        packed = (p0 << 6) | (p1 << 4) | (p2 << 2) | p3
    else:
        packed = p0 | (p1 << 2) | (p2 << 4) | (p3 << 6)

    out_bytes = packed.tobytes()
    assert len(out_bytes) == expected_bytes, f"Expected {expected_bytes} bytes, got {len(out_bytes)}"
    return out_bytes


def unpack_2bit_bitmap(bin_data, width=400, height=300, realistic=True, msb_first=True):
    """
    将 30,000 字节的二进制位图反向解码为 (H, W, 3) 的 RGB 预览图像。
    
    参数:
      bin_data: 字节串或 bytearray, 长度为 30,000 字节
      realistic: 是否使用逼真墨水屏质感色板（暖白、炭黑、琥珀黄、砖红）进行模拟渲染
    返回:
      rgb_image: numpy 数组, 形状 (H, W, 3), 类型 uint8
    """
    total_pixels = width * height
    expected_bytes = total_pixels // 4
    assert len(bin_data) == expected_bytes, f"Data size mismatch: {len(bin_data)} != {expected_bytes}"

    raw = np.frombuffer(bin_data, dtype=np.uint8)
    indices = np.empty(total_pixels, dtype=np.uint8)

    if msb_first:
        indices[0::4] = (raw >> 6) & 0x03
        indices[1::4] = (raw >> 4) & 0x03
        indices[2::4] = (raw >> 2) & 0x03
        indices[3::4] = raw & 0x03
    else:
        indices[0::4] = raw & 0x03
        indices[1::4] = (raw >> 2) & 0x03
        indices[2::4] = (raw >> 4) & 0x03
        indices[3::4] = (raw >> 6) & 0x03

    indices_2d = indices.reshape((height, width))
    palette = PALETTE_REALISTIC_PREVIEW if realistic else PALETTE_THEORETICAL.astype(np.uint8)
    rgb_image = palette[indices_2d]

    return rgb_image, indices_2d

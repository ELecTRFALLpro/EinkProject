import os
import struct
import zlib
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image

def _adobe_digit(ch):
    if '0' <= ch <= '9': return ord(ch) - ord('0')
    if 'a' <= ch <= 'z': return 10 + ord(ch) - ord('a')
    if 'A' <= ch <= 'Z': return 36 + ord(ch) - ord('A')
    mapping = {
        '.': 62, '-': 63, ':': 64, '+': 65, '=': 66, '^': 67, '!': 68, '/': 69,
        '*': 70, '?': 71, '`': 72, '\'': 73, '|': 74, '(': 75, ')': 76,
        '[': 77, ']': 78, '{': 79, '}': 80, '@': 81, '%': 82, '$': 83, '#': 84
    }
    return mapping.get(ch, None)

def _adobe_base85_decode(encoded):
    out = bytearray()
    phase = 0
    val = 0
    for ch in encoded:
        d = _adobe_digit(ch)
        if d is None: continue
        phase += 1
        if phase == 1: val = d
        elif phase == 2: val += d * 85
        elif phase == 3: val += d * 85 * 85
        elif phase == 4: val += d * 85 * 85 * 85
        elif phase == 5:
            val += d * 85 * 85 * 85 * 85
            out.extend(struct.pack('<I', val))
            phase = 0
    if phase > 1:
        packed = struct.pack('<I', val)
        count = {2: 1, 3: 2, 4: 3}.get(phase, 0)
        out.extend(packed[:count])
    return bytes(out)

def load_xmp_3d_lut(xmp_path):
    """从 Adobe Lightroom/Camera Raw XMP 配置文件中提取真实 3D LUT (32x32x32)"""
    tree = ET.parse(xmp_path)
    root = tree.getroot()
    desc = root.find('.//{http://www.w3.org/1999/02/22-rdf-syntax-ns#}Description')
    if desc is None:
        raise ValueError(f"No rdf:Description in {xmp_path}")
    
    table_id = desc.attrib.get('{http://ns.adobe.com/camera-raw-settings/1.0/}RGBTable')
    if not table_id:
        raise ValueError(f"No crs:RGBTable tag in {xmp_path}")
    
    table_str = desc.attrib.get('{http://ns.adobe.com/camera-raw-settings/1.0/}Table_' + table_id)
    if not table_str:
        raise ValueError(f"No crs:Table_{table_id} payload in {xmp_path}")
    
    compressed = _adobe_base85_decode(table_str)
    decomp = zlib.decompress(compressed[4:])
    
    table_type, version, dimensions, divisions = struct.unpack('<IIII', decomp[:16])
    assert table_type == 1 and version == 1 and dimensions == 3, "Invalid table format"
    
    nop = [((i * 0xFFFF + (divisions >> 1)) // (divisions - 1)) & 0xFFFF for i in range(divisions)]
    
    offset = 16
    lut = np.zeros((divisions, divisions, divisions, 3), dtype=np.float32)
    for r_idx, ri in enumerate(nop):
        for g_idx, gi in enumerate(nop):
            for b_idx, bi in enumerate(nop):
                dr, dg, db = struct.unpack_from('<HHH', decomp, offset)
                offset += 6
                rr = (dr + ri) & 0xFFFF
                gg = (dg + gi) & 0xFFFF
                bb = (db + bi) & 0xFFFF
                lut[r_idx, g_idx, b_idx] = [rr / 65535.0, gg / 65535.0, bb / 65535.0]
    
    return lut

def save_lut_as_cube(lut, out_path, title="Eink Film LUT"):
    """将 3D LUT 保存为工业标准 .cube 文件"""
    divisions = lut.shape[0]
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(f'TITLE "{title}"\n')
        f.write(f'LUT_3D_SIZE {divisions}\n')
        f.write('DOMAIN_MIN 0.0 0.0 0.0\n')
        f.write('DOMAIN_MAX 1.0 1.0 1.0\n\n')
        
        # .cube 规范遍历顺序: r 在最内层，b 在最外层 (b -> g -> r)
        for b in range(divisions):
            for g in range(divisions):
                for r in range(divisions):
                    rgb = lut[r, g, b]
                    f.write(f"{rgb[0]:.6f} {rgb[1]:.6f} {rgb[2]:.6f}\n")

def apply_3d_lut(image_rgb, lut):
    """
    对输入的 RGB 图像执行高精度 3D 快速三线性插值 (Trilinear Interpolation)
    输入:
      image_rgb: (H, W, 3) numpy 数组, float32 [0..1] 或 uint8 [0..255]
      lut: (N, N, N, 3) 3D 查找表
    输出:
      (H, W, 3) uint8 数组 [0..255]
    """
    if image_rgb.dtype == np.uint8:
        norm = image_rgb.astype(np.float32) / 255.0
    else:
        norm = np.clip(image_rgb, 0.0, 1.0)
    
    H, W, _ = norm.shape
    divisions = lut.shape[0]
    scale = divisions - 1.0
    
    # 坐标缩放并分离整数与微元 (0 <= x <= divisions - 1)
    coords = norm * scale
    c0 = np.floor(coords).astype(np.int32)
    c1 = np.clip(c0 + 1, 0, divisions - 1)
    d = coords - c0
    
    r0, g0, b0 = c0[..., 0], c0[..., 1], c0[..., 2]
    r1, g1, b1 = c1[..., 0], c1[..., 1], c1[..., 2]
    dr = d[..., 0:1]
    dg = d[..., 1:2]
    db = d[..., 2:3]
    
    # 获取三维立方体的 8 个顶点采样值
    c000 = lut[r0, g0, b0]
    c100 = lut[r1, g0, b0]
    c010 = lut[r0, g1, b0]
    c110 = lut[r1, g1, b0]
    c001 = lut[r0, g0, b1]
    c101 = lut[r1, g0, b1]
    c011 = lut[r0, g1, b1]
    c111 = lut[r1, g1, b1]
    
    # 沿 R 轴线性插值
    c00 = c000 * (1.0 - dr) + c100 * dr
    c01 = c001 * (1.0 - dr) + c101 * dr
    c10 = c010 * (1.0 - dr) + c110 * dr
    c11 = c011 * (1.0 - dr) + c111 * dr
    
    # 沿 G 轴线性插值
    c0_ = c00 * (1.0 - dg) + c10 * dg
    c1_ = c01 * (1.0 - dg) + c11 * dg
    
    # 沿 B 轴线性插值
    res = c0_ * (1.0 - db) + c1_ * db
    
    res_clamped = np.clip(res * 255.0, 0.0, 255.0).astype(np.uint8)
    return res_clamped

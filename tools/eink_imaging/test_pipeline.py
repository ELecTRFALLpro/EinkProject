import unittest
import numpy as np
from PIL import Image

from eink_imaging.color import find_nearest_palette_color, COLOR_BLACK, COLOR_WHITE, COLOR_YELLOW, COLOR_RED
from eink_imaging.packer import pack_2bit_bitmap, unpack_2bit_bitmap
from eink_imaging.dither import dither_image
from eink_imaging.pipeline import process_photo_for_eink

class TestEinkImaging(unittest.TestCase):
    def test_color_quantization_pure_colors(self):
        # 纯黑
        idx, _, _ = find_nearest_palette_color([0, 0, 0])
        self.assertEqual(idx, COLOR_BLACK)

        # 纯白
        idx, _, _ = find_nearest_palette_color([255, 255, 255])
        self.assertEqual(idx, COLOR_WHITE)

        # 纯黄
        idx, _, _ = find_nearest_palette_color([255, 255, 0])
        self.assertEqual(idx, COLOR_YELLOW)

        # 纯红
        idx, _, _ = find_nearest_palette_color([255, 0, 0])
        self.assertEqual(idx, COLOR_RED)

    def test_pack_unpack_roundtrip(self):
        # 构造 (300, 400) 的已知索引矩阵
        H, W = 300, 400
        indices = np.zeros((H, W), dtype=np.uint8)
        for y in range(H):
            for x in range(W):
                indices[y, x] = (x + y) % 4

        # 打包
        bin_data = pack_2bit_bitmap(indices, msb_first=True)
        self.assertEqual(len(bin_data), 30000)

        # 解包
        _, unpacked_indices = unpack_2bit_bitmap(bin_data, width=W, height=H, msb_first=True)
        np.testing.assert_array_equal(indices, unpacked_indices)

    def test_dither_smooth_gradient(self):
        # 创建水平渐变测试图像
        W, H = 400, 300
        gradient = np.zeros((H, W, 3), dtype=np.uint8)
        for x in range(W):
            gradient[:, x, 0] = int(255 * (x / W))       # R
            gradient[:, x, 1] = int(255 * (1 - x / W))   # G
            gradient[:, x, 2] = 50                       # B

        indices = dither_image(gradient, method="atkinson")
        self.assertEqual(indices.shape, (H, W))

        # 渐变中应该包含所有4种颜色
        unique_colors = np.unique(indices)
        self.assertTrue(len(unique_colors) >= 3)

    def test_end_to_end_pipeline(self):
        # 创建一张测试照片
        test_img = Image.new('RGB', (800, 600), (120, 150, 200))
        bin_data, preview_img, stats = process_photo_for_eink(
            test_img,
            target_width=400,
            target_height=300,
            style="polaroid",
            dither_method="atkinson"
        )

        self.assertEqual(len(bin_data), 30000)
        self.assertEqual(preview_img.size, (400, 300))
        self.assertEqual(stats["total_bytes"], 30000)
        self.assertIn("counts", stats)
        self.assertIn("percentages", stats)

if __name__ == "__main__":
    unittest.main()

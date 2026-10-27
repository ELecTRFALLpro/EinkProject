# 墨水屏 4 色图像处理与位图打包算法模块

本目录包含墨水屏相框项目的**核心图像转换管线与二进制位图打包算法**（Python 基准参考实现与自动化验证工具）。

---

## 核心算法设计与物理特性优化

4 色墨水屏（黑、白、黄、红）缺乏蓝、绿色素，且物理反射率和动态对比度（约 15:1）远低于液晶屏幕（1000:1+）。本算法模块专门做了针对性设计：

### 1. 颜色距离与感知量化 (Perceptual Redmean Metric)
- **拒绝朴素 RGB 欧氏距离**：如果使用常规欧氏距离，绿色和肤色在投影到 4 色空间时会严重偏红。
- **加权感知色差**：
  $$\Delta C = \sqrt{\left(2 + \frac{\bar{r}}{256}\right)\Delta R^2 + 4\Delta G^2 + \left(2 + \frac{255 - \bar{r}}{256}\right)\Delta B^2}$$
- **红色噪点抑制因子 (`red_damper=1.12`)**：对暖调高光（人脸肤色、天空过渡区）适度增加判定为纯红的阻尼，彻底杜绝人像出现“皮疹/暗疮”状杂色点。

### 2. 误差扩散核与蛇形扫描 (Dithering)
- **Atkinson 抖动（首选）**：
  - 经典 Macintosh 算法，每次只将 75% 的量化误差扩散给周边 6 个邻居像素，**主动丢弃 25% 误差**。
  - 相比 100% 守恒的 Floyd-Steinberg，Atkinson 能有效防止灰色地带形成泥浆状点阵，黑白对比度更高、线条更干净。
- **蛇形扫描 (Serpentine Scanning)**：
  - 偶数行从左往右，奇数行从右往左反向扩散。
  - 完全消除单向扫描带来的对角线蠕虫条纹（Worm Artifacts）。

### 3. 拍立得画框生成 (Polaroid Framing)
- 画布固定为屏幕分辨率 **400 × 300**。
- 顶部留白 16px、左右各 16px、底部留宽白 46px（拍立得经典签名区）。
- 内画幅宽高 368 × 238，边缘自动添加超细微边界分割线，避免白色背景物体与外框熔断。

### 4. 厂商硬件二进制位图打包 (2-bit Bitmap Packing)
- 400 × 300 = 120,000 像素。
- 每像素占用 2 bit：`00b` (黑), `01b` (白), `10b` (黄), `11b` (红)。
- 1 字节紧凑编码 4 个像素，高位在前 (MSB-first)：
  $$\text{Byte} = (P_0 \ll 6) \mid (P_1 \ll 4) \mid (P_2 \ll 2) \mid P_3$$
- 输出总尺寸固定为 **30,000 字节 (30 KB)**，可直接作为 NFC 数据载荷分包写入模组。

---

## 常用命令

### 1. 对任意本地图片执行处理
```bash
# 使用虚拟环境命令行工具处理你的照片
./tools/.venv/bin/python3 -m eink_imaging.cli /path/to/your_photo.jpg

# 指定算法与布局
./tools/.venv/bin/python3 -m eink_imaging.cli my_photo.png --style polaroid --dither atkinson
```

执行完成后将在同级目录生成：
- `xxx.bin`: 30,000 字节真实位图文件（通过 NFC 传输给屏幕）
- `xxx_preview.png`: 400x300 高保真墨水屏模拟预览图

### 2. 运行自动化单元测试
```bash
PYTHONPATH=tools ./tools/.venv/bin/python3 -m unittest tools/eink_imaging/test_pipeline.py
```

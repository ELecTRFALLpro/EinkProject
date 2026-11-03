# 🎨 E-Ink NFC Photo Frame 设计系统与 Figma 交付规范 (Spotify Aesthetic)

> **项目名称**：E-Ink NFC 4-Color Photo Frame (四色墨水屏复古电子相框)  
> **设计语言**：Spotify Modern Dark Aesthetic (深色沉浸、高对比排版、胶囊药丸交互、流体微质感)  
> **适用平台**：Web 响应式工作台 (Desktop Studio) & 移动端 App (iOS 393pt / Android 360dp)  
> **设计交付版本**：v1.1.0  
> **基准硬件规范**：4.01 英寸 四色 (黑/白/黄/红) 电子墨水屏，分辨率 400 × 300 px (4:3)，单帧 2-bit 封包 30,000 字节  

---

## 目录
1. [项目设计愿景与设计哲学](#1-项目设计愿景与设计哲学)
2. [Figma 画布组织与工程架构](#2-figma-画布组织与工程架构)
3. [设计令牌规范 (Design Tokens)](#3-设计令牌规范-design-tokens)
   - [3.1 色彩系统 (Color Tokens)](#31-色彩系统-color-tokens)
   - [3.2 字体排印体系 (Typography Scale)](#32-字体排印体系-typography-scale)
   - [3.3 间距与网格系统 (Spacing & Grid)](#33-间距与网格系统-spacing--grid)
   - [3.4 圆角体系 (Border Radius)](#34-圆角体系-border-radius)
   - [3.5 投影与层级深度 (Elevation & Shadows)](#35-投影与层级深度-elevation--shadows)
4. [核心组件变体与交互状态 (Component Variants & States)](#4-核心组件变体与交互状态-component-variants--states)
   - [4.1 按钮系统 (Button System)](#41-按钮系统-button-system)
   - [4.2 胶片色彩滤镜卡片 (Film LUT Card)](#42-胶片色彩滤镜卡片-film-lut-card)
   - [4.3 墨水屏物理相框模拟器 (E-ink Hardware Simulator Frame)](#43-墨水屏物理相框模拟器-e-ink-hardware-simulator-frame)
   - [4.4 抖动算法与调色控制栏 (Dithering & Parameter Slider)](#44-抖动算法与调色控制栏-dithering--parameter-slider)
   - [4.5 NFC 无线烧录与离线票据弹窗 (NFC Flash Modal)](#45-nfc-无线烧录与离线票据弹窗-nfc-flash-modal)
5. [跨端页面流与布局规范 (Page Flows & Layouts)](#5-跨端页面流与布局规范-page-flows--layouts)
   - [5.1 移动端 App 界面规范 (iOS 393pt / Android 360dp)](#51-移动端-app-界面规范-ios-393pt--android-360dp)
   - [5.2 Web 桌面端暗室工作台 (Responsive Desktop Studio)](#52-web-桌面端暗室工作台-responsive-desktop-studio)
   - [5.3 边界极限态与异常反馈规范 (Edge Cases)](#53-边界极限态与异常反馈规范-edge-cases)
6. [墨水屏特有物理动画规范 (Waveform Refresh Animation)](#6-墨水屏特有物理动画规范-waveform-refresh-animation)
7. [资源导出与切图规范 (Assets & Handoff Matrix)](#7-资源导出与切图规范-assets--handoff-matrix)

---

## 1. 项目设计愿景与设计哲学

在传统数码相框设计中，UI 往往偏向廉价电子感或繁复的文件管理器。本系统汲取 **Spotify** 的核心视觉语言，并与**复古胶片摄影（Analog Film）**及**电子纸（E-paper）物理质感**进行深度融合：

- **极致深邃的黑暗舞台 (Deep Charcoal Canvas)**：以纯粹的 `#121212` 与 `#181818` 构成深层基底，将视觉焦点无干扰地汇聚于用户的胶片摄影作品和电子纸色彩上。
- **标志性的胶囊与药丸元素 (Signature Pill Geometry)**：沿用 Spotify 最具辨识度的全圆角药丸按钮（`border-radius: 9999px`），搭配充满活力的薄荷荧光绿（`#1ED760`），呈现轻快、现代、果断的交互体验。
- **物理电子纸的显色敬畏 (Analog E-Ink Respect)**：尊重四色（黑/白/黄/红）颜料微胶囊物理电泳特性，在界面中模拟磨砂纸张反光、亚克力边框质感，以及三段式波形局部/全局闪烁刷新。
- **触手可及的触控工学 (Thumb-Friendly Ergonomics)**：移动端主操作（调色、预览、烧录）均位于下沉拇指热区，所有点击交互面积严格遵守 $\ge 44 \times 44\text{pt}$ 无障碍标准。

---

## 2. Figma 画布组织与工程架构

在 Figma 根设计文件中，建立标准模块化工程画板：

```
📁 [E-Ink Frame] - UI/UX Handoff Master
├── 📌 Cover & System Overview
├── 🎨 Design Tokens (Colors, Typography, Elevation, Spacing)
├── 🧩 Atomic Components
│    ├── Buttons (Pill Primary, Secondary, Ghost, Icon Action)
│    ├── Sliders & Steppers (Red-Damper, Contrast, Sharpness)
│    ├── Chips & Segmented Controls (Atkinson vs Floyd-Steinberg)
│    └── Dialogs & Bottom Sheets
├── 🎞️ Film Presets UI (RNI Master LUT Cards & Badges)
├── 🖼️ Hardware Frame Mockups (300x400 Display, Bezel, Paper Texture)
├── 📱 Mobile App Screens (393pt iOS & 360dp Android)
│    ├── 01_Darkroom Studio (Crop, Fit, Film LUT Shelf)
│    ├── 02_Hardware Simulator (1x / 2x, Paper Texture, Waveform Refresh)
│    ├── 03_NFC Flash Overlay (Device Ticket Verify, 30KB Payload Sync)
│    ├── 04_My Gallery & Artworks (Film Archive)
│    └── 05_Edge Cases (Network Offline, Ticket Expired, Crop Mismatch)
└── 💻 Web Desktop Studio (1440px Responsive Darkroom)
```

---

## 3. 设计令牌规范 (Design Tokens)

### 3.1 色彩系统 (Color Tokens)

#### A. Spotify 主题中性色与背景层级
| Token 变量名 | HEX 值 | 语义说明 | 适用场景 |
| :--- | :--- | :--- | :--- |
| `color-bg-base` | `#121212` | 底层画布背景 (Canvas Base) | 应用全屏背景 |
| `color-bg-surface` | `#181818` | 默认卡片容器 (Surface) | 胶片卡片、工具栏面板背景 |
| `color-bg-elevated` | `#242424` | 抬升悬停层 (Elevated / Hover) | 鼠标悬停卡片、输入框基底 |
| `color-bg-overlay` | `rgba(0, 0, 0, 0.75)` | 模态遮罩层 (Modal Backdrop) | NFC 烧录弹窗背景微晶磨砂 |
| `color-border-subtle` | `rgba(255, 255, 255, 0.08)` | 极细分割线 | 列表分割、工具条微边框 |
| `color-border-focus` | `rgba(255, 255, 255, 0.25)` | 选中态外边框 | 聚焦输入框、未选中悬停外框 |

#### B. Spotify 品牌强调色 (Accent Green)
| Token 变量名 | HEX 值 | 语义说明 |
| :--- | :--- | :--- |
| `color-accent-primary` | `#1ED760` | Spotify 标志绿 (Default CTA / Active State) |
| `color-accent-hover` | `#1FDF64` | 悬停加亮高光 (Hover) |
| `color-accent-pressed` | `#169C46` | 按下微暗收缩 (Active / Pressed) |
| `color-accent-glow` | `rgba(30, 215, 96, 0.35)` | 呼吸发光阴影 (Active Glow) |

#### C. 电子纸 4 色硬件受限物理色板 (E-Ink Hardware Gamut)
墨水屏模拟器严格使用以下物理颜料校准色值：
| 色彩定义 | 物理微胶囊粒子 | 模拟 HEX | 2-bit 硬件编码 |
| :--- | :--- | :--- | :--- |
| **黑 (Black)** | 碳黑电泳微胶囊粒子 | `#181818` | `00b` (0x00) |
| **白 (White)** | 二氧化钛散射冷白底底基 | `#F5F2EB` (纸白暖感) | `01b` (0x01) |
| **黄 (Yellow)** | 铬黄无机颜料粒子 | `#F4C430` | `10b` (0x02) |
| **红 (Red)** | 偶氮红有机高饱和颜料 | `#D8262C` | `11b` (0x03) |

#### D. 文字语义色阶 (Typography Colors)
| Token 变量名 | HEX 值 / 不透明度 | 语义角色 |
| :--- | :--- | :--- |
| `color-text-primary` | `#FFFFFF` (100%) | 页面主标题、选中状态、关键按钮文本 |
| `color-text-secondary` | `#B3B3B3` (70%) | 副标题、滤镜作者、参数标签、说明文案 |
| `color-text-tertiary` | `#727272` (45%) | 禁用状态、元数据时间戳、物理尺寸角标 |
| `color-text-on-accent` | `#000000` (100%) | 亮绿按钮内部的高反差纯黑文本 |

---

### 3.2 字体排印体系 (Typography Scale)

推荐字体族栈：
`-apple-system, BlinkMacSystemFont, "Circular Std", "Inter", "Helvetica Neue", sans-serif`

| 级别 (Level) | 逻辑字号 | 行高 (Line-Height) | 字重 (Font Weight) | 字距 (Tracking) | 用途示例 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Display** | 32pt / 32px | 38px (1.18) | 800 (ExtraBold) | -0.03em | 顶部工作台大标题、品牌 Logo |
| **Title-Large** | 24pt / 24px | 30px (1.25) | 700 (Bold) | -0.02em | 模态弹窗标题、设备状态栏标题 |
| **Title-Medium** | 18pt / 18px | 24px (1.33) | 600 (SemiBold) | -0.01em | 胶片分类栏、组件区域标题 |
| **Body-Default** | 14pt / 14px | 20px (1.42) | 400 (Regular) | 0.00em | 参数描述、滤镜感光度说明、正文 |
| **Body-Medium** | 14pt / 14px | 20px (1.42) | 600 (SemiBold) | 0.00em | 卡片主名称、列表主项、表单标签 |
| **Caption-Micro**| 11pt / 11px | 14px (1.27) | 700 (Bold) | +0.06em (大写)| "400×300 2-BIT"、"NFC READY" 胶囊标签 |

---

### 3.3 间距与网格系统 (Spacing & Grid)

基于 `4px` 基础倍数设计网格：
- `space-1` = `4px` (微距，图标与文字内嵌微调)
- `space-2` = `8px` (组件内部紧凑内边距)
- `space-3` = `12px` (卡片间隙、胶囊内边距水平方向)
- `space-4` = `16px` (移动端标准 Page Padding，卡片主内边距)
- `space-5` = `20px` (面板之间呼吸间隙)
- `space-6` = `24px` (区块间距，模态窗口内边距)
- `space-8` = `32px` (大幅段落留白)
- `space-12` = `48px` (底栏悬浮控制器安全沉浸高度)

---

### 3.4 圆角体系 (Border Radius)

- `radius-pill` = `9999px` (Spotify 经典特征：药丸按钮、状态 Tag、筛选 Chips、切换开关滑块)
- `radius-card` = `12px` (相框外壳、胶片预设卡片、参数悬浮面板)
- `radius-inner` = `8px` (相框内部嵌套屏幕、图片缩略图内边角)
- `radius-modal` = `20px` (模态弹窗、底部抽屉面板上边角)

---

### 3.5 投影与层级深度 (Elevation & Shadows)

- **Card Subtle**: `0 8px 24px rgba(0, 0, 0, 0.5)`
- **Card Active Hover**: `0 16px 36px rgba(0, 0, 0, 0.75)`
- **Spotify Green Accent Glow**: `0 0 24px rgba(30, 215, 96, 0.35)`
- **Hardware Bezel Shadow**: `0 20px 50px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.06)`

---

## 4. 核心组件变体与交互状态 (Component Variants & States)

### 4.1 按钮系统 (Button System)

| 组件形态 | 背景色 | 文本色 | 圆角 | 最小触控区域 | 状态变体 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Primary Pill** (主操作) | `#1ED760` | `#000000` (Bold) | `9999px` | 高度 `48px`, 宽自适应 (>= 96px) | Default / Hover (`#1FDF64` + Scale 1.03) / Active (Scale 0.98) / Loading |
| **Secondary Pill** (辅助) | `#FFFFFF` | `#000000` | `9999px` | 高度 `44px` | Default / Hover (`#E6E6E6`) / Active |
| **Ghost Pill** (弱操作) | `transparent` | `#FFFFFF` | `9999px` | 高度 `40px`, 边框 1px `#535353` | Default / Hover (Border `#FFFFFF`) |
| **Icon Button** (圆钮) | `rgba(255,255,255,0.08)`| `#FFFFFF` | `50%` | 44 x 44pt (移动端) | Default / Hover (Bg `0.15`) / Active |

---

### 4.2 胶片色彩滤镜卡片 (Film LUT Card)

专为用户提供的 RNI All Films 5 Pro 精选色彩库定制横向滚动的卡片架构：
- **卡片物理尺寸**：移动端宽度 `136px`，高度 `188px`；桌面端宽度 `156px`，高度 `210px`。
- **视觉构件**：
  1. **色彩模拟缩略图** (`120x96px`，4:3 比例，带圆角 `6px`)：实时应用该 3D 胶片 LUT 的画面缩略预览。
  2. **厂牌胶囊 Tag** (`11px` Bold)：`POLAROID` (黄色系) / `FUJIFILM` (绿色系) / `KODAK` (橙色系) / `ILFORD` (灰白单色)。
  3. **胶片型号主标题** (`13px` SemiBold)：如 `Polaroid 600`, `Fuji FP-100C`, `Portra 400`。
  4. **色调倾向副文案** (`11px` Regular `#B3B3B3`)：如 `温润金黄高光`, `清冷纪实正片`。
- **状态变体**：
  - *Default*：背景 `#181818`，微边框 `1px rgba(255,255,255,0.05)`。
  - *Hover*：背景微亮 `#242424`，卡片整体 `translateY(-3px)`。
  - *Selected (激活选中)*：高亮 Spotify 绿外边框 (`2px solid #1ED760`)，右上角浮现带有白色对勾的圆形绿徽章，下方阴影带绿光。

---

### 4.3 墨水屏物理相框模拟器 (E-ink Hardware Simulator Frame)

为消除“无硬件不可见”的痛点，打造**高保真物理拟真相框组件**：
- **物理比例**：严格遵循 `400 : 300` (4:3)，桌面端默认以 2x 缩放展示 (`800 × 600` px)，移动端自适应满宽 (`345 × 258` pt)。
- **物理外框材质 (Bezel)**：
  - 亚克力磨砂哑光黑外框 (`padding: 24px`，外层圆角 `16px`，背景 `#141414`)。
  - 阴刻极细银灰色金属倒角线 (`1px solid rgba(255,255,255,0.12)`)。
  - 底部中央刻印极简银色微标 `EPAPER 4.01"`。
- **纸张微质感覆盖层 (Paper Grain Texture)**：
  - 叠加一层轻微高斯噪点与双向反射微漫反射层（SVG FeTurbulence 微噪点，不透明度 `3.5%`），还原电子墨水微胶囊在自然光下的不发光纸面质感。
- **四色点阵微网格 (Subpixel Pigment Grid)**：
  - 在放大至 200% 以上时，可切换开启微电泳粒子晶格模拟，展现 0.2mm 像素间距与红黄黑颜料粒子错位交织的机械美感。

---

### 4.4 抖动算法与调色控制栏 (Dithering & Parameter Slider)

- **算法分段切换器 (Segmented Pills)**：
  - `Atkinson` (阿特金森抖动)：保留 25% 扩散残差，高锐度、人像肤色干净、无边缘拖尾，作为默认推荐模式。
  - `Floyd-Steinberg` (经典误差扩散)：100% 误差扩散，平滑细腻过渡，适合大面积天空、夕阳渐变。
- **红黄防溢出阻尼滑块 (Red Damper Slider)**：
  - 控制参数范围：`1.00` ~ `1.50` (步长 `0.01`，默认 `1.15`)。
  - 专为四色屏红黄颜料易出现大面积突兀色块定制，通过动态抑制中低饱和区域的红色电泳判定阈值，保证人像脸颊白皙温润。
- **高对比度增强滑块 (Contrast Adjust)**：
  - 范围：`0.8` ~ `1.6`，为黑白两极扩展动态范围。

---

### 4.5 NFC 无线烧录与离线票据弹窗 (NFC Flash Modal)

严格遵循原生 `<dialog>` 顶层渲染与无障碍规范：
- **触发入口**：主界面右下角/底栏醒目的药丸按钮 `⚡ 烧录至相框 (NFC Flash)`。
- **弹窗视觉层级**：
  - 背景：深色高斯模糊遮罩 (`backdrop-filter: blur(20px); background: rgba(0,0,0,0.75)`).
  - 弹窗面板：圆角 `20px`，尺寸 `380px`，背景 `#1E1E1E`，带微细发光边框。
- **内容组织**：
  1. **NFC 交互物理图示**：手机背部贴合相框天线位置的动效插画（脉冲波纹动画）。
  2. **固件签名离线票据状态**：
     - `Ed25519 Ticket Verified ✓` (显示 KeyID、有效租期倒计时、设备白名单 Hash)。
  3. **硬件数据包体量**：
     - `Payload: 30,000 Bytes (400x300 @ 2-bit Packed)`。
  4. **传输进度指示**：环形进度条 (`stroke: #1ED760`)，实时显示传输百分比与扇区校验状态。
  5. **虚拟硬件联调模拟器 (Virtual NFC Hardware Device)**：
     - 供在未采购到物理板子时，一键点击 `[模拟硬件接收与刷屏]`，在屏幕上同步触发真实硬件波形刷新动画并输出完整 Hex 报文，无缝支持功能验证。

---

## 5. 跨端页面流与布局规范 (Page Flows & Layouts)

### 5.1 移动端 App 界面规范 (iOS 393pt / Android 360dp)

- **基准适配**：逻辑像素宽度 393pt (iPhone 15/16 标准)。
- **安全区域 (Safe Area)**：
  - 顶部状态栏避让：`pt-safe = 59pt`。
  - 底部指示条避让：`pb-safe = 34pt`。
- **布局分层**：
  1. **Top Bar** (`44pt`)：左侧设备连接状态胶囊 (`● NFC Ready`)，右侧历史存档入口与设置。
  2. **Core Preview Area** (`flex-1`)：自适应居中渲染 4:3 墨水屏预览相框。
  3. **Film Shelf** (`210pt`)：横向滑动展示精选胶片 LUT（宝丽莱 600、富士 FP-100C、柯达 Portra 等），支持即点即显。
  4. **Bottom Dock** (`76pt` + Safe Area)：左侧抖动算法快速切换，右侧宽幅绿色药丸 CTA `烧录至相框`。

---

### 5.2 Web 桌面端暗室工作台 (Responsive Desktop Studio)

- **基准分辨率**：`1440 × 900` px 及以上。
- **双栏三区暗室架构**：
  - **左侧工作流导航栏 (Sidebar, 260px)**：Spotify 经典垂直导航，包含「暗室工坊 (Darkroom)」、「胶片库 (Film Presets)」、「设备与凭证 (Devices & Tickets)」、「相框相册 (My Artworks)」。
  - **中央核心画布区 (Main Studio, flex-1)**：
    - 大面积沉浸画布，提供图片拖拽上传、4:3 比例智能裁剪器、原图 vs 墨水屏对比滑块 (Before / After Split-View)。
  - **右侧硬件参数与控制台 (Inspector, 380px)**：
    - 400x300 真实点阵相框拟真模拟器（支持全屏、1x/2x 放大、高斯噪点切换）。
    - 抖动算法调优 (Atkinson / Floyd-Steinberg)、红黄阻尼曲线、明暗伽马微调。
    - 固件离线票据验签面板与 30KB 二进制 `.bin` 文件下载。

---

### 5.3 边界极限态与异常反馈规范 (Edge Cases)

| 场景分类 | 界面表现与反馈规范 | 恢复动作 |
| :--- | :--- | :--- |
| **未上传图片 (Empty State)** | 相框内部展示细腻四色测试图（复古色条标定卡），并浮现虚线拖拽区域与 `点击或拖入照片` 药丸按钮。 | 支持点击系统相册或一键加载 sample 摄影作品。 |
| **图片比例不符 (Aspect Mismatch)** | 自动以 4:3 为居中裁切基准，提供自由平移缩放工具与「自动填充留白框 (Polaroid Frame)」切换开关。 | 一键切换全图留白居中或满屏裁剪。 |
| **NFC 传输中断 / 离开感应区** | 模态弹窗环形进度变红，提示 `感应断开，请将手机贴紧相框背面天线`，保留已生成的 30KB 封包无需重算。 | 靠近后自动断点续传。 |
| **设备凭证离线过期 (Ticket Expired)** | 设备标签出现黄色告警 `需联网更新安全凭证`，提示离线防盗机制已锁定。 | 联网后一键自动向后端请求签发新 Ed25519 Ticket。 |

---

## 6. 墨水屏特有物理动画规范 (Waveform Refresh Animation)

四色电泳墨水屏在物理写入时必须经历电泳粒子复位过程。为了让前端模拟器达到惊艳的仿真度，定义标准 CSS/JS **三阶段波形刷新动画 (Electrophoretic Refresh Waveform)**：

```
[Phase 1: 全局反相闪烁] -> [Phase 2: 黑白红黄粒子分离震荡] -> [Phase 3: 沉降并呈现最终画面]
   (0.0s - 0.6s)                  (0.6s - 1.4s)                   (1.4s - 2.0s)
```

1. **Phase 1 (清屏复位阶段)**：
   - 当前画面反相为高对比负片，伴随 2 次快速全黑全白闪烁交替（消除残影与极性记忆）。
2. **Phase 2 (色彩粒子激活震荡)**：
   - 画面呈现高对比红黄噪点微频闪烁（模拟电极给高压交变脉冲激活带电微胶囊）。
3. **Phase 3 (颜料粒子稳态呈现)**：
   - 噪点迅速收敛，由上至下（或由中心向外）平滑渗入最终经 Atkinson 抖动渲染后的四色墨水屏画面，呈现静止物理纸张质感。

---

## 7. 资源导出与切图规范 (Assets & Handoff Matrix)

### 7.1 Web 端资源
- **图标体系**：全量采用 SVG 矢量图标（`viewBox="0 0 24 24"`，统一 `currentColor` 填充）。
- **LUT 预设资源**：标准 `.cube` 3D 查色表文件或紧凑型 3D WebGL 纹理贴图。

### 7.2 移动端资源导出切片矩阵
- **iOS 导出规格**：PDF 矢量图 (Preserve Vector Data) 或 PNG `@1x` / `@2x` / `@3x`。
- **Android 导出规格**：Vector Asset (XML) 或 PNG (`mdpi`, `hdpi`, `xhdpi`, `xxhdpi`, `xxxhdpi`)。
- **切图命名标准**：
  - 图标：`ic_nfc_flash_24.svg`, `ic_film_roll_24.svg`
  - 材质：`texture_paper_grain.png`
  - 硬件相框素材：`frame_bezel_acrylic_400x300.svg`

---
*本文档为 EinkProject 官方设计规范资产，已与后端 Go API 与前端 WebGL/Canvas 抖动管线严格参数对齐。*

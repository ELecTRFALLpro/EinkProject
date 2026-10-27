from PIL import Image, ImageEnhance, ImageFilter, ImageOps
import numpy as np

def apply_eink_enhancements(img, contrast=1.25, saturation=1.20, sharpness=1.30):
    """
    墨水屏专属画质增强补偿。
    针对反射式墨水屏对比度低、高光发暗、色彩饱和度低的物理特性进行预补偿。
    """
    # 1. 饱和度提升（让黄色和红色更容易与黑白灰阶分离）
    if saturation != 1.0:
        enhancer = ImageEnhance.Color(img)
        img = enhancer.enhance(saturation)

    # 2. 对比度 S 曲线补偿
    if contrast != 1.0:
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(contrast)

    # 3. 边缘锐化补偿（避免误差扩散抖动后微小轮廓细节模糊）
    if sharpness != 1.0:
        enhancer = ImageEnhance.Sharpness(img)
        img = enhancer.enhance(sharpness)

    return img


def fit_or_crop(img, target_w, target_h):
    """
    居中智能裁切并缩放到目标分辨率 (target_w, target_h)
    """
    img = ImageOps.exif_transpose(img) # 纠正手机拍照 EXIF 旋转
    if img.mode != 'RGB':
        img = img.convert('RGB')
    return ImageOps.fit(img, (target_w, target_h), method=Image.Resampling.LANCZOS)


def create_polaroid_frame(user_img, target_w=400, target_h=300, 
                          top_margin=16, side_margin=16, bottom_margin=46,
                          inner_border=True):
    """
    生成经典拍立得相框布局：
    整画布尺寸 400x300，底边留出加宽空白区（拍立得经典留白）。
    """
    canvas = Image.new('RGB', (target_w, target_h), (255, 255, 255))

    photo_w = target_w - (side_margin * 2)
    photo_h = target_h - top_margin - bottom_margin
    assert photo_w > 0 and photo_h > 0, "Margins too large for target resolution"

    # 将用户图片裁切适配内画幅
    photo = fit_or_crop(user_img, photo_w, photo_h)

    # 可选添加 1 像素超细浅灰内边框（避免照片白色区域与外边框融为一体）
    if inner_border:
        photo_arr = np.array(photo)
        photo_arr[0, :] = [210, 210, 210]
        photo_arr[-1, :] = [210, 210, 210]
        photo_arr[:, 0] = [210, 210, 210]
        photo_arr[:, -1] = [210, 210, 210]
        photo = Image.fromarray(photo_arr)

    canvas.paste(photo, (side_margin, top_margin))
    return canvas

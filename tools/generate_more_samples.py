import numpy as np
from PIL import Image, ImageDraw, ImageFilter

def create_portrait():
    w, h = 600, 450
    img = Image.new('RGB', (w, h), (45, 52, 60))
    draw = ImageDraw.Draw(img)
    
    # 柔和背景光晕
    for r in range(250, 0, -5):
        alpha = int(30 * (1 - r / 250))
        draw.ellipse([300 - r, 200 - r, 300 + r, 200 + r], fill=(70 + alpha, 80 + alpha, 95 + alpha))
    
    # 颈部与身体剪裁
    draw.polygon([(240, 450), (270, 290), (330, 290), (360, 450)], fill=(215, 170, 145))
    draw.polygon([(180, 450), (240, 340), (360, 340), (420, 450)], fill=(32, 35, 42)) # 黑色衣领
    
    # 头部轮廓 (暖调肤色)
    draw.ellipse([245, 120, 355, 290], fill=(235, 185, 155))
    
    # 发型 (深褐色)
    draw.ellipse([235, 90, 365, 230], fill=(42, 28, 22))
    draw.polygon([(230, 180), (220, 330), (260, 240)], fill=(42, 28, 22))
    draw.polygon([(370, 180), (380, 330), (340, 240)], fill=(42, 28, 22))
    
    # 五官特征与红润脸颊
    draw.ellipse([260, 205, 285, 225], fill=(235, 140, 130)) # 腮红
    draw.ellipse([315, 205, 340, 225], fill=(235, 140, 130))
    # 嘴唇
    draw.ellipse([285, 240, 315, 255], fill=(195, 75, 75))
    # 眼睛与眉毛
    draw.line([(265, 175), (288, 175)], fill=(35, 25, 20), width=3)
    draw.line([(312, 175), (335, 175)], fill=(35, 25, 20), width=3)
    draw.ellipse([270, 183, 283, 193], fill=(25, 20, 18))
    draw.ellipse([317, 183, 330, 193], fill=(25, 20, 18))
    
    return img

def create_street():
    w, h = 600, 450
    img = Image.new('RGB', (w, h), (180, 200, 220)) # 清冷天空
    draw = ImageDraw.Draw(img)
    
    # 远景建筑
    draw.rectangle([60, 160, 180, 450], fill=(120, 130, 145))
    draw.rectangle([200, 120, 320, 450], fill=(95, 105, 120))
    draw.rectangle([340, 180, 460, 450], fill=(130, 140, 155))
    draw.rectangle([480, 140, 580, 450], fill=(110, 120, 135))
    
    # 暖色灯光与招牌 (红与黄)
    draw.rectangle([220, 260, 300, 300], fill=(235, 50, 40)) # 红色霓虹
    draw.rectangle([80, 280, 160, 320], fill=(245, 200, 35)) # 黄色灯箱
    draw.rectangle([360, 310, 440, 350], fill=(240, 190, 40))
    
    # 街道地面 (深灰沥青与反光)
    for y in range(350, h):
        ratio = (y - 350) / 100
        val = int(50 + 20 * ratio)
        draw.line([(0, y), (w, y)], fill=(val, val, val + 5))
    
    # 路灯光斑
    draw.ellipse([250, 360, 270, 410], fill=(240, 200, 80))
    draw.ellipse([110, 370, 130, 420], fill=(230, 70, 60))
    
    return img

if __name__ == "__main__":
    p = create_portrait()
    p.save("frontend/assets/samples/portrait.png")
    s = create_street()
    s.save("frontend/assets/samples/street.png")
    print("Generated portrait.png and street.png")

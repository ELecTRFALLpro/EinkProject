import os
import json
import numpy as np
from PIL import Image
from eink_imaging.lut import apply_3d_lut

def parse_cube(cube_path):
    with open(cube_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    size = 0
    triplets = []
    for line in lines:
        line = line.strip()
        if not line or line.startswith('#'): continue
        if line.startswith('LUT_3D_SIZE'):
            size = int(line.split()[1])
            continue
        if line.startswith('TITLE') or line.startswith('DOMAIN'):
            continue
        parts = line.split()
        if len(parts) >= 3:
            triplets.append([float(parts[0]), float(parts[1]), float(parts[2])])
    
    # Cube ordering: b -> g -> r
    lut = np.zeros((size, size, size, 3), dtype=np.float32)
    idx = 0
    for b in range(size):
        for g in range(size):
            for r in range(size):
                lut[r, g, b] = triplets[idx]
                idx += 1
    return lut

manifest_path = "frontend/presets/manifest.json"
with open(manifest_path, 'r', encoding='utf-8') as f:
    presets = json.load(f)

base_img = Image.open("frontend/assets/samples/sunset.png").convert("RGB")
base_thumb = base_img.resize((140, 105), Image.Resampling.LANCZOS)
base_arr = np.array(base_thumb)

os.makedirs("frontend/assets/thumbs", exist_ok=True)

for p in presets:
    cube_file = os.path.join("frontend/presets/cube", p["cube_file"])
    if os.path.exists(cube_file):
        lut = parse_cube(cube_file)
        graded_arr = apply_3d_lut(base_arr, lut)
        graded_img = Image.fromarray(graded_arr)
        out_path = f"frontend/assets/thumbs/{p['id']}.png"
        graded_img.save(out_path)
        print(f"Generated thumbnail: {out_path}")

print("All preset thumbnails generated successfully!")

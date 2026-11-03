import os
import glob
import json
from eink_imaging.lut import load_xmp_3d_lut, save_lut_as_cube

def main():
    curated_dir = "tools/presets/rni_curated"
    out_cube_dir = "tools/presets/cube"
    os.makedirs(out_cube_dir, exist_ok=True)

    xmp_files = sorted(glob.glob(f"{curated_dir}/*.xmp"))
    print(f"找到 {len(xmp_files)} 个 RNI Master 胶片配置文件，开始转换...")

    manifest = []
    for path in xmp_files:
        base = os.path.basename(path).replace(" profile.xmp", "").replace(".xmp", "")
        # 生成安全标识符
        safe_id = base.lower().replace(" ", "_").replace("-", "_")
        cube_path = os.path.join(out_cube_dir, f"{safe_id}.cube")
        
        try:
            lut = load_xmp_3d_lut(path)
            save_lut_as_cube(lut, cube_path, title=base)
            file_size_kb = os.path.getsize(cube_path) / 1024
            print(f"  ✅ 成功导出: {base} -> {cube_path} ({lut.shape[0]}x{lut.shape[0]}x{lut.shape[0]}, {file_size_kb:.1f} KB)")
            
            # 分类
            cat = "film"
            if "polaroid" in safe_id or "instax" in safe_id or "fp_100c" in safe_id:
                cat = "instant"
            elif "astia" in safe_id or "portra" in safe_id:
                cat = "portrait"
            elif "hp5" in safe_id or "tri_x" in safe_id:
                cat = "mono"
            elif "kodachrome" in safe_id:
                cat = "vintage"

            manifest.append({
                "id": safe_id,
                "name": base,
                "category": cat,
                "cube_file": f"{safe_id}.cube",
                "divisions": lut.shape[0],
            })
        except Exception as e:
            print(f"  ❌ 转换失败 {base}: {e}")

    with open(os.path.join(out_cube_dir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"\n🎉 转换全部完成！生成了 {len(manifest)} 款专业胶片 3D LUT 文件。")

if __name__ == "__main__":
    main()

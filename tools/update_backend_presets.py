import re

preset_service_path = "server/internal/service/preset_service.go"
with open(preset_service_path, "r", encoding="utf-8") as f:
    code = f.read()

# Let's see how filters are defined
print("Length of preset_service.go:", len(code))

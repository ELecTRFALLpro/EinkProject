with open('frontend/js/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = '<img src="assets/samples/sunset.png" alt="${preset.name}" loading="lazy">'
replacement = '<img src="assets/thumbs/${preset.id}.png" alt="${preset.name}" loading="lazy">'

if target in content:
    content = content.replace(target, replacement)
    with open('frontend/js/app.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Replaced thumbnail target in app.js")
else:
    print("Target string not found in app.js")

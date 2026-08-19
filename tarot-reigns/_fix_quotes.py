"""Fix Chinese quotes in JSON"""
with open("data/cards.json", "r", encoding="utf-8") as f:
    content = f.read()

# Replace left/right double quotation marks
content = content.replace("\u201c", "\u300c").replace("\u201d", "\u300d")

with open("data/cards.json", "w", encoding="utf-8") as f:
    f.write(content)

print("Fixed!")

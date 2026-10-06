from io import BytesIO
import json
from pathlib import Path
import re
import sys

root = Path(__file__).resolve().parent.parent
local_tools = root / ".cache/font-tools"
if local_tools.is_dir():
    sys.path.insert(0, str(local_tools))
from fontTools.ttLib import TTFont

native_root = Path(__import__("os").environ.get("NINHO_NATIVE_PROJECT", str(Path.home() / "RiderProjects/Ninho")))
target = native_root / "Ninho.Windows/Assets/Fonts"
check = "--check" in sys.argv
target.mkdir(parents=True, exist_ok=True)

# Fraunces.ttf is retained only for the pre-parity native build's 600-weight URI.
faces = [
    ("dm-sans", 400, "DMSans.ttf", True),
    ("dm-sans", 500, "DMSans-Medium.ttf", True),
    ("dm-sans", 600, "DMSans-SemiBold.ttf", True),
    ("dm-sans", 700, "DMSans-Bold.ttf", True),
    ("fraunces", 500, "Fraunces-Medium.ttf", True),
    ("fraunces", 600, "Fraunces.ttf", False),
]
source_imports = set(re.findall(
    r'@fontsource/([^/]+)/([0-9]+)\.css',
    (root / "src/renderer/main.tsx").read_text(encoding="utf-8"),
))
included_imports = {(family, str(weight)) for family, weight, _, original in faces if original}
if source_imports != included_imports:
    raise ValueError(f"Original font imports changed: {source_imports ^ included_imports}")


def emit(name, content):
    path = target / name
    if check:
        if not path.exists() or path.read_bytes() != content:
            raise ValueError(f"Stale native font asset: {path}; run prepare-native-font.py")
    else:
        path.write_bytes(content)


manifest = []
for family, weight, filename, original in faces:
    package = root / "node_modules/@fontsource" / family
    source = package / "files" / f"{family}-latin-{weight}-normal.woff"
    # Preserving head.modified makes repeated generation byte-identical.
    font = TTFont(source, recalcTimestamp=False)
    if font["OS/2"].usWeightClass != weight:
        raise ValueError(f"Unexpected source weight: {source}")
    names = {
        name_id: sorted({name.toUnicode() for name in font["name"].names if name.nameID == name_id})
        for name_id in (1, 2, 4, 6)
    }
    if any(len(values) != 1 for values in names.values()):
        raise ValueError(f"Ambiguous font naming: {source}")
    font.flavor = None
    output = BytesIO()
    font.save(output)
    ttf = output.getvalue()
    reopened = TTFont(BytesIO(ttf), recalcTimestamp=False)
    for table in ("glyf", "hmtx", "hhea", "OS/2", "cmap", "name"):
        if font[table].compile(font) != reopened[table].compile(reopened):
            raise ValueError(f"Changed {table} table while expanding {source}")
    emit(filename, ttf)
    manifest.append({
        "file": filename,
        "family": names[1][0],
        "style": names[2][0],
        "fullName": names[4][0],
        "postScriptName": names[6][0],
        "weight": weight,
        "fontFamilyUri": f"ms-appx:///Assets/Fonts/{filename}#{names[1][0]}",
        "importedByOriginalApp": original,
        "source": str(source.relative_to(root)).replace("\\", "/"),
    })

for family, license_name in [("dm-sans", "DMSans-LICENSE.txt"), ("fraunces", "Fraunces-LICENSE.txt")]:
    emit(license_name, (root / "node_modules/@fontsource" / family / "LICENSE").read_bytes())
emit("font-manifest.json", (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
print(f"{'Verified' if check else 'Generated'} {len(faces)} native font faces; five exact original imports plus one legacy compatibility face.")

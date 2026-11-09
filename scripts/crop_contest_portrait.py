"""Crop a P-idol portrait from a 1080×2424 contest loadout capture.

Run from the repository root with Pillow installed:
  python3 -m scripts.crop_contest_portrait ID CAPTURE.png
"""

import argparse
from pathlib import Path

from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("id", type=int)
parser.add_argument("capture", type=Path)
args = parser.parse_args()

with Image.open(args.capture) as image:
    if image.size != (1080, 2424):
        parser.error("the capture must be 1080×2424 pixels")
    portrait = image.crop((40, 200, 168, 370)).resize((96, 128))

output = Path("packages/gakumas-images/images/pIdols") / f"{args.id}.png"
portrait.save(output)
print(output)

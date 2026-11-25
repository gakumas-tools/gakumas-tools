import csv
import os
import shutil

from PIL import Image, ImageDraw

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DATA_ROOT = os.path.join(REPO_ROOT, ".classifier-data")
GK_IMG_ROOT = os.path.join(REPO_ROOT, "gk-img", "docs")
GAKUMAS_DATA_CSV = os.path.join(
    REPO_ROOT, "packages", "gakumas-data", "csv"
)

# Class "0" is the empty-slot placeholder. It has no entry in gakumas-data and
# no icon in gk-img, so prepare seeds a neutral gray icon and preserves any
# user-collected training images in the folder.
EMPTY_CLASS_ID = "0"
EMPTY_ICON_SIZE = 64
EMPTY_ICON_COLOR = (200, 200, 200)
# Class "-1" (skill cards only) is a card the game's nav pill covers, so the
# reader can say it can't see the card instead of guessing one. Its gallery
# entry is the mean embedding of COVERED_REFERENCE_IDS' icons (and the empty
# icon) with a pill drawn across them, the way covered cards appear on short
# screens.
COVERED_CLASS_ID = "-1"
COVERED_REFERENCE_IDS = [str(i) for i in range(5, 500, 15)]


ENTITY_CONFIG = {
    "p_item": {
        "csv_filename": "p_items.csv",
        "icon_dir": os.path.join(GK_IMG_ROOT, "p_items", "icons"),
        "data_dir": os.path.join(DATA_ROOT, "p_items"),
        "filter": lambda entity: entity.get("sourceType") != "produce",
    },
    "skill_card": {
        "csv_filename": "skill_cards.csv",
        "icon_dir": os.path.join(GK_IMG_ROOT, "skill_cards", "icons"),
        "data_dir": os.path.join(DATA_ROOT, "skill_cards"),
        "filter": lambda entity: True,
    },
}


def load_entities(entity_type):
    csv_path = os.path.join(GAKUMAS_DATA_CSV, ENTITY_CONFIG[entity_type]["csv_filename"])
    with open(csv_path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def load_allowed_ids(entity_type):
    entity_filter = ENTITY_CONFIG[entity_type]["filter"]
    return {str(e["id"]) for e in load_entities(entity_type) if entity_filter(e)}


def load_upgraded_ids(entity_type):
    return {str(e["id"]) for e in load_entities(entity_type) if e.get("upgraded") == "TRUE"}


def empty_icon():
    return Image.new("RGB", (EMPTY_ICON_SIZE, EMPTY_ICON_SIZE), EMPTY_ICON_COLOR)


def has_covered_class(entity_type):
    return entity_type == "skill_card"


def draw_covered(image):
    image = image.convert("RGB").resize((EMPTY_ICON_SIZE, EMPTY_ICON_SIZE), Image.BILINEAR)
    size = EMPTY_ICON_SIZE
    top, bottom = round(size * 0.22), round(size * 0.78)
    overlay = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rounded_rectangle((-size, top, size * 2, bottom), radius=(bottom - top) // 2, fill=(140, 140, 140, 205))
    image = Image.alpha_composite(image.convert("RGBA"), overlay)
    draw = ImageDraw.Draw(image)
    middle, radius = size / 2, (bottom - top) * 0.25
    draw.ellipse((middle - radius, size / 2 - radius, middle + radius, size / 2 + radius), outline=(245, 245, 245, 255), width=2)
    draw.line((size * 0.2, size * 0.38, size * 0.2, size * 0.62), fill=(245, 245, 245, 255), width=1)
    return image.convert("RGB")


def covered_references(entity_type):
    icons = dict(icon_classes(entity_type))
    images = [Image.open(icons[i]) for i in COVERED_REFERENCE_IDS if i in icons]
    return [draw_covered(im) for im in [empty_icon(), *images]]


def icon_classes(entity_type):
    # Skill card art variants are named "<id>_<idol id>" and stay separate classes.
    config = ENTITY_CONFIG[entity_type]
    allowed_ids = load_allowed_ids(entity_type)
    return sorted(
        (name, os.path.join(config["icon_dir"], filename))
        for filename in os.listdir(config["icon_dir"])
        for name, ext in [os.path.splitext(filename)]
        if ext == ".webp" and name.split("_")[0] in allowed_ids
    )


def prepare_entity(entity_type):
    config = ENTITY_CONFIG[entity_type]
    os.makedirs(config["data_dir"], exist_ok=True)

    empty_icon_path = os.path.join(config["data_dir"], EMPTY_CLASS_ID, "icon.webp")
    if not os.path.exists(empty_icon_path):
        os.makedirs(os.path.dirname(empty_icon_path), exist_ok=True)
        empty_icon().save(empty_icon_path, "WEBP")

    expected = {EMPTY_CLASS_ID}
    if has_covered_class(entity_type):
        covered_icon_path = os.path.join(config["data_dir"], COVERED_CLASS_ID, "icon.webp")
        os.makedirs(os.path.dirname(covered_icon_path), exist_ok=True)
        draw_covered(empty_icon()).save(covered_icon_path, "WEBP", lossless=True)
        expected.add(COVERED_CLASS_ID)

    classes = icon_classes(entity_type)
    for name, path in classes:
        class_dir = os.path.join(config["data_dir"], name)
        os.makedirs(class_dir, exist_ok=True)
        shutil.copy(path, os.path.join(class_dir, "icon.webp"))

    expected |= {name for name, _ in classes}
    extra_dirs = sorted(
        name
        for name in os.listdir(config["data_dir"])
        if os.path.isdir(os.path.join(config["data_dir"], name)) and name not in expected
    )
    if extra_dirs:
        print(
            f"  warning: {len(extra_dirs)} {entity_type} folder(s) in "
            f"{config['data_dir']} have no matching icon and are ignored: "
            f"{', '.join(extra_dirs[:5])}"
            + (" ..." if len(extra_dirs) > 5 else "")
        )

    print(f"  {entity_type}: {len(classes)} icons")
    return sorted(expected)

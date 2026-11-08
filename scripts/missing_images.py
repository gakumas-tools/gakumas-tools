#!/usr/bin/env python3
"""List released entries that have no image yet: skill cards, P-items and P-drinks without an
icon or details PNG, and p-idols without a portrait. Released means neither the entry nor, for a
+ row, its base is in hidden.js's HIDDEN_ lists (previews have no images until their Update).
Run from the gakumas-tools checkout root. Exits 1 when anything is missing.

  python3 -m scripts.missing_images [--since ID]   only IDs from ID up (default: the last 60 of each type)
  pnpm check:images                                every ID (--since 0)

Stdlib only.
"""
import argparse, csv, os, re, sys

DATA = "packages/gakumas-data/csv"
IMAGES = "packages/gakumas-images/images"
# csv file, image folder, whether it has icons and details (else one portrait), HIDDEN_ list
TYPES = [
    ("skill_cards.csv", "skillCards", True, "HIDDEN_CARD_IDS"),
    ("p_items.csv", "pItems", True, "HIDDEN_ITEM_IDS"),
    ("p_drinks.csv", "pDrinks", True, None),
    ("p_idols.csv", "pIdols", False, "HIDDEN_P_IDOL_IDS"),
]


def hidden(name):
    if not name:
        return set()
    text = open("packages/gakumas-data/utils/hidden.js", encoding="utf-8").read()
    m = re.search(name + r"\s*=\s*(?:new Set\()?\[([^\]]*)\]", text)
    return {int(n) for n in re.findall(r"\d+", m.group(1))} if m else set()


def has(folder, id_):
    """An image for this ID: <id>.png, or per-idol ones named <id>_<idolId>.png."""
    if not os.path.isdir(folder):
        return False
    return any(f == f"{id_}.png" or f.startswith(f"{id_}_") for f in os.listdir(folder))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--since", type=int)
    a = p.parse_args()
    if not os.path.isdir(DATA):
        sys.exit("run this from the gakumas-tools checkout root")
    entries, portraits = [], []
    for file, folder, details, hidden_list in TYPES:
        path = os.path.join(DATA, file)
        if not os.path.exists(path):
            continue
        rows = [r for r in csv.DictReader(open(path, encoding="utf-8")) if r.get("id", "").isdigit()]
        ids = sorted(int(r["id"]) for r in rows)
        since = a.since if a.since is not None else (ids[-60] if len(ids) > 60 else 0)
        skip = hidden(hidden_list)
        by_name = {r.get("name", ""): int(r["id"]) for r in rows}
        base = os.path.join(IMAGES, folder)
        for r in rows:
            id_, name = int(r["id"]), r.get("name", "")
            if id_ < since or id_ in skip or (name.endswith("+") and by_name.get(name[:-1]) in skip):
                continue
            if not details:
                if not has(base, id_):
                    portraits.append(str(id_))
                continue
            kinds = [k for k in ("icons", "details") if not has(os.path.join(base, k), id_)]
            if kinds:
                entries.append(f"{folder} {id_} {name}: no {' or '.join(kinds)}")
    print("\n".join(entries) if entries else "every released card, item and drink has its images")
    if portraits:
        print(f"p-idol portraits missing: {', '.join(portraits)}")
    if entries or portraits:
        sys.exit(1)


if __name__ == "__main__":
    main()

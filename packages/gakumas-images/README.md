# gakumas-images

Image utility for Gakumas Tools. Exports a function that returns an object containing image sources given a gakumas-data entity.

## Adding images

Source PNGs live in `images/<type>/<id>.png` (skill card icons that differ per idol are `<id>_<idolId>.png`). The app loads resized webps from [gk-img](https://github.com/gakumas-tools/gk-img), a submodule at `gk-img/` served at gkimg.ris.moe, so a new image touches both repos:

1. Add the PNGs under `images/`.
2. From the repo root, run `pnpm --filter gakumas-images generate` to update each `imports.js` and `keys.json`, then `python -m scripts.generate` to write the webps into `gk-img/docs/`.
3. Commit and push gk-img.
4. Commit the PNGs, the manifests and the updated `gk-img` submodule pointer, then push gakumas-tools.

For a 1080×2424 contest loadout capture, crop the P-idol portrait from the
repository root with Pillow installed:

```sh
python3 -m scripts.crop_contest_portrait ID CAPTURE.png
```

The crop matches the existing 96×128 portraits. Check its framing before
generating the manifests and WebP.

`scripts/generate.py` skips webps that already exist, so delete the old webp when replacing an image.

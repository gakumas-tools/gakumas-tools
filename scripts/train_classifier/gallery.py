import json
import os

import numpy as np
import onnx
import onnxruntime as ort
from onnx import numpy_helper
from PIL import Image

from .prepare import (
    COVERED_CLASS_ID,
    EMPTY_CLASS_ID,
    REPO_ROOT,
    covered_references,
    empty_icon,
    has_covered_class,
    icon_classes,
)

INPUT_SIZE = 64
GALLERY_INITIALIZER = "gallery"
UNCHANGED_TOLERANCE = 1e-3
BATCH_SIZE = 256

PUBLIC_DIR = os.path.join(REPO_ROOT, "gakumas-tools", "public")


def onnx_path(entity_type):
    return os.path.join(PUBLIC_DIR, f"{entity_type}_model.onnx")


def classes_path(entity_type):
    return os.path.join(PUBLIC_DIR, f"{entity_type}_classes.json")


def to_input(image):
    image = image.convert("RGB").resize((INPUT_SIZE, INPUT_SIZE), Image.BILINEAR)
    return np.asarray(image, dtype=np.float32).transpose(2, 0, 1) / 255


def embed(session, images):
    batches = [
        session.run(
            ["embedding"],
            {"input": np.stack([to_input(im) for im in images[i : i + BATCH_SIZE]])},
        )[0]
        for i in range(0, len(images), BATCH_SIZE)
    ]
    return np.concatenate(batches)


def reference_images(entity_type):
    classes, images = [EMPTY_CLASS_ID], [empty_icon()]
    for name, path in icon_classes(entity_type):
        classes.append(name)
        images.append(Image.open(path))
    return classes, images


def entity_id(class_name):
    return class_name.split("_")[0]


def nearest_other_entity(gallery, classes, index):
    similarities = gallery[:, index] @ gallery
    for j in np.argsort(-similarities):
        if entity_id(classes[j]) != entity_id(classes[index]):
            return classes[j], float(similarities[j])
    return None, 0.0


def refresh(entity_type):
    model = onnx.load(onnx_path(entity_type))
    initializer = next(i for i in model.graph.initializer if i.name == GALLERY_INITIALIZER)
    old_gallery = numpy_helper.to_array(initializer)

    session = ort.InferenceSession(model.SerializeToString())
    classes, images = reference_images(entity_type)
    gallery = embed(session, images).T.astype(np.float32)
    if has_covered_class(entity_type):
        mean = embed(session, covered_references(entity_type)).mean(0)
        classes.insert(0, COVERED_CLASS_ID)
        gallery = np.concatenate([(mean / np.linalg.norm(mean))[:, None], gallery], 1).astype(np.float32)

    old_classes = []
    if os.path.exists(classes_path(entity_type)):
        with open(classes_path(entity_type)) as f:
            old_classes = json.load(f)
    if (
        old_classes == classes
        and old_gallery.shape == gallery.shape
        and np.abs(old_gallery - gallery).max() < UNCHANGED_TOLERANCE
    ):
        return None

    initializer.CopyFrom(numpy_helper.from_array(gallery, GALLERY_INITIALIZER))
    onnx.checker.check_model(model)
    onnx.save(model, onnx_path(entity_type))
    with open(classes_path(entity_type), "w") as f:
        json.dump(classes, f)

    added = sorted(set(classes) - set(old_classes), key=classes.index)
    return {
        "classes": len(classes),
        "added": [
            (name, *nearest_other_entity(gallery, classes, classes.index(name)))
            for name in added
        ],
        "removed": sorted(set(old_classes) - set(classes)),
    }


def print_summary(entity_type, summary):
    if summary is None:
        print(f"  {entity_type}: gallery already up to date")
        return
    print(
        f"  {entity_type}: {summary['classes']} classes, "
        f"{len(summary['added'])} added, {len(summary['removed'])} removed"
    )
    for name, nearest, similarity in summary["added"]:
        print(f"    + {name} (nearest other entity: {nearest}, cos {similarity:.3f})")
    for name in summary["removed"]:
        print(f"    - {name}")

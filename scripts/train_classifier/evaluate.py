import os
import random
import tempfile

import numpy as np
import onnxruntime as ort
from PIL import Image

from . import gallery
from .prepare import EMPTY_CLASS_ID
from .train import class_images, export_onnx, train_ensemble

HELD_OUT_CLASS_FRACTION = 0.3
SEEN_CROP_FRACTION = 0.15


def split(entity_type, class_names, seed):
    rng = random.Random(seed)
    crops = {
        name: [p for p in class_images(entity_type, name) if os.path.basename(p) != "icon.webp"]
        for name in class_names
    }
    crop_classes = sorted(n for n, paths in crops.items() if paths and n != EMPTY_CLASS_ID)
    held_out = rng.sample(crop_classes, round(len(crop_classes) * HELD_OUT_CLASS_FRACTION))
    unseen = set(held_out[: len(held_out) // 2])
    icon_only = set(held_out[len(held_out) // 2 :])

    train, tests = [], {"unseen": [], "icon only": [], "seen": []}
    for name in class_names:
        if name in unseen:
            tests["unseen"] += [(p, name) for p in crops[name]]
            continue
        icon = [p for p in class_images(entity_type, name) if os.path.basename(p) == "icon.webp"]
        train += [(p, name) for p in icon]
        for path in crops[name]:
            if name in icon_only:
                tests["icon only"].append((path, name))
            elif name != EMPTY_CLASS_ID and rng.random() < SEEN_CROP_FRACTION:
                tests["seen"].append((path, name))
            else:
                train.append((path, name))
    return train, tests


def decode(similarities, classes):
    ids = np.array([gallery.entity_id(c) for c in classes])
    return ids[similarities.argmax(1)]


def evaluate_entity(entity_type, class_names, epochs, device, seed=0):
    train, tests = split(entity_type, class_names, seed)
    train_classes = sorted({name for _, name in train})
    index = {name: i for i, name in enumerate(train_classes)}
    print(f"\nevaluating {entity_type}: {len(train_classes)} trained classes, {len(train)} images")
    encoder = train_ensemble(
        entity_type, [(p, index[n]) for p, n in train], train_classes, device, epochs
    )

    with tempfile.TemporaryDirectory() as tmp:
        model_path = os.path.join(tmp, "model.onnx")
        export_onnx(encoder, model_path)
        session = ort.InferenceSession(model_path)
        classes, images = gallery.reference_images(entity_type)
        reference = gallery.embed(session, images)
        for name, items in tests.items():
            if not items:
                continue
            crops = gallery.embed(session, [Image.open(p) for p, _ in items])
            predicted = decode(crops @ reference.T, classes)
            truth = np.array([gallery.entity_id(n) for _, n in items])
            errors = [f"{n}->{p}" for (_, n), p, t in zip(items, predicted, truth) if p != t]
            print(
                f"  {name}: {np.mean(predicted == truth):.4f} ({len(items)} crops)"
                + (f"  errors: {' '.join(errors[:8])}" if errors else "")
            )

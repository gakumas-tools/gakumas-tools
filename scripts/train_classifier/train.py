import math
import os
import random

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image

from . import gallery
from .augment import augment
from .models import INPUT_SIZE, CosineMarginHead, Encoder, EnsembleEncoder, PrototypeClassifier
from .prepare import COVERED_CLASS_ID, ENTITY_CONFIG, has_covered_class, load_upgraded_ids

DEFAULT_EPOCHS = 120
BATCH_SIZE = 128
LEARNING_RATE = 2e-3
SOURCE_SIZE = 96
SEED = 0
# One encoder per seed, read as one (EnsembleEncoder). Single seeds of the
# skill-card model miss almost disjoint sets of Idol Road cards (978 and 973
# of 1000 icons); the two together read 993.
ENSEMBLE_SEEDS = {"skill_card": (0, 1)}


def default_device():
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def load_image(path):
    image = Image.open(path).convert("RGB").resize((SOURCE_SIZE, SOURCE_SIZE), Image.BILINEAR)
    return np.asarray(image)


def to_tensor(images, device):
    return torch.from_numpy(np.stack(images)).permute(0, 3, 1, 2).contiguous().to(device)


def class_images(entity_type, class_name):
    class_dir = os.path.join(ENTITY_CONFIG[entity_type]["data_dir"], class_name)
    return sorted(
        os.path.join(class_dir, f)
        for f in os.listdir(class_dir)
        if not f.startswith(".") and f.lower().endswith((".webp", ".png", ".jpg", ".jpeg"))
    )


def train_ensemble(entity_type, samples, class_names, device, epochs):
    seeds = ENSEMBLE_SEEDS.get(entity_type, (SEED,))
    encoders = []
    for seed in seeds:
        if len(seeds) > 1:
            print(f"  seed {seed}:")
        encoders.append(train_encoder(entity_type, samples, class_names, device, epochs, seed))
    return encoders[0] if len(encoders) == 1 else EnsembleEncoder(encoders).eval()


def train_encoder(entity_type, samples, class_names, device, epochs, seed=SEED):
    torch.manual_seed(seed)
    random.seed(seed)

    images = to_tensor([load_image(path) for path, _ in samples], device)
    labels = torch.tensor([label for _, label in samples], device=device)

    donors = None
    if entity_type == "skill_card":
        is_crop = torch.tensor(
            [os.path.basename(path) != "icon.webp" for path, _ in samples], device=device
        )
        donors = images[is_crop] if is_crop.any() else images

    upgraded = None
    if entity_type == "p_item":
        upgraded_ids = load_upgraded_ids(entity_type)
        upgraded = torch.tensor(
            [class_names[label].split("_")[0] in upgraded_ids for _, label in samples],
            device=device,
        )

    covered_label = (
        class_names.index(COVERED_CLASS_ID) if has_covered_class(entity_type) else None
    )

    encoder = Encoder().to(device)
    head = CosineMarginHead(len(class_names)).to(device)
    params = list(encoder.parameters()) + list(head.parameters())
    optimizer = torch.optim.AdamW(params, lr=LEARNING_RATE, weight_decay=1e-4)
    steps_per_epoch = math.ceil(len(images) / BATCH_SIZE)
    scheduler = torch.optim.lr_scheduler.OneCycleLR(
        optimizer, max_lr=LEARNING_RATE, total_steps=epochs * steps_per_epoch, pct_start=0.1
    )

    for epoch in range(epochs):
        encoder.train()
        order = torch.randperm(len(images), device=device)
        total_loss = 0.0
        for step in range(steps_per_epoch):
            batch = order[step * BATCH_SIZE : (step + 1) * BATCH_SIZE]
            batch_upgraded = upgraded[batch] if upgraded is not None else None
            x, covered = augment(images[batch], donors, batch_upgraded, return_covered=True)
            batch_labels = labels[batch]
            if covered_label is not None:
                batch_labels = torch.where(covered, covered_label, batch_labels)
            logits = head(encoder(x), batch_labels)
            loss = F.cross_entropy(logits, batch_labels, label_smoothing=0.05)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            scheduler.step()
            total_loss += loss.item()
        if (epoch + 1) % 10 == 0 or epoch + 1 == epochs:
            print(f"  epoch [{epoch + 1}/{epochs}], loss: {total_loss / steps_per_epoch:.4f}")

    return encoder.eval().cpu()


def export_onnx(encoder, path):
    # Placeholder gallery; gallery.refresh fills it.
    with torch.no_grad():
        dim = encoder(torch.zeros(1, 3, INPUT_SIZE, INPUT_SIZE)).shape[1]
    model = PrototypeClassifier(encoder, torch.zeros(dim, 1)).eval()
    torch.onnx.export(
        model,
        torch.zeros(1, 3, INPUT_SIZE, INPUT_SIZE),
        path,
        input_names=["input"],
        output_names=["classifier", "embedding"],
        dynamic_axes={
            "input": {0: "batch_size"},
            "classifier": {0: "batch_size", 1: "num_classes"},
            "embedding": {0: "batch_size"},
        },
        opset_version=18,
        dynamo=False,
    )


def train_entity(entity_type, class_names, epochs, device):
    print(f"\ntraining {entity_type} on {device}...")
    samples = [
        (path, label)
        for label, name in enumerate(class_names)
        for path in class_images(entity_type, name)
    ]
    print(f"  classes: {len(class_names)}, images: {len(samples)}")
    encoder = train_ensemble(entity_type, samples, class_names, device, epochs)

    export_onnx(encoder, gallery.onnx_path(entity_type))
    gallery.print_summary(entity_type, gallery.refresh(entity_type))
    print(f"  exported {gallery.onnx_path(entity_type)}")

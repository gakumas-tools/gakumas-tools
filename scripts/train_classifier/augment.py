import math
import random

import torch
import torch.nn.functional as F

from .models import INPUT_SIZE

# The "+" on the right edge is deliberately left out.
SKILL_CARD_OVERLAY_REGIONS = [
    (0.0, 0.0, 0.32, 0.26),
    (0.68, 0.0, 1.0, 0.28),
    (0.28, 0.66, 0.64, 0.95),
    (0.70, 0.70, 1.0, 1.0),
    (0.0, 0.28, 0.24, 1.0),
]
OVERLAY_PROBABILITY = 0.3
UPGRADE_BADGE_PROBABILITY = 0.5
UPGRADE_BADGE_CENTER = (0.76, 0.20)
UPGRADE_BADGE_ARM = 0.16
UPGRADE_BADGE_THICKNESS = 0.06
UPGRADE_BADGE_OUTLINE = 0.025
UPGRADE_BADGE_RED = (0.94, 0.33, 0.40)
UPGRADE_BADGE_YELLOW = (0.94, 0.70, 0.30)
DEGRADED_RESOLUTIONS = [24, 32, 40, 48, 64, 80, 96]
# The game's nav pill: a translucent gray capsule with white icons that floats
# over the bottom of the screen and can lie across a row of cards. It is drawn
# only the way it covers cards on short screens (across the middle); lighter
# pills over otherwise readable cards cost clear reads elsewhere.
NAV_PILL_PROBABILITY = 0.2
NAV_PILL_CENTER = (0.4, 0.6)
NAV_PILL_HALF_HEIGHT = (0.22, 0.32)
NAV_PILL_ALPHA = (0.65, 0.9)
NAV_PILL_GRAY = (0.35, 0.6)
NAV_PILL_STROKE = 0.025
# A card the pill hides at least this much of is trained as the covered class:
# what is left (the cost and a strip of frame) does not name the card.
NAV_PILL_COVERED_FRACTION = 0.4


def _uniform(shape, low, high, device):
    return torch.empty(shape, device=device).uniform_(low, high)


def _swap_overlay_regions(x, donors, regions):
    batch, _, height, width = x.shape
    donor = donors[torch.randint(0, donors.shape[0], (batch,), device=x.device)]
    donor = donor.float() / 255
    for x0, y0, x1, y1 in regions:
        swap = (torch.rand(batch, device=x.device) < OVERLAY_PROBABILITY).view(
            batch, 1, 1, 1
        )
        rows = slice(int(y0 * height), int(y1 * height))
        cols = slice(int(x0 * width), int(x1 * width))
        x[:, :, rows, cols] = torch.where(
            swap, donor[:, :, rows, cols], x[:, :, rows, cols]
        )
    return x


def _plus_mask(px, py, cx, cy, arm, thickness):
    dx, dy = (px - cx).abs(), (py - cy).abs()
    return ((dx <= arm) & (dy <= thickness)) | ((dx <= thickness) & (dy <= arm))


def _draw_upgrade_badge(x, upgraded):
    batch, _, height, width = x.shape
    device = x.device
    draw = upgraded & (torch.rand(batch, device=device) < UPGRADE_BADGE_PROBABILITY)
    if not draw.any():
        return x
    shape = (batch, 1, 1, 1)
    scale = _uniform(shape, 0.85, 1.15, device)
    cx = UPGRADE_BADGE_CENTER[0] + _uniform(shape, -0.03, 0.03, device)
    cy = UPGRADE_BADGE_CENTER[1] + _uniform(shape, -0.03, 0.03, device)
    py = torch.linspace(0, 1, height, device=device).view(1, 1, height, 1)
    px = torch.linspace(0, 1, width, device=device).view(1, 1, 1, width)
    arm, thickness = UPGRADE_BADGE_ARM * scale, UPGRADE_BADGE_THICKNESS * scale
    fill = _plus_mask(px, py, cx, cy, arm, thickness)
    outline = _plus_mask(
        px, py, cx, cy, arm + UPGRADE_BADGE_OUTLINE, thickness + UPGRADE_BADGE_OUTLINE
    )
    t = ((px - cx + py - cy) / (4 * arm) + 0.5).clamp(0, 1)
    red = torch.tensor(UPGRADE_BADGE_RED, device=device).view(1, 3, 1, 1)
    yellow = torch.tensor(UPGRADE_BADGE_YELLOW, device=device).view(1, 3, 1, 1)
    badge = torch.where(fill, red * (1 - t) + yellow * t, torch.ones_like(x))
    return torch.where(outline & draw.view(shape), badge, x)


def _draw_nav_pill(x):
    batch, _, height, width = x.shape
    device = x.device
    draw = torch.rand(batch, device=device) < NAV_PILL_PROBABILITY
    if not draw.any():
        return x, torch.zeros_like(draw)
    shape = (batch, 1, 1, 1)
    py = torch.linspace(0, 1, height, device=device).view(1, 1, height, 1)
    px = torch.linspace(0, 1, width, device=device).view(1, 1, 1, width)
    cy = _uniform(shape, *NAV_PILL_CENTER, device)
    half = _uniform(shape, *NAV_PILL_HALF_HEIGHT, device)
    # Either end of the capsule may fall inside the card, or neither.
    left = _uniform(shape, -0.8, 0.4, device)
    right = torch.maximum(_uniform(shape, 0.6, 1.8, device), left + 2 * half)
    spine_x = px.clamp(min=left + half, max=right - half)
    inside = (px - spine_x) ** 2 + (py - cy) ** 2 <= half**2

    alpha = _uniform(shape, *NAV_PILL_ALPHA, device)
    gray = _uniform(shape, *NAV_PILL_GRAY, device) + _uniform(
        (batch, 3, 1, 1), -0.03, 0.03, device
    )
    band = x * (1 - alpha) + gray * alpha

    # Its icons: white separators and rings, like the home, help and back marks.
    separator_x = _uniform(shape, 0, 1, device)
    separator = ((px - separator_x).abs() < NAV_PILL_STROKE / 2) & (
        (py - cy).abs() < half * 0.5
    )
    ring_x = _uniform(shape, 0, 1, device)
    ring_r = half * _uniform(shape, 0.4, 0.6, device)
    ring_distance = ((px - ring_x) ** 2 + (py - cy) ** 2).sqrt()
    ring = (ring_distance - ring_r).abs() < NAV_PILL_STROKE
    strokes = (separator & (torch.rand(shape, device=device) < 0.6)) | (
        ring & (torch.rand(shape, device=device) < 0.7)
    )
    band = torch.where(strokes, torch.full_like(band, 0.96), band)
    covered = draw & (inside.float().mean((1, 2, 3)) >= NAV_PILL_COVERED_FRACTION)
    # Only covering pills are drawn (see NAV_PILL_PROBABILITY).
    return torch.where(inside & covered.view(shape), band, x), covered


def _jitter_framing(x):
    batch, device = x.shape[0], x.device
    scale = _uniform(batch, 0.9, 1.12, device)
    angle = _uniform(batch, -3, 3, device) * math.pi / 180
    theta = torch.zeros(batch, 2, 3, device=device)
    theta[:, 0, 0] = torch.cos(angle) / scale
    theta[:, 0, 1] = -torch.sin(angle) / scale
    theta[:, 1, 0] = torch.sin(angle) / scale
    theta[:, 1, 1] = torch.cos(angle) / scale
    theta[:, :, 2] = _uniform((batch, 2), -0.06, 0.06, device)
    grid = F.affine_grid(theta, x.shape, align_corners=False)
    return F.grid_sample(x, grid, padding_mode="border", align_corners=False)


def _degrade_resolution(x):
    size = x.shape[-1]
    resolution = random.choice(DEGRADED_RESOLUTIONS)
    if resolution >= size:
        return x
    x = F.interpolate(x, size=resolution, mode="bilinear", antialias=True)
    return F.interpolate(x, size=size, mode="bilinear", align_corners=False)


def _jitter_color(x):
    batch, device = x.shape[0], x.device
    shape = (batch, 1, 1, 1)
    mean = x.mean((1, 2, 3), keepdim=True)
    x = (x - mean) * _uniform(shape, 0.8, 1.2, device) + mean
    x = x * _uniform(shape, 0.8, 1.2, device)
    gray = x.mean(1, keepdim=True)
    x = gray + (x - gray) * _uniform(shape, 0.7, 1.3, device)
    tint_strength = _uniform(shape, 0, 0.12, device) * (
        torch.rand(shape, device=device) < 0.3
    )
    x = x * (1 - tint_strength) + torch.rand(batch, 3, 1, 1, device=device) * tint_strength
    x = x + torch.randn_like(x) * _uniform(shape, 0, 0.03, device)
    return x.clamp(0, 1)


def to_model_input(x):
    if x.dtype == torch.uint8:
        x = x.float() / 255
    return F.interpolate(
        x, size=INPUT_SIZE, mode="bilinear", align_corners=False, antialias=True
    )


# With return_covered, also says which samples the nav pill covers (see
# NAV_PILL_COVERED_FRACTION).
def augment(x, overlay_donors=None, upgraded=None, return_covered=False):
    x = x.float() / 255
    covered = torch.zeros(x.shape[0], dtype=torch.bool, device=x.device)
    if overlay_donors is not None:
        x = _swap_overlay_regions(x, overlay_donors, SKILL_CARD_OVERLAY_REGIONS)
        x, covered = _draw_nav_pill(x)
    if upgraded is not None:
        x = _draw_upgrade_badge(x, upgraded)
    x = _jitter_framing(x)
    x = _degrade_resolution(x)
    x = _jitter_color(x)
    if return_covered:
        return to_model_input(x), covered
    return to_model_input(x)

import torch
import torch.nn as nn
import torch.nn.functional as F

INPUT_SIZE = 64
EMBEDDING_DIM = 64
CHANNELS = (24, 48, 96, 160)
LOGIT_SCALE = 24.0


def _conv_block(in_channels, out_channels):
    return [
        nn.Conv2d(in_channels, out_channels, 3, padding=1, bias=False),
        nn.BatchNorm2d(out_channels),
        nn.ReLU(),
    ]


class Encoder(nn.Module):
    def __init__(self, embedding_dim=EMBEDDING_DIM):
        super().__init__()
        c1, c2, c3, c4 = CHANNELS
        self.features = nn.Sequential(
            *_conv_block(3, c1),
            nn.MaxPool2d(2),
            *_conv_block(c1, c2),
            nn.MaxPool2d(2),
            *_conv_block(c2, c3),
            nn.MaxPool2d(2),
            *_conv_block(c3, c4),
            nn.AdaptiveAvgPool2d(1),
        )
        self.projection = nn.Linear(c4, embedding_dim)

    def forward(self, x):
        return F.normalize(self.projection(self.features(x).flatten(1)), dim=1)


class CosineMarginHead(nn.Module):
    def __init__(self, num_classes, embedding_dim=EMBEDDING_DIM, margin=0.2):
        super().__init__()
        self.weight = nn.Parameter(torch.randn(num_classes, embedding_dim))
        self.margin = margin

    def forward(self, embeddings, labels):
        cosine = embeddings @ F.normalize(self.weight, dim=1).t()
        cosine = cosine - F.one_hot(labels, cosine.shape[1]) * self.margin
        return cosine * LOGIT_SCALE


class PrototypeClassifier(nn.Module):
    def __init__(self, encoder, gallery):
        super().__init__()
        self.encoder = encoder
        self.register_buffer("gallery", gallery)

    def forward(self, x):
        embedding = self.encoder(x)
        return embedding @ self.gallery * LOGIT_SCALE, embedding


class EnsembleEncoder(nn.Module):
    """Encoders trained alike with different seeds, read as one. Their unit
    embeddings are joined and scaled by 1/sqrt(n), so the result is still a
    unit vector and its cosine with a gallery built the same way is the mean
    of the members' cosines. The exported model, gallery refresh and readers
    are unchanged; only the embedding is wider."""

    def __init__(self, encoders):
        super().__init__()
        self.members = nn.ModuleList(encoders)

    def forward(self, x):
        joined = torch.cat([member(x) for member in self.members], dim=1)
        return joined / len(self.members) ** 0.5

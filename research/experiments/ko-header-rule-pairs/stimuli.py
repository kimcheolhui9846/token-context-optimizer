from PIL import ImageChops

# Half-open boxes: (left, top, right, bottom).
ORIGINAL = (24, 150, 1256, 152)
MOVED = (24, 156, 1256, 158)

RULE = 190
WHITE = 255


def _compose(base, layer):
    image = base.copy()
    image.paste(0, mask=ImageChops.invert(layer))
    return image


def _require(condition, message):
    if not condition:
        raise ValueError(message)


def make_pair(bare, layer, historical):
    images = (bare, layer, historical)
    _require(
        all(image.mode == 'L' and 'transparency' not in image.info for image in images),
        'images must be opaque grayscale L',
    )
    _require(bare.size == layer.size == historical.size, 'image sizes differ')
    _require(
        all(box[2] <= bare.width and box[3] <= bare.height for box in (ORIGINAL, MOVED)),
        'stripe is out of bounds',
    )
    _require(bare.crop(ORIGINAL).getextrema() == (RULE, RULE), 'unexpected original stripe')
    _require(bare.crop(MOVED).getextrema() == (WHITE, WHITE), 'destination is not white')
    _require(
        ImageChops.difference(_compose(bare, layer), historical).getbbox() is None,
        'reconstruction does not match historical',
    )

    moved_bare = bare.copy()
    moved_bare.paste(WHITE, ORIGINAL)
    moved_bare.paste(RULE, MOVED)

    # Nonzero only where a glyph pixel and a nonwhite bare pixel coincide.
    overlap = ImageChops.darker(ImageChops.invert(moved_bare), ImageChops.invert(layer))
    _require(overlap.getbbox() is None, 'glyph overlaps nonwhite content')

    moved_planted = _compose(moved_bare, layer)
    outside = ImageChops.difference(historical, moved_planted)
    outside.paste(0, ORIGINAL)
    outside.paste(0, MOVED)
    _require(outside.getbbox() is None, 'pixels changed outside the stripe boxes')
    return moved_bare, moved_planted

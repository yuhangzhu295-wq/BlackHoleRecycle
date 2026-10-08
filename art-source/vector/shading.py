"""Gradient-through-mask helpers for the V9.5 UI art.

The first pass drew capsule highlights and shades as hard-edged rounded bars.
Reviewed on a contact sheet they read as *separate UI elements* stacked on the
capsule rather than as light and shade -- the yellow capsule grew a grey-brown
bar along its bottom edge. Highlights and shades have to be gradients clipped to
the shape they belong to, which is what this module provides.
"""
from PIL import Image, ImageChops, ImageDraw

from palette import SS, rgb


def shape_mask(size, box, radius):
    """An 'L' mask of a rounded rectangle, in supersampled coordinates."""
    mask = Image.new('L', size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(box, radius=radius, fill=255)
    return mask


def vertical_ramp(size, stops):
    """An RGBA vertical ramp; `stops` is [(position 0..1, hex, alpha 0..255)]."""
    width, height = size
    image = Image.new('RGBA', size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    for y in range(height):
        t = y / max(1, height - 1)
        lower, upper = stops[0], stops[-1]
        for index in range(len(stops) - 1):
            if stops[index][0] <= t <= stops[index + 1][0]:
                lower, upper = stops[index], stops[index + 1]
                break
        span = max(1e-6, upper[0] - lower[0])
        local = min(1.0, max(0.0, (t - lower[0]) / span))
        a, b = rgb(lower[1]), rgb(upper[1])
        colour = tuple(round(a[i] + (b[i] - a[i]) * local) for i in range(3))
        alpha = round(lower[2] + (upper[2] - lower[2]) * local)
        draw.line([(0, y), (width, y)], fill=colour + (alpha,))
    return image


def light_shape(base, box, radius, stops):
    """Composite a vertical gradient onto `base`, clipped to a rounded rectangle.

    `base`, `box` and the returned image are all in supersampled coordinates.
    """
    ramp = vertical_ramp(base.size, stops)
    mask = shape_mask(base.size, box, radius)
    ramp.putalpha(ImageChops.multiply(ramp.getchannel('A'), mask))
    return Image.alpha_composite(base, ramp)

"""Shared constants for the V9.5 UI art pipeline.

Colours are **sampled from the adopted reference renders**, not chosen by eye.
Each value records the region it came from so it can be re-checked against
`cocos/docs/design-reference/ui-v9.5-adopted/`.

Kept in its own module so the shape generator and the shading helpers can both
import it without importing each other.
"""

# Supersampling factor. Shapes are drawn large and reduced, which is what gives
# rounded corners and outlines clean edges without a vector rasteriser.
SS = 4

# --- palette, sampled from the adopted references ---------------------------
# field: 01-modesel-and-home-language.png, vertical ramp at x = centre
SKY_TOP = '#b3eefd'
SKY_MID = '#52d0fe'
SKY_BOTTOM = '#1aa4f5'
# brand plate and display type: 01-modesel..., brand band
NAVY_PLATE = '#031d4d'
NAVY_DEEP = '#04235c'
NAVY_LIFT = '#123a7d'
GOLD = '#fbe572'
GOLD_LIGHT = '#fcf3bb'
# primary capsule: 01-modesel..., primary capsule region
YELLOW = '#fec303'
YELLOW_HI = '#fcf8d9'
YELLOW_EDGE = '#fee88e'
BROWN_LABEL = '#58351a'
# secondary capsule and ribbon: 02-settlement.png
PURPLE = '#8a2cf7'
PURPLE_RIBBON = '#8f48cd'
PURPLE_DEEP = '#220982'
PURPLE_HI = '#c9a4ff'
# settlement board: 02-settlement.png
BOARD_CYAN = '#39bafa'
BOARD_PANEL = '#e8f6fb'
ROW_LOCAL = '#d8fcd5'
REWARD_GOLD = '#fef0a5'
REWARD_EDGE = '#cc7d12'
# rank badges: 02-settlement.png rows 1 / 2 / 4
BADGE_GOLD = '#fdba15'
BADGE_GOLD_EDGE = '#9d5d13'
BADGE_BLUE = '#7aa7f9'
BADGE_BLUE_EDGE = '#203b88'
BADGE_PURPLE = '#6e3ddb'
WHITE = '#ffffff'
PLANET = '#2f8fe0'
PLANET_LIGHT = '#7fd0f5'


def rgb(hex_value):
    hex_value = hex_value.lstrip('#')
    return tuple(int(hex_value[i:i + 2], 16) for i in (0, 2, 4))


def rgba(hex_value, alpha):
    return rgb(hex_value) + (alpha,)

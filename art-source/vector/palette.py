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

# --- palette ----------------------------------------------------------------
# V12: the base roles below now come from the SEVEN NEW DESIGN SHEETS, which the
# user named as the current visual target, rather than from the V9.5 adopted
# renders this file originally sampled. The new sheets print their bases as
# labelled swatches, so these are read, not eyeballed:
#
#   DESIGN_01 色彩与风格: 天空蓝 #4EC5FF, 道路灰 #8A9BA8, 草地绿 #7ED957,
#                         主角色 #9B5CFF, 亮暖黄 #FFD60A, 深蓝 UI #1F2A44
#   DESIGN_02 色彩方案:   天空蓝 #6EC5FF, 能量紫 #8B5CFF, 活力黄 #FFD44D,
#                         深蓝灰 #172A4A, 浅背景 #EAF2FF
#
# The two sheets disagree on five of six roles. Per V12_DESIGN_REFERENCE_MANIFEST
# section 2 the resolution is DESIGN_01 as the spec sheet, with DESIGN_02's
# #EAF2FF taken as the panel base because 01 does not give one.
#
# ONLY the roles the sheets state outright are changed here. The derived partners
# (SKY_TOP/BOTTOM, NAVY_DEEP/LIFT, YELLOW_HI/EDGE, PURPLE_RIBBON/DEEP/HI,
# BOARD_CYAN) are left alone on purpose: the sheets do not give them, and shifting
# them by the base's raw RGB delta was tried on paper and distorts hue -- PURPLE's
# delta applied to PURPLE_DEEP turns a deep purple into a grey-navy, because the
# delta is dominated by the base's saturation, which the deep shade does not have.
# Deriving them properly means sampling the new sheets for each partner the way
# the original values were sampled, which is a separate pass.
SKY_TOP = '#b3eefd'
SKY_MID = '#4ec5ff'
SKY_BOTTOM = '#1aa4f5'
# brand plate and display type: DESIGN_01 深蓝 UI
NAVY_PLATE = '#1f2a44'
NAVY_DEEP = '#04235c'
NAVY_LIFT = '#123a7d'
GOLD = '#fbe572'
GOLD_LIGHT = '#fcf3bb'
# primary capsule: DESIGN_01 亮暖黄
YELLOW = '#ffd60a'
YELLOW_HI = '#fcf8d9'
YELLOW_EDGE = '#fee88e'
BROWN_LABEL = '#58351a'
# secondary capsule and ribbon: DESIGN_01 主角色 / 能量紫
PURPLE = '#9b5cff'
PURPLE_RIBBON = '#8f48cd'
PURPLE_DEEP = '#220982'
PURPLE_HI = '#c9a4ff'
# settlement board: DESIGN_02 浅背景
BOARD_CYAN = '#39bafa'
BOARD_PANEL = '#eaf2ff'
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

"""WeChat / Douyin main-package size, split from subpackages.

The mini-game platforms cap the MAIN package at 4 MB (uploaded, compressed). The
build directory on disk is uncompressed, so reporting `du` would overstate it and
reporting nothing would leave the platform constraint unmeasured. This prints the
main package's byte count and file count, and the same for any subpackage.

Run: python scripts/measure_minigame_package.py [platform]
"""
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')


def walk_size(root, skip_subpackages):
    total = 0
    count = 0
    for dirpath, _dirs, files in os.walk(root):
        normalised = dirpath.replace(os.sep, '/')
        is_sub = '/subpackages' in normalised
        if is_sub != skip_subpackages:
            continue
        for name in files:
            try:
                total += os.path.getsize(os.path.join(dirpath, name))
                count += 1
            except OSError:
                pass
    return count, total


def main():
    platforms = sys.argv[1:] or ['wechatgame', 'bytedance-mini-game']
    for platform in platforms:
        root = os.path.join(ROOT, 'cocos', 'build', platform)
        if not os.path.isdir(root):
            print('%s: not built' % platform)
            continue
        main_files, main_bytes = walk_size(root, skip_subpackages=True)
        sub_files, sub_bytes = walk_size(root, skip_subpackages=False)
        print('%s:' % platform)
        print('  main package  %4d files  %7.2f MB uncompressed'
              % (main_files, main_bytes / 1048576.0))
        print('  subpackages   %4d files  %7.2f MB uncompressed'
              % (sub_files, sub_bytes / 1048576.0))
        print('  NOTE: the platform limit applies to the COMPRESSED upload, which'
              ' this does not measure.')
    return 0


if __name__ == '__main__':
    sys.exit(main())

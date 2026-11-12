#!/usr/bin/env python3
"""Register hidden WKAL PAYLOADS entries for autoload ELFs.

Without these, sendPayloadToElfldr throws 'payload is not listed in this menu'.
Covers: elf-launcher.elf, wkal-mark.elf, wkal-companions.elf.
Hybrid may send elf-launcher.elf when :1000 is down.
"""
import re
import sys
from pathlib import Path

OLD = (
    '    { title: "WKAL autoload", description: "", name: "payload.elf",\n'
    '        info: "payload.elf", hidden: true }'
)
NEW = (
    '    { title: "WKAL autoload", description: "", name: "payload.elf",\n'
    '        info: "payload.elf", hidden: true },\n'
    '    { title: "WKAL autoload elf-launcher", description: "", name: "elf-launcher.elf",\n'
    '        info: "elf-launcher.elf", hidden: true },\n'
    '    { title: "WKAL mark", description: "", name: "wkal-mark.elf",\n'
    '        info: "wkal-mark.elf", hidden: true },\n'
    '    { title: "WKAL companions", description: "", name: "wkal-companions.elf",\n'
    '        info: "wkal-companions.elf", hidden: true }'
)
EL_TILE = (
    '    { title: "WKAL autoload elf-launcher", description: "", name: "elf-launcher.elf",\n'
    '        info: "elf-launcher.elf", hidden: true }'
)
EL_ONLY = EL_TILE
EL_WITH_MARK = (
    '    { title: "WKAL autoload elf-launcher", description: "", name: "elf-launcher.elf",\n'
    '        info: "elf-launcher.elf", hidden: true },\n'
    '    { title: "WKAL mark", description: "", name: "wkal-mark.elf",\n'
    '        info: "wkal-mark.elf", hidden: true },\n'
    '    { title: "WKAL companions", description: "", name: "wkal-companions.elf",\n'
    '        info: "wkal-companions.elf", hidden: true }'
)
COMPANIONS_ONLY = (
    '    { title: "WKAL companions", description: "", name: "wkal-companions.elf",\n'
    '        info: "wkal-companions.elf", hidden: true }'
)


def strip_pldmgr(t: str) -> str:
    return re.sub(
        r',\n    \{ title: "WKAL autoload pldmgr", description: "", name: "pldmgr\.elf",\n'
        r'        info: "pldmgr\.elf", hidden: true \}',
        "",
        t,
    )


def ensure_elf_launcher(path: Path, t: str) -> bool:
    """Insert elf-launcher tile after payload.elf when companions already exist."""
    if 'name: "elf-launcher.elf"' in t:
        print(f"already listed elf-launcher: {path}")
        return False
    needle = (
        '    { title: "WKAL autoload", description: "", name: "payload.elf",\n'
        '        info: "payload.elf", hidden: true }'
    )
    if needle in t:
        add = needle + ',\n' + EL_TILE
        path.write_text(t.replace(needle, add, 1))
        print(f"listed elf-launcher after payload.elf: {path}")
        return True
    print(f"WARN: could not place elf-launcher tile in {path}", file=sys.stderr)
    return False


def ensure_companions(path: Path, t: str) -> bool:
    """Append companions tile when mark already present."""
    if 'name: "wkal-companions.elf"' in t:
        return False
    needle = (
        '    { title: "WKAL mark", description: "", name: "wkal-mark.elf",\n'
        '        info: "wkal-mark.elf", hidden: true }'
    )
    if needle in t:
        add = (
            '    { title: "WKAL mark", description: "", name: "wkal-mark.elf",\n'
            '        info: "wkal-mark.elf", hidden: true },\n'
            + COMPANIONS_ONLY
        )
        path.write_text(t.replace(needle, add, 1))
        print(f"listed companions after mark: {path}")
        return True
    return False


def patch_file(path: Path) -> bool:
    t = path.read_text()
    if 'name: "pldmgr.elf"' in t:
        t2 = strip_pldmgr(t)
        if t2 != t:
            path.write_text(t2)
            print(f"removed legacy pldmgr tile: {path}")
            t = t2

    if 'name: "wkal-companions.elf"' in t and 'name: "elf-launcher.elf"' in t:
        print(f"already listed: {path}")
        return False
    if 'name: "wkal-companions.elf"' in t:
        return ensure_elf_launcher(path, t)
    if 'name: "wkal-mark.elf"' in t and 'name: "elf-launcher.elf"' in t:
        return ensure_companions(path, t)
    if 'name: "elf-launcher.elf"' in t:
        if EL_ONLY not in t:
            print(f"WARN: elf-launcher tile shape unexpected in {path}", file=sys.stderr)
            return False
        path.write_text(t.replace(EL_ONLY, EL_WITH_MARK, 1))
        print(f"listed mark+companions after elf-launcher: {path}")
        return True
    if OLD not in t:
        print(f"WARN: WKAL payload.elf tile not found in {path}", file=sys.stderr)
        return False
    path.write_text(t.replace(OLD, NEW, 1))
    print(f"listed elf-launcher+mark+companions: {path}")
    return True


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    for name in ("poops.html", "p2jb.html"):
        paths = [root / name] if (root / name).is_file() else list(root.rglob(name))
        for path in paths:
            if "slopkit" in str(path):
                patch_file(path)


if __name__ == "__main__":
    main()

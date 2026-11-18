#!/usr/bin/env python3
"""Product branding - single source of truth.

Everything the user can see (PS5 tile label, page titles, ELF names, docs)
is derived from ``branding.json``. Change that file (or run
``make brand NAME="My Store"``) and rebuild; no source edits needed.

Fields:
    name          Tile label / page title / UI wordmark
    tagline       Small uppercase line under the wordmark
    repo          "owner/repo" on GitHub. Empty disables self-update checks.
    elf_prefix    Prefix for the built ELF names (Store_V1.2.4.elf, ...)

The payload sent to elfldr after a successful jailbreak is fixed to
``payloads/pldmgr.elf`` (see js/core.js -> W.POST_JB_PAYLOAD). The page then
returns to the PS5 home screen instead of opening a launcher UI.

The frontend is plain static HTML/JS, so the values reach it through build
time tokens:

    [[BRAND_NAME_PLACEHOLDER]]
    [[BRAND_TAGLINE_PLACEHOLDER]]
    [[BRAND_REPO_PLACEHOLDER]]
    [[BRAND_ELF_PREFIX_PLACEHOLDER]]

tools/gen_file_registry.py (ELF build), tools/build_host.py (PC host) and
tools/dev_server.py (local preview) all substitute them.

Usage:
    branding.py --get name         # print one value (used by the Makefile)
    branding.py --write-header     # write include/branding.h
    branding.py --set-name NAME    # update branding.json (make brand)
    branding.py --set-repo OWNER/REPO
    branding.py --set-tagline TEXT
    branding.py --set-elf-prefix PREFIX
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRANDING_JSON = os.path.join(ROOT, "branding.json")
HEADER_OUT = os.path.join(ROOT, "include", "branding.h")

DEFAULTS = {
    "name": "Store",
    "tagline": "JAILBREAK",
    "repo": "",
    "elf_prefix": "Store",
}

TOKENS = {
    "name": b"[[BRAND_NAME_PLACEHOLDER]]",
    "tagline": b"[[BRAND_TAGLINE_PLACEHOLDER]]",
    "repo": b"[[BRAND_REPO_PLACEHOLDER]]",
    "elf_prefix": b"[[BRAND_ELF_PREFIX_PLACEHOLDER]]",
}


def load(path=BRANDING_JSON):
    """Return the branding dict, falling back to DEFAULTS for missing keys."""
    data = dict(DEFAULTS)
    try:
        with open(path, "r", encoding="utf-8") as f:
            loaded = json.load(f)
        if isinstance(loaded, dict):
            data.update(loaded)
    except OSError:
        pass
    except ValueError as exc:
        sys.exit(f"Error: {path} is not valid JSON: {exc}")

    for key, default in DEFAULTS.items():
        value = data.get(key)
        if not isinstance(value, str):
            value = default
        data[key] = value.strip()

    if not data["name"]:
        data["name"] = DEFAULTS["name"]
    if not data["elf_prefix"]:
        data["elf_prefix"] = DEFAULTS["elf_prefix"]
    data["repo"] = data["repo"].strip().strip("/")
    return data


def token_map(brand=None):
    """Return {token bytes: replacement bytes} for the loaded branding."""
    b = brand or load()
    return {
        TOKENS["name"]: b["name"].encode("utf-8"),
        TOKENS["tagline"]: b["tagline"].encode("utf-8"),
        TOKENS["repo"]: b["repo"].encode("utf-8"),
        TOKENS["elf_prefix"]: b["elf_prefix"].encode("utf-8"),
    }


def apply_tokens(data, brand=None):
    """Substitute every branding token in a bytes blob."""
    if isinstance(data, str):
        for token, value in token_map(brand).items():
            data = data.replace(token.decode("ascii"), value.decode("utf-8"))
        return data
    for token, value in token_map(brand).items():
        data = data.replace(token, value)
    return data


def _c_escape(value):
    return value.replace("\\", "\\\\").replace('"', '\\"')


def header_text(brand=None):
    """C header consumed by the ELF builds (include/branding.h)."""
    b = brand or load()
    return (
        "#pragma once\n"
        "/* Written by tools/branding.py from branding.json - do not edit. */\n"
        "\n"
        f'#define BRAND_NAME "{_c_escape(b["name"])}"\n'
        f'#define BRAND_TAGLINE "{_c_escape(b["tagline"])}"\n'
        f'#define BRAND_REPO "{_c_escape(b["repo"])}"\n'
        f'#define BRAND_ELF_PREFIX "{_c_escape(b["elf_prefix"])}"\n'
    )


def write_if_changed(path, data):
    try:
        with open(path, "r", encoding="utf-8") as f:
            if f.read() == data:
                return False
    except OSError:
        pass
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(data)
    return True


def write_header():
    write_if_changed(HEADER_OUT, header_text())
    return 0


def _elf_prefix_from_name(name):
    """'My Store!' -> 'MyStore' (safe for file names and release assets)."""
    prefix = "".join(ch for ch in name if ch.isalnum())
    return prefix or DEFAULTS["elf_prefix"]


def update_branding(updates):
    """Merge updates into branding.json (used by `make brand`)."""
    data = load()
    data.update({k: v for k, v in updates.items() if v is not None})
    # Renaming the product renames the ELF files too, unless the caller picked
    # an explicit prefix (--set-elf-prefix / make brand ELF_PREFIX=...).
    if "name" in updates and "elf_prefix" not in updates:
        data["elf_prefix"] = _elf_prefix_from_name(data["name"])
    ordered = {key: data[key] for key in DEFAULTS}
    with open(BRANDING_JSON, "w", encoding="utf-8") as f:
        json.dump(ordered, f, indent=2)
        f.write("\n")
    return 0


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if not argv:
        print(json.dumps(load(), indent=2))
        return 0

    if argv[0] == "--get":
        if len(argv) != 2 or argv[1] not in DEFAULTS:
            sys.exit("Usage: branding.py --get {name|tagline|repo|elf_prefix}")
        print(load()[argv[1]])
        return 0

    if argv[0] == "--write-header":
        return write_header()

    updates = {}
    for flag, key in (
        ("--set-name", "name"),
        ("--set-tagline", "tagline"),
        ("--set-repo", "repo"),
        ("--set-elf-prefix", "elf_prefix"),
    ):
        if flag in argv:
            index = argv.index(flag)
            if index + 1 >= len(argv):
                sys.exit(f"Error: {flag} needs a value")
            updates[key] = argv[index + 1]

    if not updates:
        sys.exit(__doc__)

    rc = update_branding(updates)
    # Keep the generated header in sync immediately so `make brand` alone is
    # enough to refresh anything that reads it.
    write_header()
    print("Branding updated: " + ", ".join(f"{k}={v}" for k, v in updates.items()))
    return rc


if __name__ == "__main__":
    sys.exit(main())

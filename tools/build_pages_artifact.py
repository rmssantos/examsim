#!/usr/bin/env python3
"""Build the exact static artifact that may be published to GitHub Pages."""

import argparse
import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

PUBLIC_FILES = (
    "404.html",
    "CNAME",
    "PRIVACY-AND-STORAGE.md",
    "editor.html",
    "exam.html",
    "guides/ai-102-to-ai-103/index.html",
    "guides/ai-103-labs-and-foundry-practice/index.html",
    "guides/ai-103-study-plan/index.html",
    "guides/ai-900-to-ai-901/index.html",
    "index.html",
    "labs.html",
    "manifest.webmanifest",
    "privacy-and-storage.html",
    "roadmaps.html",
    "robots.txt",
    "service-worker.js",
    "sitemap.xml",
    "user-content/roadmaps.json",
)

PUBLIC_TREES = (
    "assets",
    "exams",
    "user-content/exams",
)


def resolve_output(value):
    output = Path(value)
    if not output.is_absolute():
        output = ROOT / output
    output = Path(os.path.abspath(output))
    build_root = ROOT / "build"
    default_output = ROOT / "_site"
    if output != default_output and build_root not in output.parents:
        raise ValueError(
            "output must be inside the repository build directory or be _site"
        )

    current = ROOT
    for component in output.relative_to(ROOT).parts:
        current /= component
        if current.is_symlink():
            raise ValueError("output path must not contain a symbolic link")

    return output.resolve()


def tracked_files_under(prefix):
    result = subprocess.run(
        ["git", "ls-files", "-z", "--", prefix],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    return [
        Path(item)
        for item in result.stdout.decode("utf-8").split("\0")
        if item
    ]


def copy_public_file(relative_path, output):
    source = ROOT / relative_path
    if not source.is_file() or source.is_symlink():
        raise ValueError(f"missing or unsafe public file: {relative_path}")
    destination = output / relative_path
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


def build(output):
    output = resolve_output(output)
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)

    for relative_path in PUBLIC_FILES:
        copy_public_file(Path(relative_path), output)

    for prefix in PUBLIC_TREES:
        tracked = tracked_files_under(prefix)
        if not tracked:
            raise ValueError(f"no tracked public files found under: {prefix}")
        for relative_path in tracked:
            copy_public_file(relative_path, output)

    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default="_site")
    args = parser.parse_args()
    try:
        output = build(args.output)
    except ValueError as error:
        parser.error(str(error))
    print(f"Built public Pages artifact at {output.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

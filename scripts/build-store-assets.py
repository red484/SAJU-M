"""Compatibility entry point for generating current store icons and feature artwork.

Screenshots must be captured from the current app; see store-assets/README.md.
"""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def build():
    subprocess.run(["node", str(ROOT / "scripts/build-app-icons.mjs")], cwd=ROOT, check=True)
    print("Store icons and feature artwork updated. Capture screenshots from the current app separately.")


if __name__ == "__main__":
    build()

"""Prompt files: `<service>/prompts/<feature>/<name>.md` with a `version: <id>` first line."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


@dataclass(frozen=True)
class Prompt:
    version: str
    text: str


def load_prompt(relative: str) -> Prompt:
    raw = (PROMPTS_DIR / relative).read_text(encoding="utf-8")
    header, _, body = raw.partition("\n")
    key, _, value = header.partition(":")
    if key.strip() != "version" or not value.strip():
        raise ValueError(f"prompt {relative} must start with 'version: <id>'")
    return Prompt(version=value.strip(), text=body.strip())

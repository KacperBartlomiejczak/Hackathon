"""HTML -> clean plain text."""
import logging
import re
import unicodedata

import trafilatura

log = logging.getLogger(__name__)

_BLANK_LINES = re.compile(r"\n{3,}")
_SPACES = re.compile(r"[ \t ]+")


def normalize(text: str) -> str:
    """NFKC, collapse runs of spaces and blank lines."""
    text = unicodedata.normalize("NFKC", text)
    text = _SPACES.sub(" ", text)
    text = "\n".join(line.strip() for line in text.splitlines())
    return _BLANK_LINES.sub("\n\n", text).strip()


def clean_text(html: str) -> str:
    """Extract main text from HTML with trafilatura, then normalize. Empty string if nothing extracted."""
    extracted = trafilatura.extract(html, include_comments=False, favor_recall=True)
    if not extracted:
        log.warning("trafilatura extracted nothing (html length=%d)", len(html))
        return ""
    return normalize(extracted)

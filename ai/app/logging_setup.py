import logging
import os


def setup_logging() -> None:
    """Configure root logger once. Never use print() in this service."""
    level = os.environ.get("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

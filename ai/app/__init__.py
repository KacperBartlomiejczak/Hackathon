"""InvestWatch AI service."""

import os

# app/embeddings.py (team/ai-data) reads OLLAMA_BASE_URL at import time, while .env.example and the rest of
# the service use OLLAMA_URL. Without this alias the container embeds against localhost:11434 and every
# analysis fails. TODO(ai-data): read OLLAMA_URL in embeddings.py, then remove this.
if "OLLAMA_URL" in os.environ:
    os.environ.setdefault("OLLAMA_BASE_URL", os.environ["OLLAMA_URL"])

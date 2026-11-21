# Preprocessing: tokens and embeddings

Each fetched document goes through these steps before the analysis modules run.

1. **Cleaning** (`clean.py`, `clean_text()`): trafilatura extracts the main text from HTML (comments dropped, `favor_recall=True`), then Unicode NFKC normalization collapses spaces and blank lines.
2. **Tokenization for deduplication** (`dedup.py`): the text is lowercased and split into word tokens (`\w+`).
   - `content_hash`: SHA-256 of the tokens joined by single spaces (exact duplicates).
   - `simhash64`: 64-bit simhash over word 3-gram shingles (BLAKE2b per shingle). Texts under 20 words get no simhash.
   - Near duplicate: Hamming distance <= 6 bits against an earlier canonical document. The match is stored in `documents.duplicate_of`.
3. **Embedding** (`../embeddings.py`, `embed()`): the clean text is sent to local Ollama (`/api/embed`, model `bge-m3`, configurable by `OLLAMA_EMBED_MODEL`). bge-m3 tokenizes the text with its own subword (SentencePiece) tokenizer, so Polish needs no extra preprocessing. The result is a 1024-dimension vector stored in `documents.embedding` (pgvector). A wrong vector size raises an error; the code never makes up a vector.
4. **Entity matching** (`entity_match.py`, M1): company mentions are matched against the KNF register (`entities`) using aliases and fuzzy matching.

All models run locally through Ollama, with no external API.

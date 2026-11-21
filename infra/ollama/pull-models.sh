#!/bin/sh
set -eu

OLLAMA_URL="${OLLAMA_URL:-http://ollama:11434}"
OLLAMA_EMBED_MODEL="${OLLAMA_EMBED_MODEL:-bge-m3}"
OLLAMA_LLM_MODEL="${OLLAMA_LLM_MODEL:-SpeakLeash/bielik-11b-v2.3-instruct:Q4_K_M}"

echo "Waiting for Ollama at ${OLLAMA_URL}..."
i=0
until curl -sf "${OLLAMA_URL}/api/tags" >/dev/null; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "Timed out waiting for Ollama." >&2
    exit 1
  fi
  sleep 2
done

pull_model() {
  model="$1"
  if [ -z "$model" ]; then
    return 0
  fi
  echo "Pulling Ollama model '${model}'..."
  # Ollama may report failures as {"error": ...} with HTTP 200, so check the body.
  out=$(curl -sf -X POST "${OLLAMA_URL}/api/pull" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"${model}\",\"stream\":false}") || { echo "Pull request for '${model}' failed." >&2; exit 1; }
  if printf '%s' "$out" | grep -q '"error"'; then
    echo "Pulling '${model}' failed: ${out}" >&2
    exit 1
  fi
  echo "Model '${model}' pulled."
}

pull_model "${OLLAMA_EMBED_MODEL}"
pull_model "${OLLAMA_LLM_MODEL}"
echo "All configured Ollama models are ready."

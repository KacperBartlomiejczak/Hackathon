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
  tmp_log="$(mktemp)"
  trap 'rm -f "${tmp_log}"' EXIT INT TERM
  if ! curl -sfN -X POST "${OLLAMA_URL}/api/pull" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"${model}\"}" >"${tmp_log}"; then
    cat "${tmp_log}" >&2 || true
    rm -f "${tmp_log}"
    trap - EXIT INT TERM
    echo "Failed to pull model '${model}' (HTTP/network error)." >&2
    return 1
  fi
  tail -n 5 "${tmp_log}"
  if grep -Eq '"error"[[:space:]]*:' "${tmp_log}"; then
    grep -E '"error"[[:space:]]*:' "${tmp_log}" >&2 || true
    rm -f "${tmp_log}"
    trap - EXIT INT TERM
    echo "Ollama reported an error pulling '${model}'." >&2
    return 1
  fi
  if ! grep -Eq '"status"[[:space:]]*:[[:space:]]*"success"' "${tmp_log}"; then
    rm -f "${tmp_log}"
    trap - EXIT INT TERM
    echo "Ollama pull for '${model}' did not finish with status=success." >&2
    return 1
  fi
  rm -f "${tmp_log}"
  trap - EXIT INT TERM
  echo "Model '${model}' pulled."
}

pull_model "${OLLAMA_EMBED_MODEL}"
pull_model "${OLLAMA_LLM_MODEL}"
echo "All configured Ollama models are ready."

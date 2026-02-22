#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_ACCESS_TOKEN:?Set SUPABASE_ACCESS_TOKEN to your Supabase PAT}"
: "${SUPABASE_PROJECT_REF:?Set SUPABASE_PROJECT_REF (e.g. njxgoypivrxyrukpouxb)}"

PATCH_FILE="${1:-}"
if [[ -z "${PATCH_FILE}" ]]; then
  echo "Usage: $0 <patch-json-file>" >&2
  exit 1
fi

if [[ ! -f "${PATCH_FILE}" ]]; then
  echo "Patch file not found: ${PATCH_FILE}" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required." >&2
  exit 1
fi

echo "Applying Supabase auth config patch from ${PATCH_FILE}..."
curl -sS \
  -X PATCH \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  --data @"${PATCH_FILE}" \
  "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/config/auth" | jq

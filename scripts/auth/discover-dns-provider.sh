#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-zenithlegal.com}"

if ! command -v dig >/dev/null 2>&1; then
  echo "dig is required (install via macOS Command Line Tools)." >&2
  exit 1
fi

echo "Looking up nameservers for: ${DOMAIN}"
NS_RECORDS="$(dig NS "${DOMAIN}" +short | sed 's/\.$//' | sort -u)"

if [[ -z "${NS_RECORDS}" ]]; then
  echo "No NS records found for ${DOMAIN}" >&2
  exit 1
fi

echo
echo "NS records:"
echo "${NS_RECORDS}" | sed 's/^/- /'
echo

PROVIDER="Unknown"
if echo "${NS_RECORDS}" | grep -qi 'cloudflare'; then
  PROVIDER="Cloudflare"
elif echo "${NS_RECORDS}" | grep -Eqi 'domaincontrol|godaddy'; then
  PROVIDER="GoDaddy"
elif echo "${NS_RECORDS}" | grep -qi 'registrar-servers\.com'; then
  PROVIDER="Namecheap"
elif echo "${NS_RECORDS}" | grep -qi 'awsdns'; then
  PROVIDER="Amazon Route 53"
elif echo "${NS_RECORDS}" | grep -qi 'squarespacedns'; then
  PROVIDER="Squarespace"
fi

echo "Likely DNS provider: ${PROVIDER}"

#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_SITE_URL:?Set SUPABASE_SITE_URL (e.g. zenithlegal://auth/callback or https://example.com)}"
: "${SUPABASE_REDIRECT_URLS_CSV:?Comma-separated redirect URLs (include zenithlegal://auth/callback)}"
: "${SUPABASE_SMTP_ADMIN_EMAIL:?SMTP from/admin email (e.g. no-reply@zenithlegal.com)}"
: "${SUPABASE_SMTP_HOST:?SMTP host from Resend}"
: "${SUPABASE_SMTP_PORT:?SMTP port from Resend (usually 465 or 587)}"
: "${SUPABASE_SMTP_USER:?SMTP username from Resend}"
: "${SUPABASE_SMTP_PASS:?SMTP password from Resend}"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required." >&2
  exit 1
fi

REDIRECT_KEY="${SUPABASE_REDIRECT_KEY:-additional_redirect_urls}"
REDIRECT_FORMAT="${SUPABASE_REDIRECT_FORMAT:-auto}"
SMTP_SENDER_NAME="${SUPABASE_SMTP_SENDER_NAME:-Zenith Legal}"
MAILER_AUTOCONFIRM="${SUPABASE_MAILER_AUTOCONFIRM:-false}"

if [[ "${REDIRECT_FORMAT}" == "auto" ]]; then
  if [[ "${REDIRECT_KEY}" == "uri_allow_list" ]]; then
    REDIRECT_FORMAT="string"
  else
    REDIRECT_FORMAT="array"
  fi
fi

if [[ "${REDIRECT_FORMAT}" != "string" && "${REDIRECT_FORMAT}" != "array" ]]; then
  echo "SUPABASE_REDIRECT_FORMAT must be one of: auto, string, array" >&2
  exit 1
fi

jq -n \
  --arg site_url "${SUPABASE_SITE_URL}" \
  --arg smtp_admin_email "${SUPABASE_SMTP_ADMIN_EMAIL}" \
  --arg smtp_host "${SUPABASE_SMTP_HOST}" \
  --argjson smtp_port "${SUPABASE_SMTP_PORT}" \
  --arg smtp_user "${SUPABASE_SMTP_USER}" \
  --arg smtp_pass "${SUPABASE_SMTP_PASS}" \
  --arg smtp_sender_name "${SMTP_SENDER_NAME}" \
  --arg redirect_key "${REDIRECT_KEY}" \
  --arg redirect_format "${REDIRECT_FORMAT}" \
  --arg redirects_csv "${SUPABASE_REDIRECT_URLS_CSV}" \
  --argjson external_email_enabled true \
  --argjson mailer_secure_email_change_enabled true \
  --argjson mailer_autoconfirm "${MAILER_AUTOCONFIRM}" \
  '
  {
    external_email_enabled: $external_email_enabled,
    mailer_secure_email_change_enabled: $mailer_secure_email_change_enabled,
    mailer_autoconfirm: $mailer_autoconfirm,
    site_url: $site_url,
    smtp_admin_email: $smtp_admin_email,
    smtp_host: $smtp_host,
    smtp_port: $smtp_port,
    smtp_user: $smtp_user,
    smtp_pass: $smtp_pass,
    smtp_sender_name: $smtp_sender_name
  }
  + {
    ($redirect_key): (
      if $redirect_format == "string"
      then ($redirects_csv | split(",") | map(gsub("^\\s+|\\s+$"; "")) | map(select(length > 0)) | join(","))
      else ($redirects_csv | split(",") | map(gsub("^\\s+|\\s+$"; "")) | map(select(length > 0)))
      end
    )
  }'

# Supabase Magic Link Production Setup (CLI-First)

This runbook configures production-grade email magic links for the Zenith Legal mobile app.

## Prerequisites

- Supabase project ref (example: `njxgoypivrxyrukpouxb`)
- Supabase Personal Access Token (PAT)
- Resend domain verified for `zenithlegal.com`
- Resend SMTP credentials
- Mobile app scheme configured as `zenithlegal` (already set in `apps/mobile/app.json`)

## 1) Discover DNS Provider

```bash
./scripts/auth/discover-dns-provider.sh zenithlegal.com
```

If the output is not Cloudflare (or another API-manageable DNS host you use), create DNS records manually in your DNS provider UI.

## 2) Resend Domain + SMTP

In Resend:

1. Add `zenithlegal.com` domain
2. Add DNS records Resend provides (SPF/DKIM/etc.)
3. Wait until domain is verified
4. Create SMTP credentials for Supabase Auth

Recommended sender:

- `no-reply@zenithlegal.com`
- sender name: `Zenith Legal`

## 3) Build Supabase Auth Patch Payload (CLI)

Export values (example placeholders):

```bash
export SUPABASE_SITE_URL="zenithlegal://auth/callback"
export SUPABASE_REDIRECT_URLS_CSV="zenithlegal://auth/callback"
export SUPABASE_SMTP_ADMIN_EMAIL="no-reply@zenithlegal.com"
export SUPABASE_SMTP_HOST="smtp.resend.com"
export SUPABASE_SMTP_PORT="465"
export SUPABASE_SMTP_USER="resend"
export SUPABASE_SMTP_PASS="REPLACE_WITH_RESEND_SMTP_PASSWORD"
export SUPABASE_SMTP_SENDER_NAME="Zenith Legal"
```

Build patch JSON:

```bash
./scripts/supabase/build-resend-auth-patch.sh > /tmp/zenith-auth-patch.json
cat /tmp/zenith-auth-patch.json | jq
```

Notes:

- `SUPABASE_REDIRECT_KEY` defaults to `additional_redirect_urls`.
- If Supabase Management API returns a different redirect key in your project auth config, override it:

```bash
export SUPABASE_REDIRECT_KEY="uri_allow_list"
```

## 4) Fetch Current Supabase Auth Config (CLI/API)

```bash
export SUPABASE_ACCESS_TOKEN="REPLACE_WITH_SUPABASE_PAT"
export SUPABASE_PROJECT_REF="njxgoypivrxyrukpouxb"

./scripts/supabase/get-auth-config.sh > /tmp/current-auth-config.json
cat /tmp/current-auth-config.json | jq
```

Validate which redirect allowlist field your project exposes (`additional_redirect_urls` vs another key).

## 5) Patch Supabase Auth Config (CLI/API)

```bash
./scripts/supabase/patch-auth-config.sh /tmp/zenith-auth-patch.json
```

Then verify:

```bash
./scripts/supabase/get-auth-config.sh | jq
```

And from publishable key path (mobile runtime equivalent):

```bash
SUPA_URL="$(grep EXPO_PUBLIC_SUPABASE_URL apps/mobile/.env | cut -d= -f2-)"
SUPA_KEY="$(grep EXPO_PUBLIC_SUPABASE_ANON_KEY apps/mobile/.env | cut -d= -f2-)"
curl -sS -H "apikey: $SUPA_KEY" "$SUPA_URL/auth/v1/settings" | jq
```

## 6) Mobile App Requirements (Already partially implemented)

Magic link is not enough by itself. The mobile app must:

- listen for deep-link callback URLs
- parse `code` / token params
- exchange the code for a Supabase session

The app now supports auth callback processing for:

- PKCE `code`
- access/refresh token callback params
- `token_hash` + `type` callbacks

## 7) Test Flow (Production-like)

Use an Expo dev build (not Expo Go) for stable callback testing:

1. Request magic link to external Gmail
2. Open mail on same device
3. Tap magic link
4. Confirm app opens and signs in
5. Close/reopen app and confirm session persists

## 8) Common Failure Modes

- `email rate limit exceeded`: wait 60s; avoid repeated taps
- `Unsupported phone provider`: SMS not configured; expected while email-only rollout
- `Network request failed`: usually wrong keys/network/VPN or callback not handled
- Magic link opens app but no session: redirect URL mismatch or callback exchange failure

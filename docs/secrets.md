# Secrets and Configuration

Do not commit secrets to git.

## Required Secrets

- Supabase: URL, anon key, service role key
- Stream: API key, API secret, webhook signature
- Dispatch: internal dispatch secret
- OAuth: Google and Microsoft client credentials
- Sentry DSN
- PostHog key

## Recommended Storage

- GitHub Actions secrets for CI/CD jobs
- EAS secrets for mobile builds
- Vercel project environment variables for admin app

## Rotation

- Rotate service-role and provider secrets quarterly.
- Rotate immediately on suspected exposure.
- Track rotation completion in ops runbook.

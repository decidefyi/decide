# Security Notes

This project uses server-side environment variables for secrets.

## Secrets (server-only)

Set these in Vercel Project Settings -> Environment Variables:

- `GEMINI_API_KEY`
- `AXIOM_TOKEN`
- `AXIOM_DATASET`
- `METRICS_ADMIN_TOKEN` (recommended if using `/api/metrics` in production)
- `TRACK_ALLOWED_ORIGINS` (optional allowlist for `/api/track`)

Do not expose these in client-side code or public env prefixes.

## Public values

Some values are intentionally public (safe to expose in HTML/client):

- Clerk publishable key (`pk_live_...`)

Publishable keys are not secrets. Secret Clerk keys should never be put in client code.

## Local development

- Use `.env.local` for local secrets.
- `.env.local` is gitignored and should never be committed.

## If a secret was exposed

1. Rotate the affected key immediately (provider dashboard).
2. Update the rotated value in Vercel env vars.
3. Redeploy.
4. Invalidate any leaked tokens if possible.


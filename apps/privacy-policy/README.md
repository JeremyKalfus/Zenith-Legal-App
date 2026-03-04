# Zenith Legal Privacy Policy Site

This is a static, single-language (English-only) website for the public privacy policy.

## Deploy on Vercel

1. Create a new Vercel project.
2. Point it to this repository.
3. Set **Root Directory** to `apps/privacy-policy`.
4. Framework preset: **Other**.
5. Build Command: leave empty.
6. Output Directory: leave empty.
7. Deploy.

Vercel will serve `index.html` at the root path.

## Local preview

From `apps/privacy-policy`:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

# Vannatamil News — deploy to Netlify

```
vannatamil-news/
├── netlify.toml                 Netlify settings (don't rename)
├── public/
│   └── index.html               the whole website + admin panel
└── netlify/
    └── functions/
        └── feed.mjs             pulls your YouTube / Instagram / Facebook posts
```

Keep this folder structure exactly as it is.

## Deploy (about 10 minutes, no coding)

1. **GitHub** — sign in at github.com → **New repository** → name it
   `vannatamil-news` → Create.
2. On the new repo page click **uploading an existing file**. Unzip this package
   and drag the **contents** of the `vannatamil-news` folder (`netlify.toml`,
   `public`, `netlify`, this README) into the browser. Click **Commit changes**.
3. **Netlify** — app.netlify.com → **Add new site → Import an existing project →
   GitHub** → pick `vannatamil-news`. Netlify reads `netlify.toml` itself, so
   leave every build field as it is → **Deploy**.
4. When it goes green, open `https://<your-site>.netlify.app` — the site is live.
5. Open `https://<your-site>.netlify.app/api/feed` — you should see JSON with
   `"youtube":{"ok":true,...}`. That is your videos arriving, with no keys set.

## Turn on everything else

Netlify → your site → **Site configuration → Environment variables → Add a variable**,
then **Deploys → Trigger deploy** so the function picks them up:

| Variable | What for |
|---|---|
| `YT_API_KEY` | every video you've uploaded, not just the latest 15 |
| `FB_PAGE_ID` | `61586921304748` |
| `FB_TOKEN` | Facebook page token — turns on Facebook **and** Instagram |
| `IG_USER_ID` | your Instagram business account ID |

How to get each value: see `SOCIAL-SETUP.md`.

## Admin

`https://<your-site>/#/admin` → **First time? Set your password** →
sign in with 13keerthivasan@gmail.com. Full steps in `DEPLOY.md`.

## Your domain

Netlify → **Domain management → Add a domain** → `vannatamil.news`, then set the
DNS records Netlify shows you at your domain registrar. HTTPS is automatic.

## Updating later

Edit a file on GitHub (or upload a new `index.html` into `public/`) and commit.
Netlify redeploys on its own within a minute.

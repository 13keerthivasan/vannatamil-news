# Social wall — setup

## What works the moment you deploy

Deploy the connector file and your **YouTube videos appear with no setup at all**.
Your channel ID (`UCB1g5SCLVSOKUzPVVkuXOQA`) is built in, and without a key the
connector reads YouTube's public channel feed. That gives the latest 15 uploads.

| You add | You get |
|---|---|
| nothing | latest 15 YouTube videos |
| `YT_API_KEY` | **every** video you have ever uploaded (up to 200, raise with `YT_MAX`) |
| `FB_TOKEN` + `IG_USER_ID` | every Instagram post and Facebook post as well |

The site already points at `/api/feed`, so there is nothing to change in `index.html`.

Three networks, one endpoint, no tokens in the website.

```
Instagram ─┐
Facebook  ─┼──► your connector (server) ──► /api/feed ──► index.html
YouTube   ─┘        tokens live here          public JSON      social wall
```

The website only ever receives finished JSON. Tokens sit in environment
variables on the host, where no visitor can read them. This is the part the old
site got wrong — its Facebook token was in the page source, which is both why it
expired unnoticed and why anyone could have copied it.

---

## 1. Deploy the connector

Pick the file for your host from the `connector/` folder and put it at this path
in your project:

| Host | File to use | Save it as | Endpoint becomes |
|---|---|---|---|
| Netlify | `netlify__functions__feed.mjs` | `netlify/functions/feed.mjs` | `/api/feed` |
| Vercel | `vercel__api__feed.js` | `api/feed.js` | `/api/feed` |
| Cloudflare Pages | `cloudflare__functions__api__feed.js` | `functions/api/feed.js` | `/api/feed` |

No `package.json`, no dependencies, no build step. Deploy and open
`https://yoursite/api/feed` — you should get JSON.

---

## 2. Environment variables

Set these in your host's dashboard, **not** in the repo.

| Variable | Value | Required |
|---|---|---|
| `YT_API_KEY` | YouTube Data API v3 key — optional, unlocks the full back catalogue | no |
| `YT_CHANNEL_ID` | already set to your channel | no |
| `FB_PAGE_ID` | `61586921304748` | yes |
| `FB_TOKEN` | long-lived **Page** token (step 4) | yes |
| `IG_USER_ID` | Instagram Business account id (step 5) | yes |
| `IG_TOKEN` | leave unset — reuses `FB_TOKEN`, which is correct | no |
| `GRAPH_VERSION` | default `v23.0`. Bump if Meta deprecates it | no |
| `YT_MAX` / `IG_MAX` / `FB_MAX` | how far back to go: default 200 / 120 / 100 | no |
| `CACHE_SECONDS` | default `900` (15 min) | no |
| `ALLOWED_ORIGIN` | set to `https://vannatamil.news` to lock the endpoint to your domain | no |

`index.html` already calls `/api/feed`. There is no website change to make.

---

## 3. YouTube key

1. console.cloud.google.com → new project
2. APIs & Services → Library → enable **YouTube Data API v3**
3. Credentials → Create credentials → API key
4. Restrict it: **HTTP referrers** won't work here because the call is
   server-side — restrict by **API** (YouTube Data API v3 only) instead

With a key, the connector walks your whole uploads playlist 50 videos at a
time. Each page costs 1 quota unit, so 200 videos is 4 units per refresh — about
400 a day at a 15-minute refresh, against a free allowance of 10,000. Deleted and
private uploads are skipped automatically.

---

## 4. Facebook Page token that doesn't expire

This is the step that broke last time. A *user* token dies in 60 days. A **Page**
token derived from a long-lived user token has no expiry of its own.

1. developers.facebook.com → **My Apps** → Create App → type **Business**
2. Add the **Facebook Login** product
3. Open **Graph API Explorer**, pick your app, and request these permissions:
   - `pages_show_list`
   - `pages_read_engagement`
   - `instagram_basic`
4. Generate the short-lived **User** token and copy it
5. Exchange it for a long-lived user token — run this yourself, never in a browser tab:

```bash
curl -s "https://graph.facebook.com/v23.0/oauth/access_token\
?grant_type=fb_exchange_token\
&client_id=YOUR_APP_ID\
&client_secret=YOUR_APP_SECRET\
&fb_exchange_token=SHORT_LIVED_USER_TOKEN"
```

6. Use that long-lived user token to fetch the **Page** token:

```bash
curl -s "https://graph.facebook.com/v23.0/me/accounts\
?fields=id,name,access_token\
&access_token=LONG_LIVED_USER_TOKEN"
```

Take `access_token` for the Vannatamil News page. **That** is `FB_TOKEN`.

7. Confirm it never expires:

```bash
curl -s "https://graph.facebook.com/v23.0/debug_token\
?input_token=PAGE_TOKEN\
&access_token=APP_ID|APP_SECRET"
```

You want `"type":"PAGE"`, `"expires_at":0`, `"is_valid":true`.
If `expires_at` is anything other than `0`, you exchanged the wrong token — redo step 5.

**It can still be invalidated** by: changing the Facebook password, removing the
app, or losing the Page admin role. Set a calendar reminder to open
`/api/feed?` once a quarter and check all three sources still say `"ok":true`.

---

## 5. Instagram

Instagram **Basic Display API was shut down on 4 December 2024**. Personal
accounts have no API at all now. You need a Business or Creator account linked
to the Facebook Page — you confirmed yours already is.

To get `IG_USER_ID`:

```bash
curl -s "https://graph.facebook.com/v23.0/FB_PAGE_ID\
?fields=instagram_business_account\
&access_token=PAGE_TOKEN"
```

The `instagram_business_account.id` it returns is `IG_USER_ID`. It is a long
number and is **not** the same as your Instagram username or your page id.

### App Review — not needed

Meta grants **Standard Access to every permission automatically**, and Standard
Access covers anyone with a role on the app. You are the app's admin, and the
connector fetches with your own Page token on the server — visitors to the site
never log in to Facebook or authorise anything. So there is nothing to submit
and nothing to wait for. The app can stay in Development mode.

App Review (Advanced Access) only matters for apps that ask *other people* to
connect *their* accounts. This one doesn't.

---

## 6. Checking it works

Add `?debug=1` to any page on the site. A small panel appears bottom-left
showing the endpoint and the live state of each network.

You can also hit the endpoint directly:

```bash
curl -s https://vannatamil.news/api/feed | head -c 400
```

Healthy response starts:

```json
{"ok":true,"updated":"…","sources":{"youtube":{"ok":true,"count":12},
"facebook":{"ok":true,"count":12},"instagram":{"ok":true,"count":12}},"posts":[…
```

---

## How it behaves when something breaks

This was designed around the failure you already hit.

| What happens | What visitors see |
|---|---|
| Instagram token dies | YouTube + Facebook posts still show. Instagram silently drops out. |
| All three fail | A clean "follow us" panel. **Never** a raw API error. |
| Connector not deployed yet | Same follow panel. The site works normally. |
| Endpoint slow or down | Last CDN-cached copy serves for up to 24 hours. |

Errors are written to the browser console for you, and every token string is
stripped from them before they leave the server — a leaked token in an error
message is how these things get abused.

---

## Cost

Free on all three hosts at this traffic level. The endpoint is cached for 15
minutes at the CDN, so a thousand visitors trigger roughly four upstream calls
an hour, not a thousand.

# Vannatamil News — deploy and run

Everything needed to go live. About 15 minutes.

---

## What you have

| File | Where it goes | What it does |
|---|---|---|
| `index.html` | your web root | the whole site + the admin panel |
| `connector/…feed.js` | your host's functions folder | pulls YouTube / Facebook / Instagram |
| `SOCIAL-SETUP.md` | — | tokens for the three networks |

The newsroom database is already built and waiting:

**Dashboard** → https://supabase.com/dashboard/project/lzqworlvhufxjzucpzzz
**Project URL** → `https://lzqworlvhufxjzucpzzz.supabase.co`

The URL and publishable key are already filled into `index.html`. Nothing to configure.

---

## 1. Put the site up

Drag `index.html` onto **app.netlify.com/drop** and it is live in about ten seconds.
Or connect a Git repo on Netlify / Vercel / Cloudflare Pages — there is no build
step, so leave the build command empty and set the publish directory to the
folder holding `index.html`.

Then point `vannatamil.news` at it in your host's domain settings.

---

## 2. Create your admin account

1. Open **`yoursite.com/#/admin`** (also linked at the bottom of every page)
2. Click **First time? Set your password**
3. Use **13keerthivasan@gmail.com** and pick a strong password
4. Sign in

Only three addresses can hold an account at all — yours, `admin@vannatamil.news`
and `info@vannatamil.news`. Anyone else gets *"This site does not accept public
signups"* straight from the database. Adding a reporter later is one line in the
Supabase SQL editor:

```sql
insert into public.admin_emails (email, note) values ('reporter@example.com','desk reporter');
```

**If it asks you to confirm your email**, check your inbox and click the link.
To skip that: Dashboard → Authentication → Users → Add user → tick *Auto Confirm*.

---

## 3. Fill the newsroom

On first login you will see **Import the starter stories**. That copies the
twelve stories currently built into the site into the database, where you can
edit them, rewrite them, or delete them. Until you do, the site shows those same
stories from its built-in copy, so it never looks empty.

### Writing a story

**New article** gives you Tamil and English side by side. Only the Tamil headline
is required — leave an English field blank and the Tamil shows in both modes.

- **Body** — leave a blank line between paragraphs. `**stars**` make text bold.
- **Lead image** — Upload. Up to 10 MB, stored in your own Supabase bucket.
- **YouTube video ID** — just the part after `watch?v=`. The player appears under the story.
- **Make this the lead** — puts it top-left on the front page. Only one at a time; setting a new one clears the old.
- **Save as draft** — readers cannot see it. Not "hidden by CSS": the database refuses to serve it.
- **Publish now** — live immediately.

**Settings** holds the e-paper PDF link, the edition date and a pinned live
stream, so you never have to edit HTML to change them.

---

## 4. Connect the social wall

Put the connector file for your host in place (see `SOCIAL-SETUP.md`) and deploy.
Your YouTube videos appear immediately with no keys at all. Add a YouTube key for
the full back catalogue, and the Facebook page token for Instagram and Facebook.

`index.html` already points at `/api/feed`. Skip the connector entirely and the
site still works — the wall shows follow cards instead.

---

## How the security actually works

The key in `index.html` is the **publishable** key. It is designed to be public;
every Supabase site ships one. What protects your data is row level security
inside Postgres:

| Who | Can do |
|---|---|
| Any visitor | read published articles, read settings. Nothing else. |
| Signed-in staff | read drafts, create, edit, delete, upload images |
| Anyone not on the allow-list | cannot even create an account |

I verified these rather than assuming them: as an anonymous user the database
returned only the published row and hid the draft, and an anonymous insert was
rejected with *"new row violates row-level security policy"*.

**Never put the `service_role` key in `index.html`.** It bypasses every rule
above. It belongs only in server-side environment variables.

Two things worth knowing:

- Passwords are handled by Supabase Auth and never touch the page beyond the login form.
- A signed-in session is stored in the browser and refreshes itself. Sign out on shared computers.

---

## If something looks wrong

Add **`?debug=1`** to any URL. A panel appears bottom-left showing whether the
newsroom is reachable, how many articles it returned, who is signed in, and the
state of each social network.

| Symptom | Cause |
|---|---|
| Old stories showing, not yours | Database unreachable — the site fell back to its built-in copy. Check `?debug=1`. |
| "Failed to fetch" on login | The site cannot reach Supabase. Check the project is not paused (free projects sleep after inactivity). |
| Signed in but cannot publish | Your address is not on the allow-list, or the profile row says `viewer`. |
| Social wall empty | Connector not deployed yet, or a token expired. Not an error — it shows follow cards. |

---

## Costs

Free. Supabase free tier gives 500 MB of database and 1 GB of file storage —
several thousand articles and a few thousand images. Netlify's free tier covers
the traffic. The only thing that ever costs money is a domain renewal.

Free Supabase projects pause after a week with no requests. A live site with
visitors never hits that, but if you leave it idle before launch, open the
dashboard and resume it.

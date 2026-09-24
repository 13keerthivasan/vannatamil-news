/* ── NETLIFY ─────────────────────────────────────────────────────────────
   Save as:  netlify/functions/feed.mjs
   Env vars: Site configuration → Environment variables
   Live at:  https://your-site.netlify.app/api/feed
   ──────────────────────────────────────────────────────────────────── */

/* ────────────────────────────────────────────────────────────────────────────
   VANNATAMIL NEWS — social feed connector
   Pulls YouTube uploads, Facebook Page posts and Instagram media, merges them
   into one time-sorted JSON feed, and serves it to the website.

   WHY THIS FILE EXISTS
   Facebook and Instagram access tokens must never appear in page source. Anyone
   could copy one and post as the page. They live here, on the server, as
   environment variables the browser can never read.

   ENVIRONMENT VARIABLES
     YT_CHANNEL_ID    already defaults to your channel — nothing to set
     YT_API_KEY       optional. Without it the public channel feed is used
                      (latest 15 uploads). With it, your entire back catalogue.
     FB_PAGE_ID       61586921304748
     FB_TOKEN         long-lived PAGE token (not a user token)
     IG_USER_ID       Instagram Business account id
     IG_TOKEN         optional — defaults to FB_TOKEN, which is normally correct
     GRAPH_VERSION    optional — default v23.0. Bump when Meta deprecates.
     FEED_LIMIT       optional — floor per network, default 12
     YT_MAX           optional — cap on videos pulled, default 200
     IG_MAX           optional — cap on Instagram posts, default 120
     FB_MAX           optional — cap on Facebook posts, default 100
     CACHE_SECONDS    optional — default 900 (15 min)
     ALLOWED_ORIGIN   optional — default *, set to https://vannatamil.news to lock down
   ──────────────────────────────────────────────────────────────────────────── */

const env = (e, k, d) => (e && e[k] != null && e[k] !== "" ? e[k] : d);
/* numeric env that respects 0 — `Number(x) || d` would turn a deliberate 0 back into d */
function num(e, k, d) {
  const v = env(e, k, null);
  if (v == null || v === "") return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

/* never let a token reach a log line or an error response */
function scrub(s) {
  return String(s == null ? "" : s)
    .replace(/access_token=[^&\s"']+/gi, "access_token=***")
    .replace(/\b(EAA|IGQ|IGA)[A-Za-z0-9_\-]{12,}/g, "***");
}

async function getJSON(url) {
  const res = await fetch(url);
  let j = null;
  try { j = await res.json(); } catch (_) {}
  if (!res.ok || (j && j.error)) {
    const m = (j && j.error && (j.error.message || j.error.type)) || "HTTP " + res.status;
    throw new Error(scrub(m));
  }
  return j || {};
}

/* ── YouTube ──────────────────────────────────────────────────────────────
   Two paths, both giving the whole channel:

   1. With an API key — walks the uploads playlist page by page and returns
      every upload, up to YT_MAX. A channel's uploads playlist id is always
      its channel id with UC swapped for UU, so no lookup call is needed, and
      playlistItems costs 1 quota unit per page of 50 against a 10,000 daily
      allowance. Three hundred videos is six units.

   2. With no key at all — falls back to the channel's public Atom feed. No
      credentials, nothing that can expire, but only the latest 15 uploads.
      Enough to go live today; add a key when you want the back catalogue. */
async function youtube(e, limit) {
  const ch  = env(e, "YT_CHANNEL_ID", "UCB1g5SCLVSOKUzPVVkuXOQA");
  const key = env(e, "YT_API_KEY");
  if (!ch) throw new Error("YT_CHANNEL_ID not set");
  if (!key) return youtubeRss(ch);

  const playlist = "UU" + String(ch).replace(/^UC/, "");
  const max = Math.max(limit, num(e, "YT_MAX", 200));
  const out = [];
  let page = "", guard = 0;

  while (out.length < max && guard++ < 20) {
    const u = "https://www.googleapis.com/youtube/v3/playlistItems"
      + "?part=snippet&maxResults=50"
      + "&playlistId=" + encodeURIComponent(playlist)
      + "&key=" + encodeURIComponent(key)
      + (page ? "&pageToken=" + encodeURIComponent(page) : "");
    const j = await getJSON(u);
    for (const it of (j.items || [])) {
      const s = it.snippet || {}, t = s.thumbnails || {};
      const vid = (s.resourceId && s.resourceId.videoId) || "";
      if (!vid) continue;
      /* removed uploads linger in the playlist as placeholders */
      if (s.title === "Deleted video" || s.title === "Private video") continue;
      out.push({
        id: "yt_" + vid, source: "youtube", type: "video", videoId: vid,
        url: "https://www.youtube.com/watch?v=" + vid,
        image: (t.maxres || t.standard || t.high || t.medium || t.default || {}).url || "",
        title: s.title || "", text: (s.description || "").slice(0, 300),
        published: s.publishedAt || null
      });
    }
    page = j.nextPageToken || "";
    if (!page) break;
  }
  if (!out.length) throw new Error("no uploads returned — check YT_CHANNEL_ID");
  return out.slice(0, max);
}

/* Public Atom feed: no key, no quota, nothing to expire. Latest 15 uploads. */
async function youtubeRss(ch) {
  const res = await fetch("https://www.youtube.com/feeds/videos.xml?channel_id=" + encodeURIComponent(ch));
  if (!res.ok) throw new Error("channel feed returned HTTP " + res.status);
  const xml = await res.text();
  const one = (block, re) => { const m = block.match(re); return m ? m[1] : ""; };
  const unesc = s => String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  const out = [];
  for (const raw of xml.split("<entry>").slice(1)) {
    const block = raw.split("</entry>")[0];
    const vid = one(block, /<yt:videoId>([^<]+)<\/yt:videoId>/);
    if (!vid) continue;
    out.push({
      id: "yt_" + vid, source: "youtube", type: "video", videoId: vid,
      url: "https://www.youtube.com/watch?v=" + vid,
      image: one(block, /<media:thumbnail[^>]*url="([^"]+)"/)
             || "https://i.ytimg.com/vi/" + vid + "/hqdefault.jpg",
      title: unesc(one(block, /<title>([\s\S]*?)<\/title>/)),
      text: unesc(one(block, /<media:description>([\s\S]*?)<\/media:description>/)).slice(0, 300),
      published: one(block, /<published>([^<]+)<\/published>/) || null
    });
  }
  if (!out.length) throw new Error("channel feed returned no videos — check YT_CHANNEL_ID");
  return out;
}

/* ── Facebook Page posts ─────────────────────────────────────────────────
   Pages through the history up to FB_MAX. No App Review required: Standard
   Access is granted automatically for every permission and covers people who
   hold a role on the app, which is you. */
async function facebook(e, limit, gv) {
  const id = env(e, "FB_PAGE_ID"), tok = env(e, "FB_TOKEN");
  if (!id || !tok) throw new Error("FB_PAGE_ID or FB_TOKEN not set");
  const fields = "id,message,story,created_time,permalink_url,full_picture,"
    + "attachments{media_type,url,media{image{src}}}";
  const max = Math.max(limit, num(e, "FB_MAX", 100));
  let url = "https://graph.facebook.com/" + gv + "/" + encodeURIComponent(id) + "/posts"
    + "?fields=" + encodeURIComponent(fields)
    + "&limit=50&access_token=" + encodeURIComponent(tok);
  const out = [];
  let guard = 0;
  while (url && out.length < max && guard++ < 12) {
    const j = await getJSON(url);
    for (const p of (j.data || [])) {
      if (!p.permalink_url) continue;
      const att = (p.attachments && p.attachments.data && p.attachments.data[0]) || null;
      const img = p.full_picture
        || (att && att.media && att.media.image && att.media.image.src) || "";
      const mt = (att && att.media_type) || "";
      out.push({
        id: "fb_" + p.id, source: "facebook",
        type: mt === "video" ? "video" : (img ? "image" : "text"),
        url: p.permalink_url, image: img,
        title: "", text: p.message || p.story || "",
        published: p.created_time || null
      });
    }
    url = (j.paging && j.paging.next) || "";
  }
  return out.slice(0, max);
}

/* ── Instagram media ──────────────────────────────────────────────────────
   Instagram Graph API. Basic Display was retired on 4 Dec 2024, so this needs
   a Business/Creator account linked to the Facebook Page, authenticated with
   the same Page token.

   No App Review needed here either: your server fetches with your own token,
   so site visitors never authorise the app. Pages through the full media
   history up to IG_MAX. */
async function instagram(e, limit, gv) {
  const id  = env(e, "IG_USER_ID");
  const tok = env(e, "IG_TOKEN", env(e, "FB_TOKEN"));
  if (!id || !tok) throw new Error("IG_USER_ID or token not set");
  const fields = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,"
    + "children{media_url,media_type,thumbnail_url}";
  const max = Math.max(limit, num(e, "IG_MAX", 120));
  let url = "https://graph.facebook.com/" + gv + "/" + encodeURIComponent(id) + "/media"
    + "?fields=" + encodeURIComponent(fields)
    + "&limit=50&access_token=" + encodeURIComponent(tok);
  const out = [];
  let guard = 0;
  while (url && out.length < max && guard++ < 12) {
    const j = await getJSON(url);
    for (const m of (j.data || [])) {
      if (!m.permalink) continue;
      let img = m.media_type === "VIDEO" ? (m.thumbnail_url || m.media_url) : m.media_url;
      if (m.media_type === "CAROUSEL_ALBUM") {
        const c = (m.children && m.children.data && m.children.data[0]) || null;
        if (c) img = (c.media_type === "VIDEO" ? (c.thumbnail_url || c.media_url) : c.media_url) || img;
      }
      out.push({
        id: "ig_" + m.id, source: "instagram",
        type: m.media_type === "VIDEO" ? "video"
            : (m.media_type === "CAROUSEL_ALBUM" ? "carousel" : "image"),
        url: m.permalink, image: img || "", title: "", text: m.caption || "",
        published: m.timestamp || null
      });
    }
    url = (j.paging && j.paging.next) || "";
  }
  return out.slice(0, max);
}

/* ── Aggregate ───────────────────────────────────────────────────────────
   Each network is fetched independently. One dead token never takes the
   others down, and the site still gets everything that did work.          */
let MEM = { at: 0, body: null };

async function buildFeed(e) {
  const limit = Math.max(1, Math.min(50, num(e, "FEED_LIMIT", 12)));
  const gv    = env(e, "GRAPH_VERSION", "v23.0");
  const ttl   = Math.max(0, num(e, "CACHE_SECONDS", 900)) * 1000;

  if (ttl > 0 && MEM.body && Date.now() - MEM.at < ttl) return MEM.body;

  const names = ["youtube", "facebook", "instagram"];
  const settled = await Promise.allSettled([
    youtube(e, limit), facebook(e, limit, gv), instagram(e, limit, gv)
  ]);

  const sources = {}, posts = [], seen = new Set();
  settled.forEach((r, i) => {
    const n = names[i];
    if (r.status === "fulfilled") {
      let kept = 0;
      for (const p of r.value) {
        if (seen.has(p.id)) continue;      /* same item returned twice across pages */
        seen.add(p.id); posts.push(p); kept++;
      }
      sources[n] = { ok: true, count: kept };
    } else {
      sources[n] = { ok: false, error: scrub(r.reason && r.reason.message || r.reason) };
    }
  });

  posts.sort((a, b) => new Date(b.published || 0) - new Date(a.published || 0));
  const body = { ok: posts.length > 0, updated: new Date().toISOString(), sources, posts };
  MEM = { at: Date.now(), body };
  return body;
}

async function handleRequest(request, e) {
  const ttl = Math.max(0, num(e, "CACHE_SECONDS", 900));
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": env(e, "ALLOWED_ORIGIN", "*"),
    "cache-control": "public, max-age=60, s-maxage=" + ttl + ", stale-while-revalidate=86400"
  };
  if (request && request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  try {
    return new Response(JSON.stringify(await buildFeed(e)), { status: 200, headers });
  } catch (err) {
    /* always 200 with ok:false — the website falls back cleanly and visitors
       never see an API error the way they did on the old site */
    return new Response(JSON.stringify({
      ok: false, updated: new Date().toISOString(), sources: {}, posts: [],
      error: scrub(err && err.message)
    }), { status: 200, headers });
  }
}

export default async (request) => handleRequest(request, process.env);
export const config = { path: "/api/feed" };

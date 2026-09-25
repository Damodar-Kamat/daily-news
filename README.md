# Daily Brief

A personal news page with sections (All, India, Defence, World, Business, Sports, Tech, Science,
Entertainment, Health). It is built from free public RSS feeds, with no API keys and no AI.

- `feeds.json`: the sections and their feeds. Edit this to add or remove sources.
- `fetch_news.py`: downloads the feeds and writes `site/data.js`. Uses only the Python standard library.
- `site/`: the web page (`index.html`, `style.css`, `app.js`).
- `.github/workflows/update.yml`: rebuilds and publishes the page to GitHub Pages every hour (at :15).

## Run it on your Mac

```bash
python3 fetch_news.py
python3 -m http.server 8765 -d site
```
Then open http://localhost:8765.

## Put it online (free, updates itself)

1. Create a new **public** repo on GitHub, for example `daily-news`.
2. Push this folder:
   ```bash
   git init && git add . && git commit -m "Daily Brief"
   git branch -M main
   git remote add origin https://github.com/<your-username>/daily-news.git
   git push -u origin main
   ```
3. In the repo, go to **Settings → Pages → Build and deployment → Source**, and choose **GitHub Actions**.
4. Go to **Actions → Update news → Run workflow**, or just wait for the first push to deploy.
5. Your page is at `https://<your-username>.github.io/daily-news/`. On your phone, use "Add to Home Screen".

GitHub pauses scheduled workflows in repos with no activity for 60 days. If that happens, it emails
you and you re-enable the workflow with one click in the Actions tab.

## The ⟳ refresh button

Tapping ⟳ on the page starts the GitHub job right away and reloads the page when fresh news is live (about a minute).
The first time, it asks for a GitHub **fine-grained token**:

1. Open the pre-filled form:
   https://github.com/settings/personal-access-tokens/new?name=daily-news+refresh&description=Daily+Brief+refresh+button&expires_in=366&actions=write
2. Repository access: **Only select repositories → daily-news** (links can't pre-select this).
3. Permissions should show **Actions: Read and write** and **Metadata: Read-only** (always added). If filling it by hand:
   choose the repository first, then **+ Add permissions → Actions**, and set its Access dropdown to **Read and write**.
4. Generate, copy the `github_pat_…` token and paste it into the page.

It is saved only in that browser on that device. Remove it via "Refresh button settings" at the bottom of the page,
or delete it on GitHub (Settings → Developer settings → Personal access tokens).

The page also checks every 5 minutes, and whenever you return to the tab, for a newer update, and shows a
"New stories are available" banner.

## Security

- **Least-privilege token**: fine-grained, one repo, Actions only. Full-access (`ghp_`/`gho_`) tokens are refused.
  The worst a leaked token can do is run the news update.
- **The token never leaves your device** except to `api.github.com`. It is not in the repository or the published site.
- **Untrusted feed data**: every headline, summary and source is HTML-escaped. Links and images must be plain
  `http(s)` URLs (checked in both `fetch_news.py` and `app.js`). There are no inline event handlers.
- **Content-Security-Policy** (in `index.html`): only this site's own scripts run, and the only outside
  endpoint the page can call is `api.github.com`.
- **No clickjacking**: the refresh button and token dialog are disabled if the page is shown inside another site's frame.
- **Workflow**: minimal permissions, actions pinned to exact commit SHAs, credentials not persisted, 10-minute timeout.
- Note: every GitHub Pages site you publish under `damodar-kamat.github.io` shares browser storage. Only publish
  pages you trust there, or the saved token could be read by them.

## Customising

- **Add a feed**: paste its RSS URL into a section's `feeds` list.
- **Add a section**: add a new object with `id`, `name` and `feeds`. Colours for new ids fall back to orange; set one in `COLORS` in `site/app.js`.
- **Any topic via Google News**: `https://news.google.com/rss/search?q=YOUR+TOPIC+when:1d&hl=en-IN&gl=IN&ceid=IN:en`.
  Google News items carry no images, so cap them with `{"url": "...", "limit": 10}`.
- **Default section**: the page opens on Tech. Change `DEFAULT_TAB` at the top of `site/app.js`, or link to a section directly, e.g. `.../daily-news/#defence`.
- **Hide a noisy source**: add its name to `settings.block_sources`.
- **Keyword sections**: `scan` feeds only contribute stories whose headline matches `keywords`.
  This is how Defence also picks up stories from Hindustan Times, India Today and Firstpost.

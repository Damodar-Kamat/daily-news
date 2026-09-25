# Daily Brief

A personal news page with sections (All, India, Defence, World, Business, Sports, Tech, Science,
Entertainment, Health). It is built from free public RSS feeds, with no API keys and no AI.

- `feeds.json`: the sections and their feeds. Edit this to add or remove sources.
- `fetch_news.py`: downloads the feeds and writes `site/data.js`. Uses only the Python standard library.
- `site/`: the web page (`index.html`, `style.css`, `app.js`).
- `.github/workflows/update.yml`: rebuilds and publishes the page to GitHub Pages at 6 AM and 6 PM IST.

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

## Customising

- **Add a feed**: paste its RSS URL into a section's `feeds` list.
- **Add a section**: add a new object with `id`, `name` and `feeds`. Colours for new ids fall back to orange; set one in `COLORS` in `site/app.js`.
- **Any topic via Google News**: `https://news.google.com/rss/search?q=YOUR+TOPIC+when:1d&hl=en-IN&gl=IN&ceid=IN:en`.
  Google News items carry no images, so cap them with `{"url": "...", "limit": 10}`.
- **Default section**: the page opens on Tech. Change `DEFAULT_TAB` at the top of `site/app.js`, or link to a section directly, e.g. `.../daily-news/#defence`.
- **Hide a noisy source**: add its name to `settings.block_sources`.
- **Keyword sections**: `scan` feeds only contribute stories whose headline matches `keywords`.
  This is how Defence also picks up stories from Hindustan Times, India Today and Firstpost.

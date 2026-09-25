# Daily Brief

A personal news page built from free public RSS feeds, with no API keys and no AI. It updates itself every hour on GitHub.

**Sections:** All, Top Stories, India, Bengaluru, Defence, World, Business, Sports, Tech, Science, Entertainment,
Health, हिंदी, ಕನ್ನಡ, plus Saved and Past days.

## Features

- **Two layouts**, switched with the header button (or Personalise → Layout), remembered per device:
  - **List** (default): a compact reader with about 6 stories per phone screen, plus a lead story at the top of each section.
  - **Swipe cards**: one story per screen with a big image and summary. Swipe up or down for the next story and
    left or right for the next section. On a laptop, use the mouse wheel or the ↑/↓ keys. Search results always show as a list.
- **Midnight theme** (dark) everywhere by default. Paper (light) is in Personalise → Theme.
- **Brief** tab: your morning brief. It has the top 3 stories, the #1 story from each section and your topics, plus markets,
  cricket and "On this day". Tap **Listen** to hear it.
- **Following** tab: add topics (e.g. ISRO, RCB, Namma Metro) to collect matching stories from every section.
- **Listen**: reads the headlines aloud with your device's own voices (free, works offline), highlighting each story.
  Hindi and Kannada need those voices installed on the device.
- **Videos** tab: latest videos from WION, NDTV, DD News, India Today, Firstpost, ThePrint, BBC, Al Jazeera,
  Marques Brownlee and The Verge (YouTube feeds).
- **Rain alert**: "85% chance of rain from 4 PM today" when Bengaluru rain is likely. You can dismiss it for the day.
- **Markets** (Brief and Business tabs): USD/EUR/GBP in rupees (ECB reference rates) and Bitcoin (CoinGecko).
- **Cricket** (Brief and Sports tabs): live and recent matches. This is optional and needs a free CricAPI key (see below).
- **Filters**: All / 3 hours / Today, and Latest / Most covered, above each section.
- **Text size**: A− to A++ in Personalise.
- **Reading stats** in Personalise: stories today and this week, your day streak and top sections. They stay on your device.
- **Pull to refresh** on phones. **Keyboard shortcuts** on laptops: press `?` to see them.
- **Top Stories**: the stories covered by the most outlets right now.
- **"N sources" button**: shows the other outlets covering the same story, with links.
- **New since last visit**: a NEW badge on each new story, a count on each tab, and an "Earlier stories" divider.
- **Mark as read**: stories you've opened are dimmed. Use ⋯ → Mark as unread to undo.
- **Save for later**: bookmark icon on every story, plus a Saved tab.
- **⋯ menu**: Share, Copy link, Mark as read/unread, Hide stories from this source.
- **Personalise** (sliders icon): layout, theme, hide or reorder sections, hide sources or words, clear reading history.
- **Swipe** left or right on a phone to change section.
- **Weather** for Bengaluru on one line. Tap it for the 3-day forecast (Open-Meteo, fetched at build time).
- **Past days**: browse any of the last 30 days. Search can also look through them ("Search the last 30 days too").
- **Installable app** with offline reading: "Add to Home Screen" (iPhone Safari) or "Install app" (Android Chrome).
- **⟳ refresh button** and a "New stories are available" banner. See below.
- **Feed health**: if a feed fails 3 runs in a row, GitHub opens an issue. It closes itself when the feed recovers.

Saved stories, read history and personalisation are stored **per device** (in that browser only).
On iPhone, a home-screen app has separate storage from Safari, so set the ⟳ token again inside the installed app.

## Files

| File | What it does |
|---|---|
| `feeds.json` | Sections, their feeds, weather location and settings. Edit this to add or remove sources. |
| `fetch_news.py` | Downloads the feeds and writes `site/data.js`. Only uses Python's standard library. |
| `cluster.py` | Groups headlines about the same story (Top Stories and "N sources"). |
| `weather.py` | Fetches the weather and the rain alert from Open-Meteo. |
| `extras.py` | Markets, "On this day" and cricket scores. |
| `archive.py` | Keeps 30 days of stories on the `archive` branch and publishes them under `site/archive/`. |
| `feed_health.py` | Tracks failing feeds and opens or closes GitHub issues. |
| `site/` | The page: `index.html`, `style.css`, `app.js`, `sw.js` (offline), `manifest.webmanifest`, `icons/`. |
| `.github/workflows/update.yml` | Hourly build (at :15) and publish to GitHub Pages. |
| `.github/dependabot.yml` | Weekly pull requests to update the pinned GitHub Actions versions. |

The `archive` branch is written by the workflow. It always holds a single snapshot commit, so it never grows.
Don't edit it by hand.

## Run it on your Mac

```bash
python3 fetch_news.py
python3 -m http.server 8765 -d site
```
Then open http://localhost:8765. To also build a local archive: `python3 fetch_news.py --store store`.

## Put it online (free, updates itself)

1. Create a **public** repo on GitHub. Pages is free only for public repos, and the repo contains no secrets.
2. Push this folder to it.
3. **Settings → Pages → Source: GitHub Actions**.
4. **Actions → Update news → Run workflow**.
5. Your page is at `https://<your-username>.github.io/daily-news/`.

GitHub pauses scheduled workflows in repos with no activity for 60 days. If that happens, it emails you,
and you re-enable the workflow with one click in the Actions tab.

## The ⟳ refresh button

Tapping ⟳ starts the GitHub job right away. The page reloads when fresh news is live, about a minute later.
The first time, it asks for a GitHub **fine-grained token**:

1. Open the pre-filled form:
   https://github.com/settings/personal-access-tokens/new?name=daily-news+refresh&description=Daily+Brief+refresh+button&expires_in=366&actions=write
2. Repository access: **Only select repositories → daily-news**. Links can't pre-select this.
3. Permissions should show **Actions: Read and write** and **Metadata: Read-only**, which is always added.
   If filling it in by hand: choose the repository first, then **+ Add permissions → Actions**, and set its Access dropdown to **Read and write**.
4. Generate the token, copy it (`github_pat_…`) and paste it into the page.

It is saved only in that browser on that device. To change or remove it, go to Personalise → "Refresh button token…",
or delete it on GitHub (Settings → Developer settings → Personal access tokens).

## Cricket scores (optional)

1. Sign up free at https://cricapi.com (100 requests a day is plenty for hourly updates) and copy your API key.
2. In the GitHub repo, go to **Settings → Secrets and variables → Actions → New repository secret**.
   Name it `CRICAPI_KEY` and paste the key as the value.
3. Run **Actions → Update news → Run workflow**. Scores appear on the Brief and Sports tabs.

The key stays in GitHub's encrypted secrets. It is only given to the "Fetch feeds" step and never written to the site.

## Security

- **Least-privilege token**: fine-grained, one repo, Actions only. Full-access (`ghp_`/`gho_`) tokens are refused.
  The worst a leaked token can do is run the news update.
- **The token never leaves your device** except to go to `api.github.com`. It is not in the repository or on the published site,
  and the offline cache (`sw.js`) never touches GitHub API requests.
- **Untrusted feed data**: every headline, summary and source is HTML-escaped. Links and images must be plain
  `http(s)` URLs, checked in both `fetch_news.py` and `app.js`. There are no inline scripts, styles or event handlers.
- **Content-Security-Policy** (in `index.html`): only this site's own scripts run, and the only outside
  endpoint the page can call is `api.github.com`.
- **No clickjacking**: the refresh button and token dialog are disabled if the page is shown inside another site's frame.
- **Workflow**: no permissions by default. The build job can only write the archive branch and issues; the deploy job can only
  publish Pages. Actions are pinned to exact commit SHAs (kept current by Dependabot), checkout credentials are
  not persisted, and each job has a time limit.
- Note: every GitHub Pages site you publish under `damodar-kamat.github.io` shares browser storage. Only publish
  pages you trust there, or the saved token could be read by them.

## Customising

- **Add a feed**: paste its RSS URL into a section's `feeds` list.
- **Add a section**: add a new object with `id`, `name` and `feeds`. Colours for new ids fall back to orange;
  set one in `COLORS` in `site/app.js`. For a non-English section, add `"lang": "xx"`. It is then kept out of All and Top Stories.
- **Any topic via Google News**: `https://news.google.com/rss/search?q=YOUR+TOPIC+when:1d&hl=en-IN&gl=IN&ceid=IN:en`.
  Google News items carry no images, so cap them with `{"url": "...", "limit": 10}`.
- **Weather city**: change `weather` in `feeds.json` (city name, latitude, longitude).
- **Default section**: the page opens on Tech. Change `DEFAULT_TAB` at the top of `site/app.js`, or link to a
  section directly, e.g. `.../daily-news/#defence`.
- **Hide a noisy source for everyone**: add its name to `settings.block_sources`. For just one device, use ⋯ → Hide.
- **Keyword sections**: `scan` feeds only contribute stories whose headline matches `keywords`.
  This is how Defence and Bengaluru also pick up stories from Hindustan Times, India Today and The Hindu.
- **Top Stories**: `settings.top_stories` sets `min_sources`, `limit` and `max_age_hours`.
- **Archive length**: `settings.archive_days` (default 30).

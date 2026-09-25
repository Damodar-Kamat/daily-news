#!/usr/bin/env python3
"""Fetch RSS/Atom feeds listed in feeds.json and write site/data.js for the dashboard.

Standard library only, so it runs anywhere with Python 3.9+:
    python3 fetch_news.py
"""
import html
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / "feeds.json"
OUT = ROOT / "site" / "data.js"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
NS = {
    "media": "http://search.yahoo.com/mrss/",
    "content": "http://purl.org/rss/1.0/modules/content/",
    "atom": "http://www.w3.org/2005/Atom",
    "dc": "http://purl.org/dc/elements/1.1/",
}


def http_get(url, timeout=15, limit=None):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(limit) if limit else r.read()


def text(el):
    return (el.text or "").strip() if el is not None else ""


def strip_html(s):
    s = re.sub(r"<[^>]+>", " ", s or "")
    s = html.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def parse_date(s):
    if not s:
        return None
    try:
        d = parsedate_to_datetime(s)
    except (TypeError, ValueError):
        try:
            d = datetime.fromisoformat(s.strip().replace("Z", "+00:00"))
        except ValueError:
            return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc)


def find_image(item, raw_html):
    best, best_w = None, -1
    for tag in ("media:content", "media:thumbnail", "media:group/media:content"):
        for m in item.findall(tag, NS):
            url = m.get("url")
            if not url or (m.get("medium") not in (None, "image") and "image" not in (m.get("type") or "image")):
                continue
            w = int(m.get("width") or 0)
            if w > best_w:
                best, best_w = url, w
    if best:
        return best
    for enc in item.findall("enclosure"):
        if (enc.get("type") or "").startswith("image") and enc.get("url"):
            return enc.get("url")
    m = re.search(r"<img[^>]+src=[\"']([^\"']+)", raw_html or "")
    return html.unescape(m.group(1)) if m else None


def source_name(url):
    host = urlparse(url).netloc.replace("www.", "").replace("feeds.", "")
    known = {
        "thehindu.com": "The Hindu", "indianexpress.com": "Indian Express", "bbc.co.uk": "BBC",
        "bbc.com": "BBC", "aljazeera.com": "Al Jazeera", "espncricinfo.com": "ESPNcricinfo",
        "techcrunch.com": "TechCrunch", "theverge.com": "The Verge", "arstechnica.com": "Ars Technica",
        "livemint.com": "Mint", "economictimes.indiatimes.com": "Economic Times",
        "timesofindia.indiatimes.com": "Times of India", "theprint.in": "ThePrint", "idrw.org": "IDRW",
        "sciencedaily.com": "ScienceDaily", "ndtv.com": "NDTV", "gadgets360.com": "Gadgets 360",
        "sports.ndtv.com": "NDTV Sports", "indiandefensenews.in": "Indian Defence News",
        "defencexp.com": "DefenceXP", "firstpost.com": "Firstpost", "hindustantimes.com": "Hindustan Times",
        "indiatoday.in": "India Today", "theweek.in": "The Week",
    }
    for k, v in known.items():
        if host.endswith(k):
            return v
    return host


def parse_feed(url, data):
    root = ET.fromstring(data)
    items = []
    channel_title = text(root.find("channel/title"))
    entries = root.findall("channel/item") or root.findall("item")
    atom = False
    if not entries:
        entries = root.findall("atom:entry", NS)
        atom = True
    for it in entries:
        if atom:
            title = text(it.find("atom:title", NS))
            link_el = it.find("atom:link[@rel='alternate']", NS)
            if link_el is None:
                link_el = it.find("atom:link", NS)
            link = link_el.get("href") if link_el is not None else ""
            raw = text(it.find("atom:content", NS)) or text(it.find("atom:summary", NS))
            date = parse_date(text(it.find("atom:published", NS)) or text(it.find("atom:updated", NS)))
        else:
            title = text(it.find("title"))
            link = text(it.find("link")) or text(it.find("guid"))
            raw = text(it.find("content:encoded", NS)) or text(it.find("description"))
            date = parse_date(text(it.find("pubDate")) or text(it.find("dc:date", NS)))
        title = strip_html(title)
        if not title or not link:
            continue
        source = None
        if "news.google.com" in url:
            src_el = it.find("source")
            source = text(src_el) or None
            if source and title.endswith(" - " + source):
                title = title[: -len(" - " + source)]
            raw = ""  # Google News descriptions are just link lists
        summary = strip_html(raw)
        if len(summary) > 220:
            summary = summary[:217].rsplit(" ", 1)[0] + "…"
        img = find_image(it, raw)
        if img and img.startswith("//"):
            img = "https:" + img
        items.append({
            "title": title,
            "link": link.strip(),
            "summary": summary,
            "image": img,
            "source": source or source_name(link) or channel_title,
            "published": date.isoformat() if date else None,
        })
    return items


def fetch_feed(url):
    try:
        return url, parse_feed(url, http_get(url)), None
    except Exception as e:  # noqa: BLE001 - one bad feed must not kill the run
        return url, [], str(e)[:120]


def fetch_og_image(link):
    if "news.google.com" in link:
        return None
    try:
        page = http_get(link, timeout=8, limit=300_000).decode("utf-8", "ignore")
    except Exception:
        return None
    for pat in (
        r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
        r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)',
    ):
        m = re.search(pat, page)
        if m:
            return html.unescape(m.group(1))
    return None


def keyword_matcher(keywords):
    """Whole-word match; acronyms like LoC/IAF (2+ capitals) are case-sensitive."""
    if not keywords:
        return None
    exact = [k for k in keywords if sum(ch.isupper() for ch in k) >= 2]
    loose = [k for k in keywords if k not in exact]
    pats = []
    if exact:
        pats.append(re.compile(r"\b(" + "|".join(map(re.escape, exact)) + r")\b"))
    if loose:
        pats.append(re.compile(r"\b(" + "|".join(map(re.escape, loose)) + r")\b", re.I))
    return lambda t: any(p.search(t) for p in pats)


def norm_title(t):
    # First ~60 chars of the normalised headline: catches the same story syndicated by several outlets.
    return re.sub(r"[^a-z0-9]+", " ", t.lower()).strip()[:60]


def main():
    cfg = json.loads(CONFIG.read_text())
    settings = cfg["settings"]

    # A feed entry is either a URL string or {"url": ..., "limit": N}.
    limits = {}
    for c in cfg["categories"]:
        urls = []
        for f in c["feeds"]:
            if isinstance(f, dict):
                limits[f["url"]] = f.get("limit")
                f = f["url"]
            urls.append(f)
        c["feeds"] = urls
    all_urls = {u for c in cfg["categories"] for u in c["feeds"] + c.get("scan", [])}
    with ThreadPoolExecutor(16) as ex:
        results = {u: (items, err) for u, items, err in ex.map(fetch_feed, all_urls)}
    for u, n in limits.items():
        if n:
            results[u] = (results[u][0][:n], results[u][1])

    for u, (items, err) in sorted(results.items()):
        print(f"{'FAIL' if err else 'ok  '} {len(items):4d}  {u}" + (f"  ({err})" if err else ""), file=sys.stderr)

    categories = []
    for cat in cfg["categories"]:
        pool = []
        for u in cat["feeds"]:
            pool.extend(results[u][0])
        # "scan" feeds only contribute stories whose title matches the section's keywords.
        kw = keyword_matcher(cat.get("keywords", []))
        for u in cat.get("scan", []):
            pool.extend(dict(it) for it in results[u][0] if kw and kw(it["title"]))
        categories.append({"id": cat["id"], "name": cat["name"], "items": pool,
                           "max_age": cat.get("max_age_hours", settings["max_age_hours"])})

    blocked = {s.lower() for s in settings.get("block_sources", [])}

    # Filter old items and blocked sources, dedupe, sort newest first, cap.
    now = datetime.now(timezone.utc)
    for c in categories:
        cutoff = now - timedelta(hours=c.pop("max_age"))
        seen, kept = set(), []
        for it in c["items"]:
            key = norm_title(it["title"])
            if key in seen or it["source"].lower() in blocked:
                continue
            if it["published"] and datetime.fromisoformat(it["published"]) < cutoff:
                continue
            seen.add(key)
            kept.append(it)
        kept.sort(key=lambda i: i["published"] or "", reverse=True)
        c["items"] = kept[: settings["per_category"]]

    if settings.get("fetch_missing_images"):
        missing = [it for c in categories for it in c["items"] if not it["image"]]
        uniq = list({it["link"]: it for it in missing})
        with ThreadPoolExecutor(16) as ex:
            found = dict(zip(uniq, ex.map(fetch_og_image, uniq)))
        for it in missing:
            it["image"] = found.get(it["link"])
        print(f"og:image lookups: {sum(1 for v in found.values() if v)}/{len(uniq)} found", file=sys.stderr)

    # "All" tab: round-robin across categories so the mix stays varied.
    mixed, seen = [], set()
    queues = [list(c["items"]) for c in categories]
    while any(queues) and len(mixed) < settings["all_tab_limit"]:
        for c, q in zip(categories, queues):
            while q:
                it = q.pop(0)
                key = norm_title(it["title"])
                if key not in seen:
                    seen.add(key)
                    mixed.append({**it, "category": c["name"]})
                    break

    for c in categories:
        for it in c["items"]:
            it["category"] = c["name"]

    data = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "categories": [{"id": "all", "name": "All", "items": mixed}] + categories,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("window.NEWS_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n")
    total = sum(len(c["items"]) for c in categories)
    print(f"Wrote {OUT.relative_to(ROOT)}: {total} stories across {len(categories)} sections", file=sys.stderr)


if __name__ == "__main__":
    main()

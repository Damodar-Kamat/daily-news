#!/usr/bin/env python3
"""Fetch RSS/Atom feeds listed in feeds.json and write site/data.js for the dashboard.

Standard library only, so it runs anywhere with Python 3.9+:
    python3 fetch_news.py                 # just the news (local preview)
    python3 fetch_news.py --store store   # also update the archive + feed health (GitHub Actions)
"""
import argparse
import hashlib
import html
import json
import re
import shutil
import sys
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlparse

import archive
import cluster
import feed_health
import weather

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


MAX_BYTES = 5_000_000  # no feed or page we read should ever be bigger than this


def http_get(url, timeout=15, limit=MAX_BYTES):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(limit)


def safe_url(u):
    """Return u only if it is a plain http(s) URL; images are upgraded to https.

    Feeds are untrusted input: a javascript: or data: link must never reach the page.
    """
    u = (u or "").strip()
    if u.startswith("//"):
        u = "https:" + u
    try:
        parts = urlparse(u)
    except ValueError:
        return None
    if parts.scheme not in ("http", "https") or not parts.netloc:
        return None
    return u


def text(el):
    return (el.text or "").strip() if el is not None else ""


def strip_html(s):
    # Unescape first: some feeds double-escape their HTML (&lt;p&gt;), which would otherwise show as "<p>".
    s = html.unescape(s or "")
    s = re.sub(r"<[^>]+>", " ", s)
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
        "indiatoday.in": "India Today", "theweek.in": "The Week", "bollywoodhungama.com": "Bollywood Hungama",
        "cricinfo.com": "ESPNcricinfo", "ndtv.in": "NDTV India", "aajtak.in": "Aaj Tak", "amarujala.com": "Amar Ujala",
        "asianetnews.com": "Asianet Kannada", "tv9kannada.com": "TV9 Kannada", "prajavani.net": "Prajavani",
        "oneindia.com": "OneIndia Kannada", "newindianexpress.com": "New Indian Express", "ssbcrack.com": "SSBCrack",
        "manoramayearbook.in": "Manorama Yearbook", "cxodigitalpulse.com": "CXO Digital Pulse",
    }
    for k, v in known.items():
        if host.endswith(k):
            return v
    return host


def story_id(link):
    """Short stable id for a story, so the page can track new/read stories without every section loaded."""
    return hashlib.sha1(link.encode()).hexdigest()[:10]


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
            if source and re.fullmatch(r"[\w.-]+\.[a-z]{2,}", source):  # Google sometimes gives a bare domain
                source = source_name("https://" + source)
            raw = ""  # Google News descriptions are just link lists
        summary = strip_html(raw)
        if len(summary) > 220:
            summary = summary[:217].rsplit(" ", 1)[0] + "…"
        link = safe_url(link)
        if not link:
            continue
        img = safe_url(find_image(it, raw))
        if img and img.startswith("http://"):
            img = "https://" + img[len("http://"):]
        items.append({
            "id": story_id(link),
            "title": title,
            "link": link,
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
            img = safe_url(html.unescape(m.group(1)))
            if img and img.startswith("http://"):
                img = "https://" + img[len("http://"):]
            return img
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
    # \w is Unicode-aware, so Hindi/Kannada headlines keep their letters.
    return re.sub(r"[\W_]+", " ", t.lower()).strip()[:60]


def log(msg):
    print(msg, file=sys.stderr)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--store", help="directory holding the archive and feed-health state (the `archive` branch)")
    args = ap.parse_args()

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
        log(f"{'FAIL' if err else 'ok  '} {len(items):4d}  {u}" + (f"  ({err})" if err else ""))

    categories = []
    for cat in cfg["categories"]:
        pool = []
        for u in cat["feeds"]:
            pool.extend(dict(it) for it in results[u][0])
        # "scan" feeds only contribute stories whose title matches the section's keywords.
        kw = keyword_matcher(cat.get("keywords", []))
        for u in cat.get("scan", []):
            pool.extend(dict(it) for it in results[u][0] if kw and kw(it["title"]))
        categories.append({"id": cat["id"], "name": cat["name"], "lang": cat.get("lang"), "items": pool,
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
        for it in c["items"]:
            it["category"] = c["name"]

    if settings.get("fetch_missing_images"):
        missing = [it for c in categories for it in c["items"] if not it["image"]]
        uniq = list({it["link"]: it for it in missing})
        with ThreadPoolExecutor(16) as ex:
            found = dict(zip(uniq, ex.map(fetch_og_image, uniq)))
        for it in missing:
            it["image"] = found.get(it["link"])
        log(f"og:image lookups: {sum(1 for v in found.values() if v)}/{len(uniq)} found")

    english = [c for c in categories if not c["lang"]]

    # Same story across outlets → "covered by N sources" links, and the Top Stories tab.
    unique = list({it["link"]: it for c in english for it in c["items"]}.values())
    top_cfg = settings.get("top_stories", {})
    also, top = {}, []
    top_cutoff = (now - timedelta(hours=top_cfg.get("max_age_hours", 24))).isoformat()
    for group in cluster.cluster(unique):
        by_source = {}
        for it in sorted(group, key=lambda i: i["published"] or "", reverse=True):
            by_source.setdefault(it["source"], it)
        if len(by_source) < 2:
            continue
        for it in group:
            also[it["link"]] = [
                {"source": o["source"], "link": o["link"], "title": o["title"]}
                for o in by_source.values() if o["source"] != it["source"]
            ][:6]
        lead = cluster.pick_lead(list(by_source.values()))
        newest = max((i["published"] or "") for i in group)
        if len(by_source) >= top_cfg.get("min_sources", 2) and newest >= top_cutoff:
            top.append((len(by_source), newest, lead))
    for c in categories:
        for it in c["items"]:
            if it["link"] in also:
                it["also"] = also[it["link"]]
    top.sort(key=lambda t: (t[0], t[1]), reverse=True)
    top_items = [{**lead, "coverage": n} for n, _, lead in top[: top_cfg.get("limit", 30)]]

    # "All" tab: round-robin across the English sections so the mix stays varied.
    mixed, seen = [], set()
    queues = [list(c["items"]) for c in english]
    while any(queues) and len(mixed) < settings["all_tab_limit"]:
        for q in queues:
            while q:
                it = q.pop(0)
                key = norm_title(it["title"])
                if key not in seen:
                    seen.add(key)
                    mixed.append(it)
                    break

    sections = [{"id": "all", "name": "All", "items": mixed}]
    if top_items:
        sections.append({"id": "top", "name": "Top Stories", "items": top_items})
    for c in categories:
        sections.append({"id": c["id"], "name": c["name"], "items": c["items"], **({"lang": c["lang"]} if c["lang"] else {})})

    # Lazy loading: data.js carries only the first stories of each section (fast first paint) plus every
    # story id (for "new" counts); each section's full list is in site/data/<id>.json, fetched on demand.
    first = settings.get("first_load", 20)
    data_dir = OUT.parent / "data"
    if data_dir.exists():
        shutil.rmtree(data_dir)
    data_dir.mkdir(parents=True)
    compact = {"ensure_ascii": False, "separators": (",", ":")}
    for sec in sections:
        (data_dir / f"{sec['id']}.json").write_text(json.dumps({"id": sec["id"], "items": sec["items"]}, **compact))
    data = {
        "generated": now.isoformat(),
        "weather": weather.fetch_weather(cfg.get("weather"), http_get),
        "archive": bool(args.store),
        "categories": [
            {**{k: v for k, v in sec.items() if k != "items"},
             "total": len(sec["items"]), "ids": [it["id"] for it in sec["items"]], "items": sec["items"][:first]}
            for sec in sections
        ],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("window.NEWS_DATA = " + json.dumps(data, **compact) + ";\n")
    # Tiny file the page polls to learn that a newer update has been published.
    (OUT.parent / "version.json").write_text(json.dumps({"generated": data["generated"]}) + "\n")
    total = sum(len(c["items"]) for c in categories)
    log(f"Wrote {OUT.relative_to(ROOT)}: {total} stories across {len(categories)} sections, "
        f"{len(top_items)} top stories, {len(also)} with other-outlet links")

    if args.store:
        stories = list({it["link"]: it for c in categories for it in c["items"]}.values())
        index = archive.update(args.store, OUT.parent, stories, settings.get("archive_days", 30), now)
        log(f"Archive: {len(index)} days, today {index[0]['count'] if index else 0} stories")
        health = feed_health.record(args.store, results)
        bad = {u: h["fails"] for u, h in health.items() if h["fails"]}
        log(f"Feed health: {len(bad)} failing " + (str(bad) if bad else ""))


if __name__ == "__main__":
    main()

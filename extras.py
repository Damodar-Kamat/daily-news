"""Small extra panels for the page: markets, "on this day", and cricket scores.

Each function returns a small dict/list for data.js, or None on any failure, so a broken
source never breaks the news build. All three use free services; only cricket needs a key.
"""
import json
import sys
from datetime import date, datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))


def _log(msg):
    print(msg, file=sys.stderr)


def markets(http_get):
    """USD/EUR/GBP in rupees (ECB reference rates via Frankfurter) and Bitcoin (CoinGecko). No keys needed."""
    out = []
    try:
        start = (date.today() - timedelta(days=7)).isoformat()
        series = json.loads(http_get(f"https://api.frankfurter.app/{start}..?from=INR&to=USD,EUR,GBP", timeout=15))
        days = sorted(series["rates"])
        last, prev = series["rates"][days[-1]], series["rates"][days[-2]] if len(days) > 1 else None
        for code, label in (("USD", "US dollar"), ("EUR", "Euro"), ("GBP", "Pound")):
            now_inr = 1 / last[code]
            change = (now_inr / (1 / prev[code]) - 1) * 100 if prev else None
            out.append({"id": code, "label": label, "value": round(now_inr, 2), "unit": "₹",
                        "change": round(change, 2) if change is not None else None, "asof": days[-1]})
    except Exception as e:  # noqa: BLE001
        _log(f"markets: currencies skipped ({str(e)[:80]})")
    try:
        btc = json.loads(http_get(
            "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=inr&include_24hr_change=true",
            timeout=15))["bitcoin"]
        out.append({"id": "BTC", "label": "Bitcoin", "value": round(btc["inr"]), "unit": "₹",
                    "change": round(btc["inr_24h_change"], 2)})
    except Exception as e:  # noqa: BLE001
        _log(f"markets: bitcoin skipped ({str(e)[:80]})")
    return out or None


def on_this_day(http_get, count=3):
    """A few 'on this day' events from Wikipedia, India-related ones first."""
    today = datetime.now(IST)
    try:
        raw = json.loads(http_get(
            f"https://en.wikipedia.org/api/rest_v1/feed/onthisday/selected/{today:%m}/{today:%d}", timeout=15))
    except Exception as e:  # noqa: BLE001
        _log(f"onthisday: skipped ({str(e)[:80]})")
        return None
    events = []
    for ev in raw.get("selected", []):
        text, year = ev.get("text"), ev.get("year")
        if not text or not isinstance(year, int):
            continue
        page = next((p for p in ev.get("pages", []) if p.get("content_urls")), None)
        link = page["content_urls"]["mobile"]["page"] if page else None
        india = any(w in text for w in ("India", "Indian", "Delhi", "Mumbai", "Bengaluru", "Bangalore", "Karnataka"))
        events.append({"year": year, "text": text[:260], "link": link, "_india": india})
    events.sort(key=lambda e: (not e["_india"], -e["year"]))
    for e in events:
        e.pop("_india")
    return events[:count] or None


def cricket(http_get, api_key):
    """Current matches from CricAPI (free account, 100 calls/day). Returns None when no key is set."""
    if not api_key:
        return None
    try:
        raw = json.loads(http_get(f"https://api.cricapi.com/v1/currentMatches?apikey={api_key}&offset=0", timeout=15))
    except Exception as e:  # noqa: BLE001
        _log(f"cricket: skipped ({str(e)[:60]})")  # never log the URL: it contains the key
        return None
    if raw.get("status") != "success":
        _log(f"cricket: skipped ({str(raw.get('reason', 'error'))[:60]})")
        return None
    matches = []
    for m in raw.get("data", []):
        teams = m.get("teams") or []
        scores = [f"{s.get('inning', '')}: {s.get('r', 0)}/{s.get('w', 0)} ({s.get('o', 0)} ov)" for s in m.get("score") or []]
        matches.append({
            "name": str(m.get("name", ""))[:120], "status": str(m.get("status", ""))[:120],
            "type": str(m.get("matchType", "")).upper()[:10], "scores": scores[:4],
            "live": bool(m.get("matchStarted")) and not m.get("matchEnded"),
            "india": any("India" in t for t in teams),
            "date": str(m.get("dateTimeGMT", ""))[:20],
        })
    # India first, then live matches, then the most recent.
    matches.sort(key=lambda m: (not m["india"], not m["live"], m["date"]), reverse=False)
    return matches[:6] or None

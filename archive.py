"""Day-by-day archive of stories, kept on the `archive` git branch and published under site/archive/.

Every hourly run merges the current stories into the file for the day they were published
(Indian time), so each day's file ends up holding everything seen that day.
"""
import json
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path

IST = timezone(timedelta(hours=5, minutes=30))
FIELDS = ("title", "link", "image", "source", "published", "category")
PER_DAY = 900


def _day_of(item, now):
    if item.get("published"):
        return datetime.fromisoformat(item["published"]).astimezone(IST).date().isoformat()
    return now.astimezone(IST).date().isoformat()


def update(store, site, items, keep_days, now=None):
    """Merge `items` into store/archive/<day>.json, prune old days, and copy the archive into site/archive/."""
    now = now or datetime.now(timezone.utc)
    adir = Path(store) / "archive"
    adir.mkdir(parents=True, exist_ok=True)
    today = now.astimezone(IST).date()
    # Only touch today and yesterday; older days are final.
    writable = {today.isoformat(), (today - timedelta(days=1)).isoformat()}

    by_day = {}
    for it in items:
        day = _day_of(it, now)
        if day in writable:
            by_day.setdefault(day, []).append({k: it.get(k) for k in FIELDS})

    for day, new in by_day.items():
        path = adir / f"{day}.json"
        old = json.loads(path.read_text())["items"] if path.exists() else []
        merged = {i["link"]: i for i in old}
        for i in new:
            merged.setdefault(i["link"], i)
        rows = sorted(merged.values(), key=lambda i: i.get("published") or "", reverse=True)[:PER_DAY]
        path.write_text(json.dumps({"date": day, "items": rows}, ensure_ascii=False, separators=(",", ":")))

    cutoff = (today - timedelta(days=keep_days - 1)).isoformat()
    index = []
    for path in sorted(adir.glob("*.json"), reverse=True):
        if path.name == "index.json":
            continue
        if path.stem < cutoff:
            path.unlink()
            continue
        index.append({"date": path.stem, "count": len(json.loads(path.read_text())["items"])})
    (adir / "index.json").write_text(json.dumps(index))

    out = Path(site) / "archive"
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(adir, out)
    return index

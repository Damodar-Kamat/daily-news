#!/usr/bin/env python3
"""Track failing feeds and open a GitHub issue when one fails 3 runs in a row.

fetch_news.py calls record() after every run. In GitHub Actions, the workflow then runs
    python feed_health.py <store-dir>
which opens an issue per broken feed and closes it again once the feed recovers.
Needs GITHUB_TOKEN (issues: write) and GITHUB_REPOSITORY in the environment.
"""
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

FAILS_BEFORE_ISSUE = 3
TITLE = "Feed failing: "


def record(store, results):
    """results: {url: (items, error_or_None)}. Updates store/health.json."""
    path = Path(store) / "health.json"
    health = json.loads(path.read_text()) if path.exists() else {}
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    for url, (_, err) in results.items():
        h = health.setdefault(url, {"fails": 0})
        if err:
            h["fails"] += 1
            h["error"] = err
            h.setdefault("since", now)
        else:
            health[url] = {"fails": 0}
    # Forget feeds that were removed from feeds.json.
    for url in list(health):
        if url not in results:
            del health[url]
    path.write_text(json.dumps(health, indent=1, sort_keys=True))
    return health


def _api(method, path, body=None):
    req = urllib.request.Request(
        "https://api.github.com" + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Authorization": "Bearer " + os.environ["GITHUB_TOKEN"],
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read() or "null")


def main(store):
    repo = os.environ.get("GITHUB_REPOSITORY")
    if not repo or not os.environ.get("GITHUB_TOKEN"):
        print("feed_health: not running in GitHub Actions, skipping issues")
        return
    health = json.loads((Path(store) / "health.json").read_text())
    open_issues = {
        i["title"][len(TITLE):]: i["number"]
        for i in _api("GET", f"/repos/{repo}/issues?state=open&per_page=100")
        if i["title"].startswith(TITLE) and "pull_request" not in i
    }
    for url, h in health.items():
        if h["fails"] >= FAILS_BEFORE_ISSUE and url not in open_issues:
            _api("POST", f"/repos/{repo}/issues", {
                "title": TITLE + url,
                "body": (
                    f"This feed has failed **{h['fails']} runs in a row** (since {h.get('since', '?')}).\n\n"
                    f"Last error: `{h.get('error', '?')}`\n\n"
                    "Fix: open `feeds.json` and replace or remove this URL. "
                    "This issue closes itself when the feed works again."
                ),
            })
            print(f"feed_health: opened issue for {url}")
    for url, number in open_issues.items():
        if health.get(url, {"fails": 0})["fails"] == 0:
            note = "The feed is working again." if url in health else "The feed was removed from feeds.json."
            _api("POST", f"/repos/{repo}/issues/{number}/comments", {"body": note + " Closing."})
            _api("PATCH", f"/repos/{repo}/issues/{number}", {"state": "closed"})
            print(f"feed_health: closed issue #{number} for {url}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "store")

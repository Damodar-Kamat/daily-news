"""Group headlines about the same story across outlets (no AI: weighted word overlap).

Two headlines are "the same story" when they share enough *distinctive* words. Each word is
weighted by how rare it is across today's headlines (IDF), so names and places ("BrahMos",
"Mahendragiri") count for a lot and filler ("India", "says", "new") counts for little.
"""
import math
import re
from collections import Counter, defaultdict

STOP = set("""
a an and are as at be been being but by can could did do does for from had has have he her his how i if in
into is it its just may more most much new no not now of off on once one only or our out over own said says
say she so some than that the their them then there these they this those to too under up upon us very was
we were what when where which while who why will with would you your after before about against amid also
again all any back become becomes between both during each even ever first get gets got here last like
make makes many next other per same should since still such take takes two three week year years day days
today yesterday tomorrow time times amid via vs video watch live latest update updates news report reports
know things explained explainer check full list top big why what's here's
""".split())

WORD = re.compile(r"\w+", re.UNICODE)


def tokens(title):
    out = set()
    for w in WORD.findall(title.lower()):
        if w in STOP or (len(w) < 3 and not w.isdigit()):
            continue
        if len(w) > 4 and w.endswith("s") and not w.endswith("ss"):
            w = w[:-1]  # crude plural folding: "missiles" ~ "missile"
        out.add(w)
    return out


def cluster(items, threshold=0.33, min_shared=2):
    """Return a list of clusters (lists of items). Items are dicts with title/source/link."""
    toks = [tokens(it["title"]) for it in items]
    df = Counter(w for t in toks for w in t)
    n = max(len(items), 1)
    idf = {w: math.log(1 + n / c) for w, c in df.items()}
    norm = [math.sqrt(sum(idf[w] ** 2 for w in t)) or 1.0 for t in toks]

    # Only compare pairs that share at least one fairly rare word (keeps this fast).
    index = defaultdict(list)
    for i, t in enumerate(toks):
        for w in t:
            if df[w] <= max(8, n // 40):
                index[w].append(i)

    parent = list(range(len(items)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    size = [1] * len(items)
    seen_pairs = set()
    for ids in index.values():
        for a_pos, a in enumerate(ids):
            for b in ids[a_pos + 1:]:
                if (a, b) in seen_pairs:
                    continue
                seen_pairs.add((a, b))
                if items[a]["source"] == items[b]["source"]:
                    continue
                shared = toks[a] & toks[b]
                if len(shared) < min_shared:
                    continue
                sim = sum(idf[w] ** 2 for w in shared) / (norm[a] * norm[b])
                if sim < threshold:
                    continue
                ra, rb = find(a), find(b)
                # Refuse merges that would create huge chains of loosely related stories.
                if ra != rb and size[ra] + size[rb] <= 25:
                    parent[rb] = ra
                    size[ra] += size[rb]

    groups = defaultdict(list)
    for i in range(len(items)):
        groups[find(i)].append(items[i])
    return list(groups.values())


def pick_lead(group):
    """The story to show for a cluster: newest item with an image and a summary, if any."""
    return max(group, key=lambda it: (bool(it.get("image")), bool(it.get("summary")), it.get("published") or ""))

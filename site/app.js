(() => {
  "use strict";
  const DATA = window.NEWS_DATA;
  const FIRST_BATCH = 20; // stories shown first; more appear as you scroll, in screen-sized batches
  const DEFAULT_TAB = "tech"; // section shown when the page is opened without a #section in the URL
  const COLORS = {
    all: "#ff6a3d", top: "#f59e0b", india: "#ff9933", bengaluru: "#0891b2", defence: "#4f7942",
    world: "#3b82f6", business: "#0ea5a4", sports: "#e11d48", tech: "#8b5cf6", science: "#06b6d4",
    entertainment: "#ec4899", health: "#22c55e", hindi: "#c2410c", kannada: "#ca8a04", saved: "#64748b",
  };

  // ⟳ button: which GitHub workflow to start. Fixed here on purpose (never read from the URL).
  const REPO = "Damodar-Kamat/daily-news";
  const WORKFLOW = "update.yml";
  const TOKEN_KEY = "gh_refresh_token";
  const TOKEN_RE = /^github_pat_[A-Za-z0-9_]{40,255}$/; // fine-grained tokens only

  const ICON = {
    bookmark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
    dots: '<svg viewBox="0 0 24 24" aria-hidden="true" class="fill"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 9 5 9 7a11 11 0 0 1-2.2 3.2M6.6 6.6C4.3 8 3 10.3 3 12c0 2 4 7 9 7a9.6 9.6 0 0 0 4.4-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/></svg>',
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true" class="fill"><path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.2-6.5a1 1 0 0 0 0-1.8L9.5 4.6A1 1 0 0 0 8 5.5z"/></svg>',
    stop: '<svg viewBox="0 0 24 24" aria-hidden="true" class="fill"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  };

  const $ = (s, r = document) => r.querySelector(s);
  const els = {
    tabs: $("#tabs"), feed: $("#feed"), meta: $("#meta"), q: $("#q"), wx: $("#weather"),
    modebar: $("#modebar"), toast: $("#toast"), menu: $("#menu"), past: $("#pastSearch"), end: $("#feedEnd"),
    extras: $("#extras"), extrasEnd: $("#extrasEnd"),
  };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
    json(k, fallback) { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } },
    setJson(k, v) { this.set(k, JSON.stringify(v)); },
  };
  const strList = (v, max) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.length <= 300).slice(0, max) : []);

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // Feed data is untrusted: only plain http(s) URLs may become links or images.
  const safeUrl = (u) => {
    try {
      const x = new URL(u);
      return x.protocol === "https:" || x.protocol === "http:" ? x.href : null;
    } catch { return null; }
  };
  // Colours are applied through the CSSOM rather than style="" attributes, so the
  // Content-Security-Policy can forbid inline styles entirely.
  const paint = (root) => root.querySelectorAll("[data-c]").forEach((el) => {
    el.style.setProperty("--c", el.dataset.c);
    el.removeAttribute("data-c");
  });

  function toast(msg, { kind = "", action, onAction, sticky } = {}) {
    const t = els.toast;
    t.replaceChildren(document.createTextNode(msg));
    if (action) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "toast-btn";
      b.textContent = action;
      b.addEventListener("click", () => { t.classList.remove("show"); onAction(); });
      t.append(b);
    }
    t.className = "toast show " + kind;
    clearTimeout(toast.t);
    if (!sticky) toast.t = setTimeout(() => t.classList.remove("show"), action ? 8000 : 5000);
  }

  // Theme: Midnight (dark) by default on every device; Paper (light) can be chosen in Personalise.
  const applyTheme = (t) => {
    if (t === "light") document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
    document.querySelector('meta[name="theme-color"]').content = t === "light" ? "#f6f4ef" : "#0e1116";
    document.querySelectorAll("[data-set-theme]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.setTheme === (t === "light" ? "light" : "dark"))));
  };
  applyTheme(store.get("themeChoice"));
  document.querySelectorAll("[data-set-theme]").forEach((b) => b.addEventListener("click", () => {
    applyTheme(b.dataset.setTheme);
    store.set("themeChoice", b.dataset.setTheme);
  }));

  // Layout: compact list (default) or swipe cards (one story per screen). Remembered per device.
  let view = store.get("view") === "cards" ? "cards" : "list";
  // Keep a CSS variable with the header's height, so swipe cards fill exactly the rest of the screen.
  const header = $(".top");
  const setHeaderH = () => document.documentElement.style.setProperty("--header-h", `${header.offsetHeight}px`);
  new ResizeObserver(setHeaderH).observe(header);
  setHeaderH();

  // Installable app + offline reading.
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  let openTokenDialog = () => {};
  let pullRefresh = () => {};
  setupRefresh(DATA ? DATA.generated : "");

  if (!DATA) {
    els.meta.textContent = "No data yet";
    els.feed.innerHTML = '<p class="empty">Run <code>python3 fetch_news.py</code> to fetch today\'s news.</p>';
    return;
  }

  // ───────────────────────── helpers ─────────────────────────

  const ago = (iso) => {
    if (!iso) return "";
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };
  const dayLabel = (isoDate, opts = { weekday: "long", day: "numeric", month: "long" }) =>
    new Date(isoDate + "T12:00:00+05:30").toLocaleDateString(undefined, opts);
  const shortDate = (it) => it.published
    ? new Date(it.published).toLocaleDateString(undefined, { day: "numeric", month: "short" })
    : it._day ? dayLabel(it._day, { day: "numeric", month: "short" }) : "";

  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const updateMeta = () => {
    els.meta.textContent = `${today} · updated ${ago(DATA.generated)}${navigator.onLine ? "" : " · offline"}`;
  };
  updateMeta();
  setInterval(updateMeta, 60_000);
  addEventListener("online", updateMeta);
  addEventListener("offline", updateMeta);

  // ───────────────────────── per-device state (localStorage) ─────────────────────────

  const prefs = (() => {
    const p = store.json("prefs", {}) || {};
    return {
      order: strList(p.order, 50), hidden: strList(p.hidden, 50),
      mutedSources: strList(p.mutedSources, 200), mutedWords: strList(p.mutedWords, 200),
      follow: strList(p.follow, 50),
      range: ["all", "3h", "today"].includes(p.range) ? p.range : "all",
      sort: p.sort === "covered" ? "covered" : "latest",
      textSize: ["s", "m", "l", "xl"].includes(p.textSize) ? p.textSize : "m",
    };
  })();
  const savePrefs = () => store.setJson("prefs", prefs);

  let saved = (store.json("saved", []) || [])
    .filter((it) => it && typeof it.title === "string" && safeUrl(it.link)).slice(0, 300);
  let savedLinks = new Set(saved.map((it) => it.link));
  const persistSaved = () => { savedLinks = new Set(saved.map((it) => it.link)); store.setJson("saved", saved); };

  const key = (it) => it.id || it.link; // stories carry a short id; older/saved ones fall back to the link
  const readSet = new Set(strList(store.json("read", []), 2000));
  let readTimer;
  const persistRead = () => {
    clearTimeout(readTimer);
    readTimer = setTimeout(() => store.setJson("read", [...readSet].slice(-1500)), 300);
  };

  // "New since last visit": a story is new if it wasn't in the news you were shown last time.
  // (Tracking story ids rather than times means stories fetched by ⟳ still count as new.)
  const allIds = [...new Set(DATA.categories.flatMap((c) => c.ids || c.items.map(key)))];
  const prevSeen = new Set(strList(store.json("seenIds", []), 5000));
  const firstVisit = prevSeen.size === 0;
  const stampVisit = () => store.setJson("seenIds", allIds.slice(0, 5000));
  addEventListener("pagehide", stampVisit);
  document.addEventListener("visibilitychange", () => { if (document.hidden) stampVisit(); });
  const isNewId = (id) => !firstVisit && !prevSeen.has(id) && !readSet.has(id);
  const isNew = (it) => isNewId(key(it));

  // Whole-word match for a list of words/phrases; works for Hindi/Kannada too (JS \b is ASCII-only).
  const wordsRe = (list) => (list.length
    ? new RegExp(`(^|[^\\p{L}\\p{N}])(${list.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?=$|[^\\p{L}\\p{N}])`, "iu")
    : null);
  let mutedSet = new Set(), muteRe = null, followRe = null;
  let followCache = null, briefCache = null; // recomputed when sections load or preferences change
  function buildMute() {
    mutedSet = new Set(prefs.mutedSources.map((s) => s.toLowerCase()));
    muteRe = wordsRe(prefs.mutedWords);
    followRe = wordsRe(prefs.follow);
    followCache = briefCache = null;
  }
  buildMute();
  const visible = (it) => !mutedSet.has((it.source || "").toLowerCase()) && !(muteRe && muteRe.test(`${it.title} ${it.summary || ""}`));

  const TEXT_SIZES = { s: 0.92, m: 1, l: 1.12, xl: 1.25 };
  const applyTextSize = () => document.documentElement.style.setProperty("--ts", String(TEXT_SIZES[prefs.textSize] || 1));
  applyTextSize();

  // Reading stats: when you opened a story and its section. Stays on this device.
  let readLog = (store.json("readLog", []) || [])
    .filter((r) => Array.isArray(r) && typeof r[0] === "number" && typeof r[1] === "string").slice(-3000);
  const logRead = (it) => {
    readLog.push([Date.now(), String(it.category || "Other").slice(0, 40)]);
    readLog = readLog.slice(-3000);
    store.setJson("readLog", readLog);
  };

  // ───────────────────────── sections / tabs ─────────────────────────

  const live = DATA.categories;
  // data.js holds only the first stories of each section; the rest is fetched on demand.
  for (const c of live) c.complete = !(c.total > c.items.length);
  const loading = new Map();
  function loadSection(id) {
    const sec = live.find((c) => c.id === id);
    if (!sec || sec.complete) return Promise.resolve(true);
    if (!loading.has(id)) {
      loading.set(id, fetch(`data/${encodeURIComponent(id)}.json?v=${encodeURIComponent(DATA.generated)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
        .then((d) => {
          if (Array.isArray(d.items) && d.items.length >= sec.items.length) sec.items = d.items;
          sec.complete = true;
          followCache = briefCache = null;
          return true;
        })
        .catch(() => { loading.delete(id); return false; }));
    }
    return loading.get(id);
  }
  const loadAllSections = () => Promise.all(live.map((c) => loadSection(c.id)));
  const nameToId = Object.fromEntries(live.map((c) => [c.name, c.id]));
  const langOf = Object.fromEntries(live.filter((c) => c.lang).map((c) => [c.name, c.lang]));
  const colorFor = (catName) => COLORS[nameToId[catName] || String(catName || "").toLowerCase()] || "#ff6a3d";

  let mode = "live"; // "live" | "archive"
  let archiveCats = null, liveActive = null;
  let active = null, list = [], entries = [], shown = 0, leadOn = false, pastResults = null;

  const VIRTUAL = {
    brief: { id: "brief", name: "Brief", virtual: true, get items() { return briefItems(); } },
    following: { id: "following", name: "Following", virtual: true, get items() { return followItems(); } },
    saved: { id: "saved", name: "Saved", virtual: true, get items() { return saved; } },
  };
  function allLiveTabs() {
    const head = live.filter((c) => c.id === "all" || c.id === "top");
    const rest = live.filter((c) => c.id !== "all" && c.id !== "top");
    const base = [VIRTUAL.brief, ...head, VIRTUAL.following, ...rest, VIRTUAL.saved];
    const pos = (t, i) => { const p = prefs.order.indexOf(t.id); return p === -1 ? 1000 + i : p; };
    return base.map((t, i) => [pos(t, i), t]).sort((a, b) => a[0] - b[0]).map(([, t]) => t);
  }
  const currentTabs = () => (mode === "archive" ? archiveCats : allLiveTabs().filter((t) => !prefs.hidden.includes(t.id)));
  const tabItems = (id) => (currentTabs().find((t) => t.id === id) || { items: [] }).items;

  function renderTabs() {
    const x = els.tabs.scrollLeft;
    els.tabs.innerHTML = currentTabs().map((t) => {
      const fresh = mode !== "live" || t.id === "saved" ? 0
        : t.virtual ? t.items.filter(isNew).length : (t.ids || []).filter(isNewId).length;
      const n = t.id === "saved" ? t.items.length : 0;
      const icon = { saved: ICON.bookmark, following: ICON.star, brief: ICON.sun }[t.id] || "";
      return `<button class="tab" role="tab" data-id="${esc(t.id)}" data-c="${COLORS[t.id] || colorFor(t.name)}" aria-selected="${t.id === active}">
        ${icon}${esc(t.name)}${n ? `<span class="count">${n}</span>` : ""}${fresh ? `<span class="fresh" title="${fresh} new since your last visit">${fresh}</span>` : ""}
      </button>`;
    }).join("") + (mode === "live" && DATA.archive ? `<button class="tab ghost" id="pastBtn" type="button">${ICON.calendar}Past days</button>` : "");
    paint(els.tabs);
    els.tabs.scrollLeft = x;
  }

  els.tabs.addEventListener("click", (e) => {
    if (e.target.closest("#pastBtn")) return openArchiveDialog();
    const b = e.target.closest(".tab");
    if (b) select(b.dataset.id, true);
  });

  function select(id, userAction) {
    const ids = currentTabs().map((t) => t.id);
    if (!ids.includes(id)) id = ids.includes(DEFAULT_TAB) ? DEFAULT_TAB : ids[0];
    if (id !== active) stopListening();
    active = id;
    if (mode === "live") history.replaceState(null, "", "#" + id);
    els.tabs.querySelectorAll(".tab[data-id]").forEach((b) => b.setAttribute("aria-selected", b.dataset.id === id));
    // Centre the selected tab in the (horizontally scrollable) tab strip.
    const b = els.tabs.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (b) {
      const left = b.getBoundingClientRect().left - els.tabs.getBoundingClientRect().left + els.tabs.scrollLeft;
      els.tabs.scrollTo({ left: left - (els.tabs.clientWidth - b.offsetWidth) / 2, behavior: userAction ? "smooth" : "auto" });
    }
    if (userAction) {
      els.q.value = "";
      pastResults = null;
      window.scrollTo({ top: 0 });
    }
    render();
    if (mode === "live") (id === "following" ? loadAllSections() : loadSection(id)).then(() => sectionArrived(id));
  }

  // A section's full list arrived: extend the current feed in place (the first stories are the same,
  // so what's already on screen doesn't change or jump).
  function sectionArrived(id) {
    if (id !== active || mode !== "live") return;
    // Re-sorted, filtered or collected lists can change order, so draw them again from the top.
    if (els.q.value.trim() || VIRTUAL[id] || prefs.sort !== "latest" || prefs.range !== "all") return render();
    buildEntries();
    renderTabs();
    updatePositions();
    fill();
  }

  // ───────────────────────── feed ─────────────────────────

  const matches = (it, q) => `${it.title} ${it.summary || ""} ${it.source}`.toLowerCase().includes(q);
  const uniqByLink = (arr) => { const s = new Set(); return arr.filter((it) => !s.has(it.link) && s.add(it.link)); };

  function buildEntries() {
    const q = els.q.value.trim().toLowerCase();
    let items;
    leadOn = false;
    let divider = false;
    if (q) {
      const pool = mode === "archive" ? archiveCats[0].items.concat(...archiveCats.slice(1).map((c) => c.items))
        : live.flatMap((c) => c.items).concat(saved);
      items = uniqByLink(pool.concat(pastResults || [])).filter((it) => matches(it, q) && visible(it)).slice(0, 400);
    } else {
      items = tabItems(active);
      if (active !== "saved") items = items.filter(visible);
      if (active !== "saved" && active !== "brief") items = rangeSort(items);
      const plain = !VIRTUAL[active];
      leadOn = effView() === "list" && plain;
      divider = effView() === "list" && mode === "live" && plain && !["all", "top"].includes(active) && prefs.sort === "latest";
    }
    list = items.filter((it) => safeUrl(it.link));
    if (leadOn) {
      const li = list.findIndex((it) => it.image);
      if (li > 0) list = [list[li], ...list.slice(0, li), ...list.slice(li + 1)];
    }
    entries = list.map((it, i) => ({ it, i }));
    if (divider && !firstVisit) {
      const firstOld = list.findIndex((it, i) => i > 0 && !isNew(it));
      if (firstOld > 0 && list.slice(0, firstOld).some(isNew)) entries.splice(firstOld, 0, { divider: true });
    }
  }

  // Search results are always a list (easier to scan); otherwise the chosen layout.
  const effView = () => (els.q.value.trim() ? "list" : view);

  function render() {
    const q = els.q.value.trim().toLowerCase();
    document.documentElement.dataset.view = effView();
    buildEntries();
    renderExtras();
    els.feed.innerHTML = list.length || waitingForData() ? "" : `<p class="empty">${esc(emptyMessage(q))}</p>`;
    shown = 0;
    els.feed.scrollTop = 0;
    more(effView() === "cards" ? 4 : FIRST_BATCH);
    fill();
    els.past.hidden = !(q && DATA.archive && !pastResults);
    els.past.disabled = false;
    els.past.textContent = "Search the last 30 days too";
    // Searching needs every section; fetch the ones not loaded yet, then search again.
    if (q && mode === "live" && live.some((c) => !c.complete)) {
      loadAllSections().then(() => { if (els.q.value.trim().toLowerCase() === q) render(); });
    }
  }

  function emptyMessage(q) {
    if (q) return `No stories matching “${q}”.`;
    if (active === "saved") return "Nothing saved yet. Tap the bookmark on any story to keep it here.";
    if (active === "following") {
      return prefs.follow.length
        ? `Nothing about ${prefs.follow.join(", ")} right now. New matches will show up here.`
        : "Follow a few topics above to collect matching stories from every section.";
    }
    if (prefs.range === "3h") return "No stories from the last 3 hours here. Try “All”.";
    if (prefs.range === "today") return "No stories from today here yet. Try “All”.";
    return "No stories here right now.";
  }

  // Is more data on its way for what's on screen (a section still downloading, or a search across sections)?
  function waitingForData() {
    if (mode !== "live") return false;
    if (els.q.value.trim() || active === "following") return live.some((c) => !c.complete);
    const sec = live.find((c) => c.id === active);
    return !!sec && !sec.complete;
  }

  // How many stories fill roughly one screen: list rows that fit in the window, or a few swipe cards.
  const batchSize = () => (effView() === "cards" ? 4 : Math.max(6, Math.ceil(innerHeight / (innerWidth <= 760 ? 100 : 118))));

  // Is the end of what's rendered within about a screen (list) or a few cards (swipe) of the reader?
  const nearEnd = () => (effView() === "cards"
    ? els.feed.scrollTop + els.feed.clientHeight * 4 >= els.feed.scrollHeight
    : $("#sentinel").getBoundingClientRect().top < innerHeight * 2);

  function more(count = batchSize()) {
    if (shown < entries.length) {
      const chunk = entries.slice(shown, shown + count);
      els.feed.insertAdjacentHTML("beforeend", chunk.map((e) => (e.divider
        ? '<div class="divider" role="separator"><span>Earlier stories</span></div>'
        : card(e.it, e.i, leadOn && e.i === 0))).join(""));
      paint(els.feed);
      shown += chunk.length;
    }
    // Swipe cards: a final card once everything is shown.
    if (effView() === "cards" && list.length && shown >= entries.length && !waitingForData() && !els.feed.querySelector(".slide-end")) {
      els.feed.insertAdjacentHTML("beforeend", `<div class="slide slide-end"><p><b>You're all caught up</b><br>${list.length} stories</p></div>`);
    }
    updateFeedEnd();
  }

  // "3 / 179" on swipe cards, kept current as the rest of a section arrives.
  function updatePositions() {
    if (effView() !== "cards") return;
    els.feed.querySelectorAll(".slide[data-i] .pos").forEach((el) => {
      el.textContent = `${+el.closest(".slide").dataset.i + 1} / ${list.length}`;
    });
  }

  // Keep adding batches while the bottom of the feed is within about a screen of the viewport.
  function fill() {
    let guard = 0;
    while (shown < entries.length && nearEnd() && guard++ < 20) more();
    updateFeedEnd();
  }

  function updateFeedEnd() {
    const end = els.end;
    if (shown < entries.length) { end.hidden = true; return; }
    if (waitingForData()) {
      end.className = "feed-end loading";
      end.textContent = els.q.value.trim() ? "Searching all sections…" : "Loading more stories…";
    } else if (list.length > 6) {
      end.className = "feed-end";
      end.textContent = `You're all caught up · ${list.length} stories`;
    } else { end.hidden = true; return; }
    end.hidden = false;
  }

  function card(it, i, isLead) {
    const label = esc(it.source || it.category || "News");
    const imgUrl = safeUrl(it.image);
    const img = (imgUrl
      ? `<img src="${esc(imgUrl)}" alt="" loading="${i < 4 ? "eager" : "lazy"}" decoding="async" referrerpolicy="no-referrer" data-label="${label}">`
      : `<div class="ph">${label}</div>`) + (it.video ? `<span class="play" aria-label="Video">${ICON.play}</span>` : "");
    const multi = ["all", "top", "saved", "brief", "following"].includes(active) || els.q.value.trim() || mode === "archive" && active === "all";
    const cat = multi ? `<span class="cat">${esc(it.category)}</span>` : "";
    const fresh = mode === "live" && isNew(it) ? '<span class="new">New</span>' : "";
    const isSaved = savedLinks.has(it.link);
    const also = Array.isArray(it.also) ? it.also.filter((a) => a && safeUrl(a.link)) : [];
    const when = mode === "archive" || it._day ? shortDate(it) : ago(it.published);
    const lang = langOf[it.category];
    const href = esc(safeUrl(it.link));
    const meta = `
      <div class="ri-meta">${cat}${fresh}<span class="src"><b>${esc(it.source)}</b>${when ? ` · ${esc(when)}` : ""}</span>
        <span class="acts">
          <button class="act save" type="button" aria-pressed="${isSaved}" aria-label="${isSaved ? "Remove from saved" : "Save for later"}" title="${isSaved ? "Saved" : "Save for later"}">${ICON.bookmark}</button>
          <button class="act more" type="button" aria-haspopup="menu" aria-label="More options" title="More">${ICON.dots}</button>
        </span>
      </div>`;
    const title = `<h2 class="title"><a class="hit" href="${href}" target="_blank" rel="noopener noreferrer">${esc(it.title)}</a></h2>`;
    const cov = also.length ? `
      <button class="cov" type="button" aria-expanded="false" title="Other outlets covering this story">${also.length + 1} sources ${ICON.chevron}</button>
      <ul class="also" hidden>${also.map((a) => `<li><a href="${esc(safeUrl(a.link))}" target="_blank" rel="noopener noreferrer"><b>${esc(a.source)}</b> ${esc(a.title)}</a></li>`).join("")}</ul>` : "";
    const summary = it.summary ? `<p class="summary">${esc(it.summary)}</p>` : "";
    const cls = `card${readSet.has(key(it)) ? " read" : ""}`;
    const attrs = `data-i="${i}" data-c="${colorFor(it.category)}"${lang ? ` lang="${esc(lang)}"` : ""}`;

    if (effView() === "cards") {
      return `
      <article class="${cls} slide" ${attrs}>
        <div class="thumb">${img}</div>
        <div class="ri-body">${meta}${title}${summary}${cov}
          <div class="sl-foot">
            <a class="read-btn" href="${href}" target="_blank" rel="noopener noreferrer">Read full story ${ICON.arrow}</a>
            <span class="pos">${i + 1} / ${list.length}</span>
          </div>
        </div>
      </article>`;
    }
    if (isLead) {
      return `
      <article class="${cls} lead" ${attrs}>
        <div class="thumb">${img}</div>
        <div class="ri-body">${meta}${title}${summary}${cov}</div>
      </article>`;
    }
    return `
      <article class="${cls} row-item" ${attrs}>
        <div class="ri-body">${meta}${title}${cov}</div>
        <div class="thumb">${img}</div>
      </article>`;
  }

  // Broken image → coloured tile with the source name (no inline onerror handlers).
  els.feed.addEventListener("error", (e) => {
    const img = e.target;
    if (img.tagName !== "IMG") return;
    const ph = document.createElement("div");
    ph.className = "ph";
    ph.textContent = img.dataset.label || "";
    img.replaceWith(ph);
  }, true);

  function markRead(it, cardEl) {
    if (readSet.has(key(it))) return;
    readSet.add(key(it));
    persistRead();
    logRead(it);
    if (cardEl) {
      cardEl.classList.add("read");
      cardEl.querySelector(".new")?.remove();
    }
    renderTabs();
  }

  function toggleSave(it, btn) {
    if (savedLinks.has(it.link)) {
      saved = saved.filter((s) => s.link !== it.link);
      persistSaved();
      btn.setAttribute("aria-pressed", "false");
      btn.setAttribute("aria-label", "Save for later");
      if (active === "saved" && !els.q.value.trim()) render();
      toast("Removed from saved");
    } else {
      const { title, link, image, source, published, category, summary } = it;
      saved.unshift({ title, link, image, source, published, category, summary, savedAt: new Date().toISOString() });
      saved = saved.slice(0, 300);
      persistSaved();
      btn.setAttribute("aria-pressed", "true");
      btn.setAttribute("aria-label", "Remove from saved");
      toast("Saved for later", { action: "View", onAction: () => { if (mode === "archive") exitArchive(); select("saved", true); } });
    }
    renderTabs();
  }

  els.feed.addEventListener("click", (e) => {
    const cardEl = e.target.closest(".card");
    if (!cardEl) return;
    const it = list[+cardEl.dataset.i];
    if (!it) return;
    if (e.target.closest("a.hit, a.read-btn")) return markRead(it, cardEl);
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.classList.contains("save")) toggleSave(it, btn);
    else if (btn.classList.contains("more")) openMenu(btn, it, cardEl);
    else if (btn.classList.contains("cov")) {
      const ul = cardEl.querySelector(".also");
      const open = ul.hidden;
      ul.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
    }
  });
  els.feed.addEventListener("auxclick", (e) => {
    const a = e.target.closest("a.hit, a.read-btn");
    if (a && e.button === 1) { const c = a.closest(".card"); markRead(list[+c.dataset.i], c); }
  });

  // ───────────────────────── ⋯ menu: share, copy, read, mute ─────────────────────────

  let menuCtx = null;
  function openMenu(btn, it, cardEl) {
    const m = els.menu;
    m.innerHTML = `
      <button type="button" role="menuitem" data-a="share">${ICON.share}<span>Share</span></button>
      <button type="button" role="menuitem" data-a="copy">${ICON.link}<span>Copy link</span></button>
      <button type="button" role="menuitem" data-a="read">${ICON.check}<span>${readSet.has(key(it)) ? "Mark as unread" : "Mark as read"}</span></button>
      <button type="button" role="menuitem" data-a="mute">${ICON.eyeOff}<span>Hide stories from ${esc(it.source)}</span></button>`;
    m.hidden = false;
    const r = btn.getBoundingClientRect();
    const w = m.offsetWidth, h = m.offsetHeight;
    const left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8));
    const top = r.bottom + h + 8 > innerHeight ? r.top - h - 6 : r.bottom + 6;
    m.style.left = `${left}px`;
    m.style.top = `${top}px`;
    menuCtx = { it, cardEl };
    m.querySelector("button").focus({ preventScroll: true });
  }
  const closeMenu = () => { els.menu.hidden = true; menuCtx = null; };
  document.addEventListener("click", (e) => {
    if (!els.menu.hidden && !e.target.closest("#menu") && !e.target.closest(".act.more")) closeMenu();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
  addEventListener("scroll", () => { if (!els.menu.hidden) closeMenu(); }, { passive: true });

  const copyLink = (url) => navigator.clipboard?.writeText(url)
    .then(() => toast("Link copied"), () => toast("Couldn't copy the link", { kind: "error" }))
    ?? toast("Couldn't copy the link", { kind: "error" });

  els.menu.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-a]");
    if (!b || !menuCtx) return;
    const { it, cardEl } = menuCtx;
    const url = safeUrl(it.link);
    closeMenu();
    switch (b.dataset.a) {
      case "share":
        if (navigator.share) navigator.share({ title: it.title, url }).catch(() => {});
        else copyLink(url);
        break;
      case "copy":
        copyLink(url);
        break;
      case "read":
        if (readSet.has(key(it))) {
          readSet.delete(key(it));
          persistRead();
          cardEl.classList.remove("read");
          renderTabs();
        } else markRead(it, cardEl);
        break;
      case "mute": {
        const src = it.source;
        if (!prefs.mutedSources.includes(src)) prefs.mutedSources.push(src);
        savePrefs(); buildMute(); render(); renderTabs();
        toast(`Hiding stories from ${src}`, {
          action: "Undo",
          onAction: () => {
            prefs.mutedSources = prefs.mutedSources.filter((s) => s !== src);
            savePrefs(); buildMute(); render(); renderTabs();
          },
        });
        break;
      }
    }
  });

  // ───────────────────────── search ─────────────────────────

  let t;
  els.q.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      if (!els.q.value.trim()) pastResults = null;
      render();
    }, 150);
  });
  new IntersectionObserver((e) => { if (e[0].isIntersecting && effView() === "list") { more(); fill(); } }, { rootMargin: "100% 0px" }).observe($("#sentinel"));

  // Back-to-top button once you've scrolled a couple of screens down.
  const topBtn = $("#toTop");
  let scrollQueued = false;
  addEventListener("scroll", () => {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => {
      scrollQueued = false;
      topBtn.hidden = scrollY < innerHeight * 2;
      // Backup for loading more: some in-app browsers (WhatsApp, Instagram) don't fire IntersectionObserver reliably.
      if (effView() === "list" && shown < entries.length && nearEnd()) fill();
    });
  }, { passive: true });
  topBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  let deckQueued = false;
  els.feed.addEventListener("scroll", () => {
    if (effView() !== "cards" || deckQueued) return;
    deckQueued = true;
    requestAnimationFrame(() => {
      deckQueued = false;
      if (!els.menu.hidden) closeMenu();
      if (shown < entries.length && nearEnd()) fill();
    });
  }, { passive: true });

  function setView(v) {
    view = v === "cards" ? "cards" : "list";
    store.set("view", view);
    document.querySelectorAll("[data-set-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.setView === view)));
    const vb = $("#viewBtn");
    const label = view === "cards" ? "Switch to list" : "Switch to swipe cards";
    vb.title = label;
    vb.setAttribute("aria-label", label);
    window.scrollTo({ top: 0 });
    render();
  }
  $("#viewBtn").addEventListener("click", () => setView(view === "cards" ? "list" : "cards"));
  document.querySelectorAll("[data-set-view]").forEach((b) => b.addEventListener("click", () => setView(b.dataset.setView)));

  addEventListener("hashchange", () => {
    const id = location.hash.slice(1);
    if (mode === "live" && id !== active && currentTabs().some((t) => t.id === id)) select(id, true);
  });

  // Swipe left/right on the feed to move between sections (phones).
  let sx = 0, sy = 0, st = 0;
  els.feed.addEventListener("touchstart", (e) => {
    const p = e.touches[0];
    sx = p.clientX; sy = p.clientY; st = Date.now();
  }, { passive: true });
  els.feed.addEventListener("touchend", (e) => {
    const p = e.changedTouches[0];
    const dx = p.clientX - sx, dy = p.clientY - sy;
    if (sx < 24 || Date.now() - st > 600 || Math.abs(dx) < 70 || Math.abs(dx) < 2 * Math.abs(dy) || els.q.value.trim()) return;
    const ids = currentTabs().map((x) => x.id);
    const next = ids[ids.indexOf(active) + (dx < 0 ? 1 : -1)];
    if (next) select(next, true);
  }, { passive: true });

  // ───────────────────────── weather ─────────────────────────

  function renderWeather() {
    const w = DATA.weather;
    if (!w || mode !== "live") { els.wx.hidden = true; return; }
    const num = (v) => esc(String(Math.round(Number(v))));
    const name = (iso, i) => (i === 0 ? "Today" : i === 1 ? "Tomorrow" : dayLabel(iso, { weekday: "short" }));
    const d0 = (w.days || [])[0];
    els.wx.innerHTML = `
      <button class="wx-line" type="button" aria-expanded="false" aria-controls="wxDays">
        <span class="wx-icon" aria-hidden="true">${esc(w.icon)}</span>
        <b>${num(w.temp)}°</b>
        <span class="wx-rest">${esc(w.city)} · ${esc(w.label)}${d0 ? ` · H ${num(d0.max)}° L ${num(d0.min)}° · rain ${num(d0.rain)}%` : ""}</span>
        ${ICON.chevron}
      </button>
      <div class="wx-days" id="wxDays" hidden>${(w.days || []).map((d, i) => `
        <div class="wx-day"><small>${esc(name(d.date, i))}</small><span aria-hidden="true">${esc(d.icon)}</span>
          <small>${num(d.max)}° / ${num(d.min)}°</small><small class="rain" title="Chance of rain">💧${num(d.rain)}%</small></div>`).join("")}
        <p class="wx-note">Feels like ${num(w.feels)}° · humidity ${num(w.humidity)}%</p>
      </div>`;
    const btn = els.wx.querySelector(".wx-line"), days = els.wx.querySelector(".wx-days");
    btn.addEventListener("click", () => {
      const open = days.hidden;
      days.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
    });
    els.wx.hidden = false;
  }

  // ───────────────────────── archive: past days + search ─────────────────────────

  let archiveIndex = null;
  const dayCache = new Map();
  async function getIndex() {
    if (!archiveIndex) {
      const r = await fetch("archive/index.json", { cache: "no-cache" });
      if (!r.ok) throw new Error("index");
      archiveIndex = (await r.json()).filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d.date));
    }
    return archiveIndex;
  }
  async function getDay(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date");
    if (!dayCache.has(date)) {
      const r = await fetch(`archive/${date}.json`, { cache: "no-cache" });
      if (!r.ok) throw new Error("day");
      const d = await r.json();
      dayCache.set(date, (Array.isArray(d.items) ? d.items : [])
        .filter((it) => it && typeof it.title === "string").map((it) => ({ ...it, _day: date })));
    }
    return dayCache.get(date);
  }

  const archiveDlg = $("#archiveDlg"), dayList = $("#dayList");
  async function openArchiveDialog() {
    dayList.innerHTML = '<p class="note">Loading…</p>';
    archiveDlg.showModal();
    try {
      const idx = await getIndex();
      dayList.innerHTML = idx.length
        ? idx.map((d) => `<button type="button" class="day" data-date="${esc(d.date)}"><b>${esc(dayLabel(d.date))}</b><small>${Number(d.count) || 0} stories</small></button>`).join("")
        : '<p class="note">No past days yet. The archive fills up as the page updates each hour.</p>';
    } catch {
      dayList.innerHTML = '<p class="note">Couldn\'t load the archive. Check your connection.</p>';
    }
  }
  dayList.addEventListener("click", (e) => {
    const b = e.target.closest("button.day");
    if (b) { archiveDlg.close(); enterArchive(b.dataset.date); }
  });
  $("#archiveClose").addEventListener("click", () => archiveDlg.close());

  async function enterArchive(date) {
    let items;
    try { items = await getDay(date); } catch { return toast("Couldn't load that day.", { kind: "error" }); }
    const groups = new Map(live.filter((c) => !["all", "top"].includes(c.id)).map((c) => [c.name, []]));
    for (const it of items) {
      if (!groups.has(it.category)) groups.set(it.category, []);
      groups.get(it.category).push(it);
    }
    archiveCats = [
      { id: "all", name: "All", items: items.filter((it) => !langOf[it.category]) },
      ...[...groups].filter(([, v]) => v.length).map(([name, v]) => ({ id: nameToId[name] || name.toLowerCase(), name, items: v })),
    ];
    if (mode === "live") liveActive = active;
    mode = "archive";
    $("#modeText").textContent = `Viewing ${dayLabel(date)}`;
    els.modebar.hidden = false;
    renderWeather();
    renderTabs();
    select(archiveCats.some((c) => c.id === active) ? active : "all", true);
  }
  function exitArchive() {
    mode = "live";
    archiveCats = null;
    els.modebar.hidden = true;
    renderWeather();
    renderTabs();
    select(liveActive || DEFAULT_TAB, true);
  }
  $("#modeExit").addEventListener("click", exitArchive);

  els.past.addEventListener("click", async () => {
    els.past.disabled = true;
    els.past.textContent = "Searching the last 30 days…";
    try {
      const idx = await getIndex();
      pastResults = (await Promise.all(idx.map((d) => getDay(d.date).catch(() => [])))).flat();
    } catch {
      pastResults = null;
      toast("Couldn't load past days.", { kind: "error" });
    }
    render();
  });

  // ───────────────────────── Personalise dialog ─────────────────────────

  const prefsDlg = $("#prefsDlg");
  function renderPrefs() {
    document.querySelectorAll("[data-set-size]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.setSize === prefs.textSize)));
    renderStats();
    const all = allLiveTabs();
    $("#secList").innerHTML = all.map((tb, i) => `
      <li data-id="${esc(tb.id)}">
        <label><input type="checkbox"${prefs.hidden.includes(tb.id) ? "" : " checked"}> ${esc(tb.name)}</label>
        <span class="spacer"></span>
        <button type="button" class="mini" data-move="-1" aria-label="Move ${esc(tb.name)} up"${i === 0 ? " disabled" : ""}>↑</button>
        <button type="button" class="mini" data-move="1" aria-label="Move ${esc(tb.name)} down"${i === all.length - 1 ? " disabled" : ""}>↓</button>
      </li>`).join("");
    const chips = [
      ...prefs.mutedSources.map((s) => `<span class="chip-x"><span>${esc(s)}</span><small>source</small><button type="button" data-src="${esc(s)}" aria-label="Show ${esc(s)} again">×</button></span>`),
      ...prefs.mutedWords.map((w) => `<span class="chip-x"><span>${esc(w)}</span><small>word</small><button type="button" data-word="${esc(w)}" aria-label="Stop hiding ${esc(w)}">×</button></span>`),
    ];
    $("#muteChips").innerHTML = chips.length ? chips.join("") : '<p class="note">Nothing hidden. Use ⋯ on a story to hide its source, or add a word below.</p>';
  }
  const applyPrefs = () => {
    savePrefs(); buildMute(); renderPrefs(); renderTabs();
    if (mode === "live") select(active, false); else render();
  };
  $("#prefsBtn").addEventListener("click", () => { renderPrefs(); prefsDlg.showModal(); });
  $("#prefsDone").addEventListener("click", () => prefsDlg.close());
  $("#secList").addEventListener("change", (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    const id = li.dataset.id;
    if (e.target.checked) prefs.hidden = prefs.hidden.filter((h) => h !== id);
    else if (allLiveTabs().length - prefs.hidden.length > 1) prefs.hidden.push(id);
    else { e.target.checked = true; return toast("Keep at least one section visible."); }
    applyPrefs();
  });
  $("#secList").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-move]");
    if (!b) return;
    const ids = allLiveTabs().map((x) => x.id);
    const i = ids.indexOf(b.closest("li").dataset.id), j = i + Number(b.dataset.move);
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    prefs.order = ids;
    applyPrefs();
    $(`#secList li[data-id="${CSS.escape(ids[j])}"] button[data-move="${b.dataset.move}"]`)?.focus();
  });
  $("#muteChips").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.src) prefs.mutedSources = prefs.mutedSources.filter((s) => s !== b.dataset.src);
    if (b.dataset.word) prefs.mutedWords = prefs.mutedWords.filter((w) => w !== b.dataset.word);
    applyPrefs();
  });
  const addWord = () => {
    const w = $("#muteInput").value.trim();
    if (w.length < 2 || w.length > 60) return toast("Enter a word or phrase (2–60 characters).");
    if (!prefs.mutedWords.some((x) => x.toLowerCase() === w.toLowerCase())) prefs.mutedWords.push(w);
    $("#muteInput").value = "";
    applyPrefs();
  };
  $("#muteAdd").addEventListener("click", addWord);
  $("#muteInput").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addWord(); } });
  document.querySelectorAll("[data-set-size]").forEach((b) => b.addEventListener("click", () => {
    prefs.textSize = b.dataset.setSize;
    savePrefs();
    applyTextSize();
    renderPrefs();
  }));
  $("#clearRead").addEventListener("click", () => {
    readSet.clear();
    store.del("read");
    readLog = [];
    store.del("readLog");
    renderStats();
    render(); renderTabs();
    toast("Reading history cleared");
  });
  $("#tokenOpen").addEventListener("click", () => { prefsDlg.close(); openTokenDialog(); });
  $("#prefsReset").addEventListener("click", () => {
    Object.assign(prefs, { order: [], hidden: [], mutedSources: [], mutedWords: [] });
    applyPrefs();
    toast("Sections and hidden items reset");
  });

  // ───────────────────────── Brief + Following ─────────────────────────

  // Morning brief: the top 3 stories, then the #1 story of each news section, then your topics.
  function briefItems() {
    if (briefCache) return briefCache;
    const seen = new Set(), out = [];
    const add = (it) => { if (it && !seen.has(it.link) && visible(it)) { seen.add(it.link); out.push(it); } };
    (live.find((c) => c.id === "top")?.items || []).slice(0, 3).forEach(add);
    for (const c of live) {
      if (c.id === "all" || c.id === "top" || c.kind || prefs.hidden.includes(c.id)) continue;
      add(c.items.find((it) => !seen.has(it.link) && visible(it)));
    }
    followItems().slice(0, 2).forEach(add);
    return (briefCache = out);
  }

  // Following: stories from every section whose headline or summary mentions one of your topics.
  function followItems() {
    if (!followRe) return [];
    if (followCache) return followCache;
    const pool = uniqByLink(live.filter((c) => c.id !== "all" && c.id !== "top").flatMap((c) => c.items));
    followCache = pool.filter((it) => followRe.test(`${it.title} ${it.summary || ""}`))
      .sort((a, b) => (b.published || "").localeCompare(a.published || ""));
    return followCache;
  }
  const SUGGESTED = ["ISRO", "RCB", "Namma Metro", "Tejas", "Chandrayaan", "iPhone", "Sensex", "Monsoon"];
  function followTopic(t) {
    t = String(t || "").trim().replace(/\s+/g, " ");
    if (t.length < 2 || t.length > 60) return toast("Enter a topic (2–60 characters).");
    if (prefs.follow.some((x) => x.toLowerCase() === t.toLowerCase())) return toast(`Already following ${t}`);
    prefs.follow.push(t);
    afterFollowChange();
    loadAllSections().then(() => { followCache = briefCache = null; renderTabs(); if (active === "following") render(); });
  }
  function unfollowTopic(t) {
    prefs.follow = prefs.follow.filter((x) => x !== t);
    afterFollowChange();
  }
  function afterFollowChange() {
    savePrefs();
    buildMute();
    renderTabs();
    render();
  }

  // Time range + sort (per device).
  function rangeSort(items) {
    let out = items;
    if (prefs.range !== "all") {
      const since = prefs.range === "3h" ? Date.now() - 3 * 3600e3 : new Date().setHours(0, 0, 0, 0);
      out = out.filter((it) => it.published && Date.parse(it.published) >= since);
    }
    if (prefs.sort === "covered") {
      out = [...out].sort((a, b) => (b.also?.length || 0) - (a.also?.length || 0) || (b.published || "").localeCompare(a.published || ""));
    }
    return out;
  }

  // ───────────────────────── panels above the list ─────────────────────────

  const X = DATA.extras || {};
  const num = (v) => esc(String(Math.round(Number(v))));
  const rupees = (v) => "₹" + Number(v).toLocaleString("en-IN", { maximumFractionDigits: Number(v) >= 1000 ? 0 : 2 });

  function rainHTML() {
    const a = DATA.weather?.alert;
    const day = String(DATA.weather?.observed || "").slice(0, 10);
    if (!a || store.get("rainDismissed") === day) return "";
    const at = new Date(2000, 0, 1, Number(a.hour)).toLocaleTimeString("en-IN", { hour: "numeric", hour12: true }).toUpperCase();
    return `<div class="rain-alert" role="status"><span aria-hidden="true">☔</span>
      <p>${num(a.prob)}% chance of rain from ${esc(at)} today. Carry an umbrella.</p>
      <button type="button" class="rain-x" data-rain-dismiss="${esc(day)}" aria-label="Dismiss">×</button></div>`;
  }
  function marketsHTML() {
    if (!X.markets) return "";
    return `<div class="panel"><div class="panel-h"><span>Markets</span><small>ECB reference rates · CoinGecko</small></div>
      <div class="hscroll">${X.markets.map((m) => {
        const c = Number(m.change);
        const chg = m.change == null ? "" : `<span class="chg ${c > 0 ? "up" : c < 0 ? "down" : ""}">${c > 0 ? "▲" : c < 0 ? "▼" : "•"} ${Math.abs(c).toFixed(2)}%</span>`;
        return `<div class="mk"><small>${esc(m.label)}</small><b>${esc(rupees(m.value))}</b>${chg}</div>`;
      }).join("")}</div></div>`;
  }
  function cricketHTML() {
    if (!X.cricket) return "";
    return `<div class="panel"><div class="panel-h"><span>Cricket</span><small>CricAPI</small></div>
      <div class="hscroll">${X.cricket.map((m) => `
        <div class="ck">${m.live ? '<span class="live">Live</span>' : ""}<small>${esc(m.type)}</small>
          <b>${esc(m.name)}</b>${(m.scores || []).map((sc) => `<span>${esc(sc)}</span>`).join("")}
          <small class="ck-status">${esc(m.status)}</small></div>`).join("")}</div></div>`;
  }
  function onThisDayHTML() {
    if (!X.onthisday) return "";
    return `<div class="panel"><div class="panel-h"><span>On this day</span><small>Wikipedia</small></div>
      ${X.onthisday.map((e) => {
        const inner = `<b>${num(e.year)}</b><span>${esc(e.text)}</span>`;
        const href = safeUrl(e.link);
        return href ? `<a class="otd" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>` : `<div class="otd">${inner}</div>`;
      }).join("")}</div>`;
  }
  function listenButton(cls = "") {
    return `<button type="button" class="listen-btn ${cls}" aria-pressed="false">${ICON.play}<span>Listen</span></button>`;
  }
  function toolbarHTML() {
    const seg = (name, value, label, current) => `<button type="button" data-${name}="${value}" aria-pressed="${current === value}">${label}</button>`;
    const filters = active === "saved" ? "" : `
      <div class="seg small" role="group" aria-label="Time range">${seg("range", "all", "All", prefs.range)}${seg("range", "3h", "3 hours", prefs.range)}${seg("range", "today", "Today", prefs.range)}</div>
      <div class="seg small" role="group" aria-label="Sort">${seg("sort", "latest", "Latest", prefs.sort)}${seg("sort", "covered", "Most covered", prefs.sort)}</div>`;
    return `<div class="toolbar">${listenButton("tb-btn")}${filters}</div>`;
  }
  function briefHTML() {
    const n = list.length;
    return `<div class="panel brief-h"><div><p class="bh-title">Your morning brief</p>
      <p class="bh-sub">${esc(today)} · ${n} stories · about ${Math.max(2, Math.round(n * 0.4))} min</p></div>${listenButton("btn primary")}</div>`;
  }
  function followHTML() {
    const sugg = prefs.follow.length < 4 ? SUGGESTED.filter((t) => !prefs.follow.some((f) => f.toLowerCase() === t.toLowerCase())) : [];
    return `<div class="panel"><div class="panel-h"><span>Topics you follow</span><small>Matched in every section</small></div>
      ${prefs.follow.length ? `<div class="chips">${prefs.follow.map((t) => `<span class="chip-x"><span>${esc(t)}</span><button type="button" data-unfollow="${esc(t)}" aria-label="Unfollow ${esc(t)}">×</button></span>`).join("")}</div>` : ""}
      <div class="add-row"><input id="followInput" type="text" maxlength="60" placeholder="Add a topic, e.g. ISRO" aria-label="Topic to follow" autocomplete="off"><button class="btn" type="button" data-follow-add>Follow</button></div>
      ${sugg.length ? `<div class="sugg"><small>Try</small>${sugg.slice(0, 6).map((t) => `<button type="button" data-follow="${esc(t)}">+ ${esc(t)}</button>`).join("")}</div>` : ""}</div>`;
  }

  let extrasKey = "";
  function renderExtras() {
    const inList = effView() === "list" && !els.q.value.trim();
    const k = [inList, mode, active, prefs.follow.join("|"), prefs.range, prefs.sort, active === "brief" ? list.length : ""].join("§");
    if (k === extrasKey) return;
    extrasKey = k;
    const top = [], bottom = [];
    if (inList) {
      if (mode === "live") top.push(rainHTML());
      if (mode === "live" && active === "brief") {
        top.push(briefHTML(), marketsHTML(), cricketHTML());
        bottom.push(onThisDayHTML());
      } else {
        top.push(toolbarHTML());
      }
      if (active === "following") top.push(followHTML());
      if (mode === "live" && active === "business") top.push(marketsHTML());
      if (mode === "live" && active === "sports") top.push(cricketHTML());
    }
    els.extras.innerHTML = top.join("");
    els.extrasEnd.innerHTML = bottom.join("");
    updateListenButtons();
  }

  els.extras.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.classList.contains("listen-btn")) return toggleListen();
    if (b.dataset.range) { prefs.range = b.dataset.range; savePrefs(); return render(); }
    if (b.dataset.sort) { prefs.sort = b.dataset.sort; savePrefs(); return render(); }
    if (b.dataset.unfollow) return unfollowTopic(b.dataset.unfollow);
    if (b.dataset.follow) return followTopic(b.dataset.follow);
    if (b.hasAttribute("data-follow-add")) return followTopic($("#followInput").value);
    if (b.dataset.rainDismiss) { store.set("rainDismissed", b.dataset.rainDismiss); b.closest(".rain-alert").remove(); }
  });
  els.extras.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.id === "followInput") { e.preventDefault(); followTopic(e.target.value); }
  });

  // ───────────────────────── Listen: read headlines aloud (device voices, works offline) ─────────────────────────

  const synth = "speechSynthesis" in window ? window.speechSynthesis : null;
  let voices = [];
  const loadVoices = () => { voices = synth ? synth.getVoices() : []; };
  if (synth) { loadVoices(); synth.addEventListener?.("voiceschanged", loadVoices); }
  const voiceFor = (lang) => {
    const want = lang.toLowerCase(), base = want.split("-")[0];
    return voices.find((v) => v.lang.replace("_", "-").toLowerCase() === want)
      || voices.find((v) => v.lang.toLowerCase().startsWith(base)) || null;
  };
  const langFor = (it) => (langOf[it.category] ? `${langOf[it.category]}-IN` : "en-IN");
  let listening = null;

  function updateListenButtons() {
    document.querySelectorAll(".listen-btn").forEach((b) => {
      b.setAttribute("aria-pressed", String(!!listening));
      b.innerHTML = `${listening ? ICON.stop : ICON.play}<span>${listening ? "Stop" : "Listen"}</span>`;
    });
  }
  function highlight(it) {
    els.feed.querySelector(".card.speaking")?.classList.remove("speaking");
    if (!it) return;
    const i = list.indexOf(it);
    if (i < 0) return;
    while (shown <= i && shown < entries.length) more();
    const el = els.feed.querySelector(`.card[data-i="${i}"]`);
    if (el) { el.classList.add("speaking"); el.scrollIntoView({ block: "center", behavior: "smooth" }); }
  }
  function stopListening() {
    if (!listening) return;
    listening = null;
    synth?.cancel();
    highlight(null);
    updateListenButtons();
  }
  function toggleListen() {
    if (listening) return stopListening();
    if (!synth) return toast("Reading aloud isn't supported in this browser.", { kind: "error" });
    loadVoices();
    const queue = list.filter((it) => langFor(it) === "en-IN" || voiceFor(langFor(it))).slice(0, 25);
    if (!queue.length) return toast("This device has no voice for this language.", { kind: "error" });
    const run = {};
    listening = run;
    updateListenButtons();
    const say = (text, lang, next) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      const v = voiceFor(lang);
      if (v) u.voice = v;
      u.onend = u.onerror = () => { if (listening === run) next(); };
      run.current = u; // keep a reference: some browsers drop callbacks of garbage-collected utterances
      synth.speak(u);
    };
    let idx = -1;
    const next = () => {
      idx++;
      if (idx >= queue.length) return stopListening();
      const it = queue[idx];
      highlight(it);
      say(`${it.title}. ${it.source || ""}.`, langFor(it), next);
    };
    const name = active === "brief" ? "Your morning brief" : (currentTabs().find((t) => t.id === active)?.name || "Headlines");
    synth.cancel();
    say(`${name}. ${queue.length} stories.`, "en-IN", next); // started inside the tap, as iOS requires
  }
  addEventListener("pagehide", stopListening);

  // ───────────────────────── Pull to refresh (phones, list layout) ─────────────────────────

  const ptr = $("#ptr");
  let pull = null;
  document.addEventListener("touchstart", (e) => {
    if (effView() !== "list" || scrollY > 0 || e.touches.length > 1 || document.querySelector("dialog[open]")) return;
    pull = { y: e.touches[0].clientY, d: 0 };
  }, { passive: true });
  document.addEventListener("touchmove", (e) => {
    if (!pull) return;
    pull.d = e.touches[0].clientY - pull.y;
    if (pull.d <= 10 || scrollY > 0) { ptr.hidden = true; return; }
    ptr.hidden = false;
    ptr.style.transform = `translate(-50%, ${Math.min(pull.d / 2.5, 60)}px)`;
    ptr.classList.toggle("ready", pull.d > 140);
    ptr.lastChild.textContent = pull.d > 140 ? "Release to refresh" : "Pull to refresh";
  }, { passive: true });
  document.addEventListener("touchend", () => {
    if (!pull) return;
    const go = pull.d > 140 && scrollY <= 0;
    pull = null;
    ptr.hidden = true;
    if (go) pullRefresh();
  }, { passive: true });

  // ───────────────────────── Keyboard shortcuts (laptops) ─────────────────────────

  function currentCard() {
    if (effView() === "cards") {
      const i = Math.round(els.feed.scrollTop / Math.max(1, els.feed.clientHeight));
      return els.feed.querySelectorAll(".slide[data-i]")[i] || null;
    }
    return els.feed.querySelector(".card.kbd");
  }
  function moveFocus(dir) {
    if (effView() === "cards") return els.feed.scrollBy({ top: dir * els.feed.clientHeight, behavior: "smooth" });
    let cards = [...els.feed.querySelectorAll(".card[data-i]")];
    let i = cards.indexOf(els.feed.querySelector(".card.kbd")) + dir;
    if (i >= cards.length) { more(); cards = [...els.feed.querySelectorAll(".card[data-i]")]; }
    i = Math.max(0, Math.min(i, cards.length - 1));
    cards.forEach((c) => c.classList.remove("kbd"));
    if (cards[i]) { cards[i].classList.add("kbd"); cards[i].scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  }
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target instanceof Element ? e.target : document.body;
    if (target.closest("input, textarea, select") || document.querySelector("dialog[open]")) {
      if (e.key === "Escape" && e.target === els.q) els.q.blur();
      return;
    }
    const k = e.key, cardsMode = effView() === "cards";
    if (k === "/") { e.preventDefault(); return els.q.focus(); }
    if (k === "?") { e.preventDefault(); return $("#keysDlg").showModal(); }
    if (k === "v") return setView(view === "cards" ? "list" : "cards");
    if (k === "l") return toggleListen();
    if (/^[1-9]$/.test(k)) { const tab = currentTabs()[Number(k) - 1]; if (tab) select(tab.id, true); return; }
    const dir = cardsMode
      ? { ArrowDown: 1, PageDown: 1, j: 1, " ": 1, ArrowUp: -1, PageUp: -1, k: -1 }[k]
      : { j: 1, k: -1 }[k];
    if (dir) { e.preventDefault(); return moveFocus(dir); }
    if (target.closest("button, a")) return;
    const cur = currentCard();
    const it = cur && list[Number(cur.dataset.i)];
    if (!it) return;
    if (k === "o" || k === "Enter") cur.querySelector("a.hit")?.click();
    else if (k === "s") toggleSave(it, cur.querySelector(".act.save"));
    else if (k === "m") openMenu(cur.querySelector(".act.more"), it, cur);
  });
  $("#keysClose").addEventListener("click", () => $("#keysDlg").close());

  // ───────────────────────── Reading stats (Personalise) ─────────────────────────

  function renderStats() {
    const el = $("#stats");
    const now = Date.now(), weekAgo = now - 7 * 864e5, todayStart = new Date().setHours(0, 0, 0, 0);
    const week = readLog.filter((r) => r[0] >= weekAgo);
    const days = new Set(readLog.map((r) => new Date(r[0]).toDateString()));
    const d = new Date();
    if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
    let streak = 0;
    while (days.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1); }
    const counts = {};
    week.forEach((r) => { counts[r[1]] = (counts[r[1]] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const max = top[0]?.[1] || 1;
    el.innerHTML = `
      <div class="stats-nums">
        <div><b>${readLog.filter((r) => r[0] >= todayStart).length}</b><small>today</small></div>
        <div><b>${week.length}</b><small>this week</small></div>
        <div><b>${streak}</b><small>day streak</small></div>
      </div>
      ${top.length ? `<ul class="bars">${top.map(([c, n]) => `<li><span>${esc(c)}</span><span class="meter"><i data-w="${Math.round((n / max) * 100)}" data-c="${colorFor(c)}"></i></span><b>${n}</b></li>`).join("")}</ul>`
        : '<p class="note">Open a few stories and your reading stats will show up here.</p>'}`;
    paint(el);
    el.querySelectorAll("[data-w]").forEach((i) => { i.style.width = `${i.dataset.w}%`; });
  }

  // ───────────────────────── start ─────────────────────────

  document.querySelectorAll("[data-set-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.setView === view)));
  $("#viewBtn").title = view === "cards" ? "Switch to list" : "Switch to swipe cards";
  $("#viewBtn").setAttribute("aria-label", $("#viewBtn").title);
  renderWeather();
  const hashId = location.hash.slice(1);
  active = currentTabs().some((x) => x.id === hashId) ? hashId : DEFAULT_TAB;
  renderTabs();
  select(active, false);

  // ───────────────────────── Refresh button + "new stories" banner ─────────────────────────

  function setupRefresh(loadedAt) {
    const btn = $("#refresh"), banner = $("#banner");
    const dlg = $("#tokenDlg"), tokIn = $("#tokenInput"), tokErr = $("#tokenErr");
    let busy = false;

    // Never offer the token dialog inside someone else's frame (clickjacking).
    if (window.top !== window.self) {
      btn.hidden = true;
      $("#tokenOpen").hidden = true;
      return;
    }

    const setBusy = (b) => { busy = b; btn.classList.toggle("spin", b); btn.disabled = b; };

    async function latestVersion() {
      try {
        const r = await fetch("version.json?t=" + Date.now(), { cache: "no-store" });
        return r.ok ? (await r.json()).generated || "" : "";
      } catch { return ""; }
    }

    async function loadFresh() {
      toast("Loading the latest stories…", { sticky: true });
      try { await fetch("data.js", { cache: "reload" }); } catch {}
      location.reload();
    }

    // Banner: appears when a newer update has been published while the page is open.
    let bannerShown = false;
    async function checkForUpdate() {
      if (busy || bannerShown || document.hidden) return;
      const v = await latestVersion();
      if (v && v > loadedAt) { banner.hidden = false; bannerShown = true; }
    }
    banner.addEventListener("click", loadFresh);
    setInterval(checkForUpdate, 5 * 60_000);
    document.addEventListener("visibilitychange", checkForUpdate);

    // Token dialog
    openTokenDialog = (message) => {
      tokIn.value = "";
      tokErr.textContent = message || "";
      $("#tokenForget").hidden = !store.get(TOKEN_KEY);
      dlg.showModal();
      tokIn.focus();
    };
    $("#tokenSave").addEventListener("click", () => {
      const v = tokIn.value.trim();
      if (/^(ghp_|gho_|ghu_|ghs_)/.test(v)) {
        tokErr.textContent = "That's a classic/full-access token. Please create a fine-grained token (starts with github_pat_).";
        return;
      }
      if (!TOKEN_RE.test(v)) {
        tokErr.textContent = "That doesn't look like a fine-grained token (it should start with github_pat_).";
        return;
      }
      store.set(TOKEN_KEY, v);
      tokIn.value = "";
      dlg.close();
      refresh();
    });
    $("#tokenCancel").addEventListener("click", () => { tokIn.value = ""; dlg.close(); });
    $("#tokenForget").addEventListener("click", () => {
      store.del(TOKEN_KEY);
      tokIn.value = "";
      dlg.close();
      toast("Token removed from this device.");
    });

    async function refresh() {
      if (busy) return;
      const token = store.get(TOKEN_KEY);
      if (!token || !TOKEN_RE.test(token)) return openTokenDialog();
      if (!navigator.onLine) return toast("You're offline. Connect to the internet to fetch fresh news.", { kind: "error" });

      setBusy(true);
      toast("Asking GitHub to fetch the latest news…", { sticky: true });
      let res;
      try {
        res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ref: "main" }),
          cache: "no-store",
          credentials: "omit",
          referrerPolicy: "no-referrer",
        });
      } catch {
        setBusy(false);
        return toast("Couldn't reach GitHub. Check your connection.", { kind: "error" });
      }

      if (res.status === 401) {
        store.del(TOKEN_KEY);
        setBusy(false);
        els.toast.classList.remove("show");
        return openTokenDialog("GitHub rejected the saved token (expired or deleted). Please paste a new one.");
      }
      if (res.status === 403 || res.status === 404) {
        setBusy(false);
        els.toast.classList.remove("show");
        return openTokenDialog("The token works but can't run this job. Make sure it has access to the daily-news repository with Actions: Read and write.");
      }
      if (!res.ok) {
        setBusy(false);
        return toast(`GitHub returned an error (${res.status}). Try again in a minute.`, { kind: "error" });
      }

      toast("Fetching news… this takes about a minute.", { sticky: true });
      const deadline = Date.now() + 5 * 60_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 10_000));
        const v = await latestVersion();
        if (v && v > loadedAt) return loadFresh();
      }
      setBusy(false);
      toast("Still working on GitHub's side. The banner will appear when it's ready.", { kind: "error" });
    }
    btn.addEventListener("click", refresh);

    // Pull to refresh: load a newer published update if there is one; otherwise run ⟳ if it's set up.
    pullRefresh = async () => {
      const v = await latestVersion();
      if (v && v > loadedAt) return loadFresh();
      if (store.get(TOKEN_KEY) && TOKEN_RE.test(store.get(TOKEN_KEY))) return refresh();
      toast(`You're up to date (updated ${DATA ? ago(DATA.generated) : "recently"}). Set up ⟳ to fetch news instantly.`);
    };
  }
})();

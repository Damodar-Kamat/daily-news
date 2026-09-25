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
  };

  const $ = (s, r = document) => r.querySelector(s);
  const els = {
    tabs: $("#tabs"), feed: $("#feed"), meta: $("#meta"), q: $("#q"), wx: $("#weather"),
    modebar: $("#modebar"), toast: $("#toast"), menu: $("#menu"), past: $("#pastSearch"), end: $("#feedEnd"),
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

  // Theme toggle (auto by default, remembers manual choice)
  const savedTheme = store.get("theme");
  if (savedTheme === "light" || savedTheme === "dark") document.documentElement.dataset.theme = savedTheme;
  $("#theme").addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    store.set("theme", next);
  });

  // Installable app + offline reading.
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  let openTokenDialog = () => {};
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

  let mutedSet = new Set(), muteRe = null;
  function buildMute() {
    mutedSet = new Set(prefs.mutedSources.map((s) => s.toLowerCase()));
    const words = prefs.mutedWords.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    // Whole-word match that also works for Hindi/Kannada (JS \b is ASCII-only).
    muteRe = words.length ? new RegExp(`(^|[^\\p{L}\\p{N}])(${words.join("|")})(?=$|[^\\p{L}\\p{N}])`, "iu") : null;
  }
  buildMute();
  const visible = (it) => !mutedSet.has((it.source || "").toLowerCase()) && !(muteRe && muteRe.test(`${it.title} ${it.summary || ""}`));

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

  function allLiveTabs() {
    const base = [...live, { id: "saved", name: "Saved", get items() { return saved; } }];
    const pos = (t, i) => { const p = prefs.order.indexOf(t.id); return p === -1 ? 1000 + i : p; };
    return base.map((t, i) => [pos(t, i), t]).sort((a, b) => a[0] - b[0]).map(([, t]) => t);
  }
  const currentTabs = () => (mode === "archive" ? archiveCats : allLiveTabs().filter((t) => !prefs.hidden.includes(t.id)));
  const tabItems = (id) => (currentTabs().find((t) => t.id === id) || { items: [] }).items;

  function renderTabs() {
    const x = els.tabs.scrollLeft;
    els.tabs.innerHTML = currentTabs().map((t) => {
      const n = t.id === "saved" || t.complete === undefined || t.complete ? t.items.filter((it) => t.id === "saved" || visible(it)).length : t.total;
      const fresh = mode === "live" && t.id !== "saved" ? (t.ids || []).filter(isNewId).length : 0;
      return `<button class="tab" role="tab" data-id="${esc(t.id)}" data-c="${COLORS[t.id] || colorFor(t.name)}" aria-selected="${t.id === active}">
        ${t.id === "saved" ? ICON.bookmark : '<span class="dot"></span>'}${esc(t.name)}<span class="count">${n}</span>${fresh ? `<span class="fresh" title="${fresh} new since your last visit">${fresh}</span>` : ""}
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
    if (mode === "live") loadSection(id).then(() => sectionArrived(id));
  }

  // A section's full list arrived: extend the current feed in place (the first stories are the same,
  // so what's already on screen doesn't change or jump).
  function sectionArrived(id) {
    if (id !== active || mode !== "live") return;
    if (els.q.value.trim()) return render();
    buildEntries();
    renderTabs();
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
      leadOn = active !== "saved";
      divider = mode === "live" && !["all", "top", "saved"].includes(active);
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

  function render() {
    const q = els.q.value.trim().toLowerCase();
    buildEntries();
    els.feed.innerHTML = list.length || waitingForData() ? "" : `<p class="empty">${
      q ? `No stories matching “${esc(q)}”.`
        : active === "saved" ? "Nothing saved yet. Tap the bookmark on any story to keep it here."
          : "No stories here right now."}</p>`;
    shown = 0;
    more(FIRST_BATCH);
    fill();
    els.past.hidden = !(q && DATA.archive && !pastResults);
    els.past.disabled = false;
    els.past.textContent = "Search the last 30 days too";
    // Searching needs every section; fetch the ones not loaded yet, then search again.
    if (q && mode === "live" && live.some((c) => !c.complete)) {
      loadAllSections().then(() => { if (els.q.value.trim().toLowerCase() === q) render(); });
    }
  }

  // Is more data on its way for what's on screen (a section still downloading, or a search across sections)?
  function waitingForData() {
    if (mode !== "live") return false;
    if (els.q.value.trim()) return live.some((c) => !c.complete);
    const sec = live.find((c) => c.id === active);
    return !!sec && !sec.complete;
  }

  // How many cards fill roughly one screen: columns × rows that fit in the window.
  function batchSize() {
    const cols = getComputedStyle(els.feed).gridTemplateColumns.split(" ").filter(Boolean).length || 1;
    const rowHeight = innerWidth <= 760 ? 124 : 360;
    return Math.max(6, cols * Math.ceil(innerHeight / rowHeight));
  }

  function more(count = batchSize()) {
    if (shown < entries.length) {
      const chunk = entries.slice(shown, shown + count);
      els.feed.insertAdjacentHTML("beforeend", chunk.map((e) => (e.divider
        ? '<div class="divider" role="separator"><span>Earlier stories</span></div>'
        : card(e.it, e.i, leadOn && e.i === 0))).join(""));
      paint(els.feed);
      shown += chunk.length;
    }
    updateFeedEnd();
  }

  // Keep adding batches while the bottom of the feed is within about a screen of the viewport.
  function fill() {
    let guard = 0;
    while (shown < entries.length && $("#sentinel").getBoundingClientRect().top < innerHeight * 2 && guard++ < 20) more();
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
    const img = imgUrl
      ? `<img src="${esc(imgUrl)}" alt="" loading="${i < 4 ? "eager" : "lazy"}" decoding="async" referrerpolicy="no-referrer" data-label="${label}">`
      : `<div class="ph">${label}</div>`;
    const showChip = isLead || ["all", "top", "saved"].includes(active) || els.q.value.trim();
    const fresh = mode === "live" && isNew(it);
    const isSaved = savedLinks.has(it.link);
    const also = Array.isArray(it.also) ? it.also.filter((a) => a && safeUrl(a.link)) : [];
    const when = mode === "archive" || it._day ? shortDate(it) : ago(it.published);
    const lang = langOf[it.category];
    return `
      <article class="card${isLead ? " lead" : ""}${readSet.has(key(it)) ? " read" : ""}" data-i="${i}" data-c="${colorFor(it.category)}"${lang ? ` lang="${esc(lang)}"` : ""}>
        <div class="thumb">${img}${showChip ? `<span class="chip">${esc(it.category)}</span>` : ""}${fresh ? '<span class="new">New</span>' : ""}</div>
        <div class="body">
          <h2 class="title"><a class="hit" href="${esc(safeUrl(it.link))}" target="_blank" rel="noopener noreferrer">${esc(it.title)}</a></h2>
          ${it.summary ? `<p class="summary">${esc(it.summary)}</p>` : ""}
          <div class="row">
            <span class="src"><b>${esc(it.source)}</b>${when ? `<span> · ${esc(when)}</span>` : ""}</span>
            <span class="acts">
              ${also.length ? `<button class="cov" type="button" aria-expanded="false" title="Other outlets covering this story">${also.length + 1} sources</button>` : ""}
              <button class="act save" type="button" aria-pressed="${isSaved}" aria-label="${isSaved ? "Remove from saved" : "Save for later"}" title="${isSaved ? "Saved" : "Save for later"}">${ICON.bookmark}</button>
              <button class="act more" type="button" aria-haspopup="menu" aria-label="More options" title="More">${ICON.dots}</button>
            </span>
          </div>
          ${also.length ? `<ul class="also" hidden>${also.map((a) => `<li><a href="${esc(safeUrl(a.link))}" target="_blank" rel="noopener noreferrer"><b>${esc(a.source)}</b> ${esc(a.title)}</a></li>`).join("")}</ul>` : ""}
        </div>
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
    if (e.target.closest("a.hit")) return markRead(it, cardEl);
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
    const a = e.target.closest("a.hit");
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
  new IntersectionObserver((e) => { if (e[0].isIntersecting) { more(); fill(); } }, { rootMargin: "100% 0px" }).observe($("#sentinel"));

  // Back-to-top button once you've scrolled a couple of screens down.
  const topBtn = $("#toTop");
  addEventListener("scroll", () => { topBtn.hidden = scrollY < innerHeight * 2; }, { passive: true });
  topBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

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
    els.wx.innerHTML = `
      <div class="wx-now">
        <span class="wx-icon" aria-hidden="true">${esc(w.icon)}</span>
        <div><b>${num(w.temp)}°</b> <span>${esc(w.city)}</span><br>
          <small>${esc(w.label)} · feels ${num(w.feels)}° · humidity ${num(w.humidity)}%</small></div>
      </div>
      <div class="wx-days">${(w.days || []).map((d, i) => `
        <div class="wx-day"><small>${esc(name(d.date, i))}</small><span aria-hidden="true">${esc(d.icon)}</span>
          <small>${num(d.max)}° / ${num(d.min)}°</small><small class="rain" title="Chance of rain">💧${num(d.rain)}%</small></div>`).join("")}
      </div>`;
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
  $("#clearRead").addEventListener("click", () => {
    readSet.clear();
    store.del("read");
    render(); renderTabs();
    toast("Reading history cleared");
  });
  $("#tokenOpen").addEventListener("click", () => { prefsDlg.close(); openTokenDialog(); });
  $("#prefsReset").addEventListener("click", () => {
    Object.assign(prefs, { order: [], hidden: [], mutedSources: [], mutedWords: [] });
    applyPrefs();
    toast("Sections and hidden items reset");
  });

  // ───────────────────────── start ─────────────────────────

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
  }
})();

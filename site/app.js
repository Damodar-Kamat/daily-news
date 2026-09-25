(() => {
  const DATA = window.NEWS_DATA;
  const PAGE = 24;
  const DEFAULT_TAB = "tech"; // section shown when the page is opened without a #section in the URL
  const COLORS = {
    all: "#ff6a3d", india: "#ff9933", defence: "#4f7942", world: "#3b82f6", business: "#0ea5a4",
    sports: "#e11d48", tech: "#8b5cf6", science: "#06b6d4", entertainment: "#ec4899", health: "#22c55e",
  };
  const colorFor = (name) => COLORS[(name || "").toLowerCase()] || "#ff6a3d";

  const $ = (s) => document.querySelector(s);
  const tabsEl = $("#tabs"), feedEl = $("#feed"), metaEl = $("#meta"), qEl = $("#q");

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };

  // Theme toggle (auto by default, remembers manual choice)
  const savedTheme = store.get("theme");
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  $("#theme").addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    store.set("theme", next);
  });

  if (!DATA) {
    metaEl.textContent = "No data yet";
    feedEl.innerHTML = '<p class="empty">Run <code>python3 fetch_news.py</code> to fetch today\'s news.</p>';
    return;
  }

  const ago = (iso) => {
    if (!iso) return "";
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };
  const esc = (s) => (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const updateMeta = () => (metaEl.textContent = `${today} · updated ${ago(DATA.generated)}`);
  updateMeta();
  setInterval(updateMeta, 60_000);

  const cats = DATA.categories;
  const ids = cats.map((c) => c.id);
  let active = (location.hash.slice(1) && ids.includes(location.hash.slice(1)) && location.hash.slice(1))
    || (ids.includes(DEFAULT_TAB) && DEFAULT_TAB) || "all";
  let list = [], shown = 0;

  tabsEl.innerHTML = cats.map((c) => `
    <button class="tab" role="tab" data-id="${c.id}" style="--c:${colorFor(c.id)}">
      <span class="dot"></span>${esc(c.name)}<span class="count">${c.items.length}</span>
    </button>`).join("");
  tabsEl.addEventListener("click", (e) => {
    const b = e.target.closest(".tab");
    if (b) select(b.dataset.id, true);
  });

  function card(it, lead) {
    const c = colorFor(it.category);
    const showChip = active === "all" || lead;
    const label = esc(it.source || it.category || "News");
    const img = it.image
      ? `<img src="${esc(it.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"
           onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'ph',textContent:'${label}'}))">`
      : `<div class="ph">${label}</div>`;
    return `
      <a class="card${lead ? " lead" : ""}" href="${esc(it.link)}" target="_blank" rel="noopener" style="--c:${c}">
        <div class="thumb">${img}${showChip ? `<span class="chip">${esc(it.category)}</span>` : ""}</div>
        <div class="body">
          <h2 class="title">${esc(it.title)}</h2>
          ${it.summary ? `<p class="summary">${esc(it.summary)}</p>` : ""}
          <div class="src"><b>${esc(it.source)}</b>${it.published ? `<span>· ${ago(it.published)}</span>` : ""}</div>
        </div>
      </a>`;
  }

  function more() {
    if (shown >= list.length) return;
    const next = list.slice(shown, shown + PAGE);
    feedEl.insertAdjacentHTML("beforeend", next.map((it, i) => card(it, shown === 0 && i === 0 && !qEl.value)).join(""));
    shown += next.length;
  }

  function render() {
    const cat = cats.find((c) => c.id === active);
    const q = qEl.value.trim().toLowerCase();
    list = q
      ? cats[0].items.concat(...cats.slice(1).map((c) => c.items))
          .filter((it, i, a) => a.findIndex((x) => x.link === it.link) === i)
          .filter((it) => (it.title + " " + it.summary + " " + it.source).toLowerCase().includes(q))
      : cat.items;
    // Lead with a story that has an image.
    if (!q) {
      const li = list.findIndex((it) => it.image);
      if (li > 0) list = [list[li], ...list.slice(0, li), ...list.slice(li + 1)];
    }
    feedEl.innerHTML = list.length ? "" : `<p class="empty">No stories${q ? ` matching “${esc(q)}”` : ""}.</p>`;
    shown = 0;
    more();
  }

  function select(id, userAction) {
    active = id;
    history.replaceState(null, "", "#" + id);
    tabsEl.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-selected", b.dataset.id === id));
    // Centre the selected tab in the (horizontally scrollable) tab strip.
    const b = tabsEl.querySelector(`[data-id="${id}"]`);
    const left = b.getBoundingClientRect().left - tabsEl.getBoundingClientRect().left + tabsEl.scrollLeft;
    tabsEl.scrollTo({ left: left - (tabsEl.clientWidth - b.offsetWidth) / 2, behavior: userAction ? "smooth" : "auto" });
    if (userAction) {
      qEl.value = "";
      window.scrollTo({ top: 0 });
    }
    render();
  }

  let t;
  qEl.addEventListener("input", () => { clearTimeout(t); t = setTimeout(render, 150); });
  new IntersectionObserver((e) => e[0].isIntersecting && more(), { rootMargin: "800px" }).observe($("#sentinel"));

  addEventListener("hashchange", () => {
    const id = location.hash.slice(1);
    if (ids.includes(id) && id !== active) select(id, true);
  });

  select(active, false);
})();

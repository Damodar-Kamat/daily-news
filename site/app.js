(() => {
  const DATA = window.NEWS_DATA;
  const PAGE = 24;
  const DEFAULT_TAB = "tech"; // section shown when the page is opened without a #section in the URL
  const COLORS = {
    all: "#ff6a3d", india: "#ff9933", defence: "#4f7942", world: "#3b82f6", business: "#0ea5a4",
    sports: "#e11d48", tech: "#8b5cf6", science: "#06b6d4", entertainment: "#ec4899", health: "#22c55e",
  };
  const colorFor = (name) => COLORS[(name || "").toLowerCase()] || "#ff6a3d";

  // ⟳ button: which GitHub workflow to start. Fixed here on purpose (never read from the URL).
  const REPO = "Damodar-Kamat/daily-news";
  const WORKFLOW = "update.yml";
  const TOKEN_KEY = "gh_refresh_token";
  const TOKEN_RE = /^github_pat_[A-Za-z0-9_]{40,255}$/; // fine-grained tokens only

  const $ = (s) => document.querySelector(s);
  const tabsEl = $("#tabs"), feedEl = $("#feed"), metaEl = $("#meta"), qEl = $("#q");

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };

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

  setupRefresh(DATA ? DATA.generated : "");

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
    <button class="tab" role="tab" data-id="${esc(c.id)}" data-c="${colorFor(c.id)}">
      <span class="dot"></span>${esc(c.name)}<span class="count">${c.items.length}</span>
    </button>`).join("");
  paint(tabsEl);
  tabsEl.addEventListener("click", (e) => {
    const b = e.target.closest(".tab");
    if (b) select(b.dataset.id, true);
  });

  // Broken image → coloured tile with the source name (no inline onerror handlers).
  feedEl.addEventListener("error", (e) => {
    const img = e.target;
    if (img.tagName !== "IMG") return;
    const ph = document.createElement("div");
    ph.className = "ph";
    ph.textContent = img.dataset.label || "";
    img.replaceWith(ph);
  }, true);

  function card(it, lead) {
    const label = esc(it.source || it.category || "News");
    const imgUrl = safeUrl(it.image);
    const img = imgUrl
      ? `<img src="${esc(imgUrl)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-label="${label}">`
      : `<div class="ph">${label}</div>`;
    const showChip = active === "all" || lead;
    return `
      <a class="card${lead ? " lead" : ""}" href="${esc(safeUrl(it.link))}" target="_blank" rel="noopener noreferrer" data-c="${colorFor(it.category)}">
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
    paint(feedEl);
    shown += next.length;
  }

  function render() {
    const cat = cats.find((c) => c.id === active);
    const q = qEl.value.trim().toLowerCase();
    list = (q
      ? cats[0].items.concat(...cats.slice(1).map((c) => c.items))
          .filter((it, i, a) => a.findIndex((x) => x.link === it.link) === i)
          .filter((it) => (it.title + " " + it.summary + " " + it.source).toLowerCase().includes(q))
      : cat.items
    ).filter((it) => safeUrl(it.link));
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
    const b = tabsEl.querySelector(`[data-id="${CSS.escape(id)}"]`);
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

  // ───────────────────────── Refresh button + "new stories" banner ─────────────────────────

  function setupRefresh(loadedAt) {
    const btn = $("#refresh"), toast = $("#toast"), banner = $("#banner");
    const dlg = $("#tokenDlg"), tokIn = $("#tokenInput"), tokErr = $("#tokenErr");
    let busy = false;

    // Never offer the token dialog inside someone else's frame (clickjacking).
    if (window.top !== window.self) {
      btn.hidden = true;
      $("#refreshSettings").hidden = true;
      return;
    }

    const say = (msg, kind = "") => {
      toast.textContent = msg;
      toast.className = "toast show " + kind;
      clearTimeout(say.t);
      if (kind !== "busy") say.t = setTimeout(() => toast.classList.remove("show"), 6000);
    };
    const setBusy = (b) => { busy = b; btn.classList.toggle("spin", b); btn.disabled = b; };

    async function latestVersion() {
      try {
        const r = await fetch("version.json?t=" + Date.now(), { cache: "no-store" });
        return r.ok ? (await r.json()).generated || "" : "";
      } catch { return ""; }
    }

    async function loadFresh() {
      say("Loading the latest stories…", "busy");
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
    function openDialog(message) {
      tokIn.value = "";
      tokErr.textContent = message || "";
      $("#tokenForget").hidden = !store.get(TOKEN_KEY);
      dlg.showModal();
      tokIn.focus();
    }
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
      say("Token removed from this device.");
    });
    $("#refreshSettings").addEventListener("click", (e) => { e.preventDefault(); openDialog(); });

    async function refresh() {
      if (busy) return;
      const token = store.get(TOKEN_KEY);
      if (!token || !TOKEN_RE.test(token)) return openDialog();

      setBusy(true);
      say("Asking GitHub to fetch the latest news…", "busy");
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
        return say("Couldn't reach GitHub. Check your connection.", "error");
      }

      if (res.status === 401) {
        store.del(TOKEN_KEY);
        setBusy(false);
        toast.classList.remove("show");
        return openDialog("GitHub rejected the saved token (expired or deleted). Please paste a new one.");
      }
      if (res.status === 403 || res.status === 404) {
        setBusy(false);
        toast.classList.remove("show");
        return openDialog("The token works but can't run this job. Make sure it has access to the daily-news repository with Actions: Read and write.");
      }
      if (!res.ok) {
        setBusy(false);
        return say(`GitHub returned an error (${res.status}). Try again in a minute.`, "error");
      }

      say("Fetching news… this takes about a minute.", "busy");
      const deadline = Date.now() + 5 * 60_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 10_000));
        const v = await latestVersion();
        if (v && v > loadedAt) return loadFresh();
      }
      setBusy(false);
      say("Still working on GitHub's side. The banner will appear when it's ready.", "error");
    }
    btn.addEventListener("click", refresh);
  }
})();

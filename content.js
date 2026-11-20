// RYM Now Playing (Last.fm): shows your Last.fm now playing / last played album inside the
// "Listening to" card on your own RYM profile, with buttons to set it or open it on RYM.

/* ---------- environment (chrome APIs; swappable for testing) ---------- */

const RLS_ENV = window.RLS_TEST_ENV || {
  settings: () => chrome.storage.sync.get(RLS_DEFAULTS),
  getLocal: (defaults) => chrome.storage.local.get(defaults),
  setLocal: (obj) => chrome.storage.local.set(obj),
  lastfmRecent: (s) => new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: "lastfmRecent", user: s.lastfmUser, apiKey: s.apiKey || RLS_CONFIG.apiKey, limit: 2 },
      (res) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!res || !res.ok) return reject(new Error("Last.fm: " + ((res && res.error) || "no response")));
        resolve(res.data);
      });
  })
};

/* ---------- text helpers ---------- */

function rlsNorm(s) {
  return (s || "")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function rlsCleanAlbum(s) {
  return (s || "")
    .replace(/\s*[\(\[][^\)\]]*(deluxe|remaster|edition|expanded|anniversary|version|bonus|reissue|mono|stereo|explicit)[^\)\]]*[\)\]]/gi, "")
    .replace(/\s+-\s+(ep|single)$/i, "")
    .trim();
}

function rlsAgo(uts) {
  const s = Math.max(0, Date.now() / 1000 - uts);
  if (s < 90) return "just now";
  if (s < 3600) return Math.round(s / 60) + " min ago";
  if (s < 86400) return Math.round(s / 3600) + " h ago";
  return Math.round(s / 86400) + " d ago";
}

/* ---------- RYM session & requests ---------- */

function rlsReadSession() {
  for (const s of document.querySelectorAll("script:not([src])")) {
    const m = s.textContent.match(/rym\.session\.init\(\s*(\d+)\s*,\s*'([^']*)'\s*,\s*'([^']+)'/);
    if (m) return { userId: m[1], username: m[2], token: m[3] };
  }
  return null;
}

async function rlsPost(session, action, fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  fd.append("action", action);
  fd.append("rym_ajax_req", "1");
  fd.append("request_token", session.token);
  const r = await fetch("/httprequest/" + action, { method: "POST", body: fd, credentials: "include" });
  if (!r.ok) throw new Error("RYM " + action + " returned HTTP " + r.status);
  return r.text(); // RYM returns JavaScript meant for eval; we only inspect it, never run it.
}

async function rlsSetListening(session, assocId) {
  const body = await rlsPost(session, "AddPlayHistory", {
    object: "release", assoc_id: String(assocId), track_id: "", comments: ""
  });
  if (!/play_history_item_\d+/.test(body)) throw new Error("RYM did not confirm the update");
}

// Re-render RYM's own "Listening to" entry from a fresh copy of the profile page.
async function rlsRefreshRymEntry() {
  const r = await fetch(location.pathname, { credentials: "include", cache: "no-store" });
  const doc = new DOMParser().parseFromString(await r.text(), "text/html");
  const fresh = doc.querySelector("#profile_play_history_container");
  const cur = document.querySelector("#profile_play_history_container");
  if (fresh && cur) cur.replaceChildren(...[...fresh.childNodes].map((n) => document.importNode(n, true)));
}

function rlsCurrentRymAssocId() {
  const a = document.querySelector('#profile_play_history_container a.album[title^="[Album"]');
  const m = a && a.getAttribute("title").match(/\[Album(\d+)\]/);
  return m ? m[1] : null;
}

/* ---------- RYM release lookup ---------- */

const RLS_TYPE_WEIGHT = { album: 5, ep: 4, mixtape: 3, comp: 2, single: 1 };

async function rlsSearchReleases(query) {
  const r = await fetch("/search?searchtype=l&searchterm=" + encodeURIComponent(query), { credentials: "include" });
  if (!r.ok) throw new Error("RYM search returned HTTP " + r.status);
  const doc = new DOMParser().parseFromString(await r.text(), "text/html");
  const out = [];
  for (const a of doc.querySelectorAll('a.searchpage[href*="/release/"]')) {
    const row = a.closest("tr");
    if (!row) continue;
    const path = a.getAttribute("href").split("?")[0];
    out.push({
      url: "https://rateyourmusic.com" + path,
      type: (path.split("/")[2] || "").toLowerCase(),
      title: a.textContent.trim(),
      artists: [...row.querySelectorAll("a.artist")].map((x) => x.textContent.trim())
    });
  }
  return out;
}

function rlsScore(cand, artist, album) {
  const na = rlsNorm(artist);
  const artistOk = cand.artists.some((x) => {
    const nx = rlsNorm(x);
    return nx && (nx === na || na.includes(nx) || nx.includes(na));
  }) || cand.artists.map(rlsNorm).join("") === na;
  if (!artistOk) return -1;
  const nt = rlsNorm(cand.title);
  const full = rlsNorm(album);
  const clean = rlsNorm(rlsCleanAlbum(album));
  let titleScore = 0;
  if (nt === full || nt === clean) titleScore = 3;
  else if (nt.length > 3 && clean.length > 3 && (nt.includes(clean) || clean.includes(nt))) titleScore = 1;
  if (!titleScore) return -1;
  return titleScore * 10 + (RLS_TYPE_WEIGHT[cand.type] || 2);
}

async function rlsReleaseInfo(url) {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error("RYM release page returned HTTP " + r.status);
  const html = await r.text();
  const m = html.match(/RYMPlayHistory\.assoc_id\s*=\s*(\d+)/);
  if (!m) throw new Error("Could not read the release ID from that page");
  const og = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/);
  return { assocId: m[1], url, cover: og ? og[1] : "" };
}

async function rlsFindRelease(artist, album) {
  const queries = [artist + " " + album];
  const cleaned = rlsCleanAlbum(album);
  if (cleaned !== album) queries.push(artist + " " + cleaned);
  let best = null;
  for (const q of queries) {
    for (const c of await rlsSearchReleases(q)) {
      const s = rlsScore(c, artist, album);
      if (s > 0 && (!best || s > best.score)) best = { ...c, score: s };
    }
    if (best && best.score >= 30) break;
  }
  return best ? rlsReleaseInfo(best.url) : null;
}

/* ---------- Last.fm ---------- */

const RLS_LASTFM_PLACEHOLDER = "2a96cbd8b46e442fc41c2b86b821562f";

function rlsParseLatest(data) {
  let tracks = (data && data.recenttracks && data.recenttracks.track) || [];
  if (!Array.isArray(tracks)) tracks = [tracks];
  const t = tracks[0];
  if (!t) return null;
  const img = ((t.image || []).find((i) => i.size === "extralarge") || {})["#text"] || "";
  return {
    artist: (t.artist && (t.artist["#text"] || t.artist.name)) || "",
    album: (t.album && t.album["#text"]) || "",
    track: t.name || "",
    url: t.url || "",
    cover: img.includes(RLS_LASTFM_PLACEHOLDER) ? "" : img,
    nowPlaying: !!(t["@attr"] && t["@attr"].nowplaying),
    uts: t.date ? Number(t.date.uts) : null
  };
}

/* ---------- UI ---------- */

function rlsEl(tag, attrs, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") e.className = v; else if (k in e) e[k] = v; else e.setAttribute(k, v);
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
}

function rlsSearchUrl(np) {
  return "https://rateyourmusic.com/search?searchtype=l&searchterm=" + encodeURIComponent(np.artist + " " + rlsCleanAlbum(np.album));
}

const RLS = {
  session: null, settings: null, box: null,
  np: null, release: null, releaseKey: null, lookupKey: null, resolvedKey: null,
  addingLink: false, busy: false, message: ""
};

function rlsAlbumKey(np) {
  return np && np.album ? rlsNorm(np.artist) + "|" + rlsNorm(rlsCleanAlbum(np.album)) : null;
}

function rlsRender() {
  const np = RLS.np;
  const box = RLS.box;
  if (!np) { box.replaceChildren(); box.hidden = true; return; }
  box.hidden = false;

  const rel = RLS.releaseKey === rlsAlbumKey(np) ? RLS.release : null;
  const cover = np.cover || (rel && rel.cover) || "";
  const coverEl = cover
    ? rlsEl("img", { class: "rls-cover", src: cover, alt: "" })
    : rlsEl("div", { class: "rls-cover rls-cover-empty" });

  const label = rlsEl("div", { class: "rls-label" },
    np.nowPlaying
      ? rlsEl("span", { class: "rls-live" }, rlsEl("span", { class: "rls-bars" }, rlsEl("i"), rlsEl("i"), rlsEl("i")), "Now playing")
      : rlsEl("span", { class: "rls-past" }, "Last played · " + rlsAgo(np.uts)),
    rlsEl("span", { class: "rls-src" }, " · ",
      rlsEl("a", { href: "https://www.last.fm/user/" + encodeURIComponent(RLS.settings.lastfmUser), target: "_blank" }, "Last.fm")));

  const albumLink = np.album
    ? rlsEl("a", { class: "album", href: rel ? rel.url : np.url, target: rel ? "_self" : "_blank" }, np.album)
    : null;
  const title = rlsEl("div", { class: "rls-title", title: np.artist + (np.album ? " – " + np.album : "") },
    rlsEl("span", { class: "rls-artist" }, np.artist),
    albumLink ? rlsEl("span", { class: "rls-sep" }, " - ") : null,
    albumLink);
  const track = rlsEl("div", { class: "rls-track", title: np.track }, np.track);

  const actions = rlsEl("div", { class: "rls-actions" });
  if (np.album) {
    if (RLS.addingLink) {
      const input = rlsEl("input", { type: "url", class: "rls-input", placeholder: "Paste RYM release URL" });
      const save = rlsEl("a", { class: "btn blue_btn btn_small", href: "#" }, "Save");
      const cancel = rlsEl("a", { class: "rls-textbtn", href: "#" }, "Cancel");
      save.onclick = (e) => { e.preventDefault(); rlsSaveLink(input.value); };
      input.onkeydown = (e) => { if (e.key === "Enter") rlsSaveLink(input.value); if (e.key === "Escape") { RLS.addingLink = false; rlsRender(); } };
      cancel.onclick = (e) => { e.preventDefault(); RLS.addingLink = false; rlsRender(); };
      actions.append(input, save, cancel);
      setTimeout(() => input.focus(), 0);
    } else if (rel) {
      const isCurrent = rlsCurrentRymAssocId() === rel.assocId;
      const setBtn = rlsEl("a", { class: "btn blue_btn btn_small" + (isCurrent || RLS.busy ? " rls-disabled" : ""), href: "#" },
        isCurrent ? "✓ Listening to" : RLS.busy ? "Setting…" : "Set listening");
      setBtn.onclick = (e) => { e.preventDefault(); if (!isCurrent && !RLS.busy) rlsSet(rel); };
      const open = rlsEl("a", { class: "rls-btn", href: rel.url }, "RYM page");
      const fix = rlsEl("a", { class: "rls-textbtn", href: "#", title: "Link a different RYM release" }, "Wrong?");
      fix.onclick = (e) => { e.preventDefault(); RLS.addingLink = true; rlsRender(); };
      actions.append(setBtn, open, fix);
    } else if (RLS.lookupKey === rlsAlbumKey(np)) {
      actions.append(rlsEl("span", { class: "rls-muted" }, "Looking up on RYM…"));
    } else if (RLS.resolvedKey !== rlsAlbumKey(np)) {
      // not checked yet (saved links load in a few ms): show nothing rather than flicker
    } else {
      const add = rlsEl("a", { class: "rls-btn", href: "#" }, "Add RYM link");
      add.onclick = (e) => { e.preventDefault(); RLS.addingLink = true; rlsRender(); };
      const search = rlsEl("a", { class: "rls-textbtn", href: rlsSearchUrl(np), target: "_blank" }, "Search RYM");
      actions.append(add, search);
    }
  }

  box.replaceChildren(
    coverEl,
    rlsEl("div", { class: "rls-info" }, label, title, track,
      RLS.message ? rlsEl("div", { class: "rls-msg" }, RLS.message) : null),
    actions);
}

/* ---------- actions ---------- */

async function rlsSet(rel) {
  RLS.busy = true; RLS.message = ""; rlsRender();
  try {
    await rlsSetListening(RLS.session, rel.assocId);
    await rlsRefreshRymEntry();
  } catch (e) {
    RLS.message = e.message;
  }
  RLS.busy = false; rlsRender();
}

async function rlsSaveLink(value) {
  const url = (value || "").trim().split("?")[0].split("#")[0];
  if (!/^https:\/\/rateyourmusic\.com\/release\//.test(url)) { RLS.message = "That's not a RYM release URL."; rlsRender(); return; }
  const key = rlsAlbumKey(RLS.np);
  try {
    const info = await rlsReleaseInfo(url);
    const { mappings } = await RLS_ENV.getLocal({ mappings: {} });
    mappings[key] = info;
    await RLS_ENV.setLocal({ mappings });
    RLS.release = info; RLS.releaseKey = key; RLS.resolvedKey = key; RLS.addingLink = false; RLS.message = "";
  } catch (e) {
    RLS.message = e.message;
  }
  rlsRender();
}

async function rlsResolveRelease(np) {
  const key = rlsAlbumKey(np);
  if (!key || key === RLS.releaseKey || key === RLS.lookupKey) return;
  RLS.release = null; RLS.releaseKey = null; RLS.addingLink = false; RLS.message = "";
  const { mappings, misses } = await RLS_ENV.getLocal({ mappings: {}, misses: {} });
  if (mappings[key]) { RLS.release = mappings[key]; RLS.releaseKey = key; RLS.resolvedKey = key; return; }
  if (misses[key] && Date.now() - misses[key] < 7 * 86400000) { RLS.resolvedKey = key; return; } // known miss: don't re-search for a week
  RLS.lookupKey = key; rlsRender();
  try {
    const info = await rlsFindRelease(np.artist, np.album);
    if (info) {
      mappings[key] = info;
      await RLS_ENV.setLocal({ mappings });
      if (rlsAlbumKey(RLS.np) === key) { RLS.release = info; RLS.releaseKey = key; }
    } else {
      misses[key] = Date.now();
      await RLS_ENV.setLocal({ misses });
    }
  } catch (_) { /* leave unresolved; manual link still possible */ }
  RLS.lookupKey = null;
  RLS.resolvedKey = key;
}

function rlsDomReady() {
  return new Promise((resolve) => {
    if (document.readyState !== "loading") resolve();
    else document.addEventListener("DOMContentLoaded", resolve, { once: true });
  });
}

async function rlsApplyData(data) {
  const np = rlsParseLatest(data);
  RLS.np = np;
  rlsRender();
  RLS_ENV.setLocal({ lastNp: { user: RLS.settings.lastfmUser, np, savedAt: Date.now() } });
  if (np) { await rlsResolveRelease(np); rlsRender(); }
}

async function rlsTick() {
  if (document.hidden) return;
  try { await rlsApplyData(await RLS_ENV.lastfmRecent(RLS.settings)); }
  catch (_) { /* Last.fm hiccup: keep showing the previous state */ }
}

/* ---------- main ---------- */

// Runs at document_start: the Last.fm request starts before the page has finished loading,
// and the last known state is drawn from cache the moment the profile card exists.
async function rlsMain() {
  const pm = location.pathname.match(/^\/~([^/]+)\/?$/);
  if (!pm) return;
  const pathUser = decodeURIComponent(pm[1]).toLowerCase();

  RLS.settings = await RLS_ENV.settings();
  if (!RLS.settings.lastfmUser) return;
  const { rymUser, lastNp } = await RLS_ENV.getLocal({ rymUser: "", lastNp: null });
  if (rymUser && rymUser !== pathUser) return; // someone else's profile

  const fresh = RLS_ENV.lastfmRecent(RLS.settings).catch(() => null);

  await rlsDomReady();
  RLS.session = rlsReadSession();
  if (!RLS.session) return; // logged out, or a challenge page
  const me = RLS.session.username.toLowerCase();
  if (me !== rymUser) RLS_ENV.setLocal({ rymUser: me });
  if (me !== pathUser) return;

  const entry = document.querySelector("#profile_play_history_container");
  if (!entry) return;
  document.getElementById("rls-np")?.remove();
  RLS.box = rlsEl("div", { id: "rls-np", hidden: true });
  entry.after(RLS.box);

  // Instant render from the last known state (a stale "now playing" is shown as "last played").
  if (lastNp && lastNp.np && lastNp.user === RLS.settings.lastfmUser) {
    const np = { ...lastNp.np };
    if (np.nowPlaying && Date.now() - lastNp.savedAt > 5 * 60000) {
      np.nowPlaying = false; np.uts = Math.floor(lastNp.savedAt / 1000);
    }
    RLS.np = np;
    rlsRender();
    rlsResolveRelease(np).then(rlsRender);
  }

  const data = await fresh;
  if (data) await rlsApplyData(data);

  setInterval(rlsTick, Math.max(15, RLS.settings.refreshSec || 30) * 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) rlsTick(); });
}

if (window.top === window && (window.RLS_TEST_ENV || (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id))) {
  rlsMain().catch(() => {});
}

const $ = (id) => document.getElementById(id);

function ago(ms) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return Math.round(s / 60) + " min ago";
  if (s < 86400) return Math.round(s / 3600) + " h ago";
  return Math.round(s / 86400) + " d ago";
}

async function load() {
  $("ver").textContent = "v" + chrome.runtime.getManifest().version;
  $("repoLink").href = RLS_CONFIG.repoUrl;

  const s = await chrome.storage.sync.get(RLS_DEFAULTS);
  $("lastfmUser").value = s.lastfmUser;
  $("refreshSec").value = String(s.refreshSec);

  const st = await chrome.storage.local.get({ rymUser: "", lastNp: null, mappings: {} });
  if (st.rymUser) {
    $("profileLink").href = "https://rateyourmusic.com/~" + encodeURIComponent(st.rymUser);
    $("profileLink").hidden = false;
  }
  const n = Object.keys(st.mappings).length;
  $("linkCount").textContent = n ? "(" + n + ")" : "";

  const last = st.lastNp;
  if (last && last.np && last.user === s.lastfmUser) {
    const np = last.np;
    const live = np.nowPlaying && Date.now() - last.savedAt < 5 * 60000;
    $("npLabel").textContent = live ? "Now playing" : "Last played · " + ago(np.uts ? np.uts * 1000 : last.savedAt);
    $("npLabel").classList.toggle("past", !live);
    $("npTitle").textContent = np.artist + (np.album ? " – " + np.album : "");
    $("npTitle").title = $("npTitle").textContent;
    if (np.cover) $("npCover").src = np.cover;
    $("np").hidden = false;
  }
}

let saveTimer;
function flashSaved() {
  $("saved").classList.add("show");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => $("saved").classList.remove("show"), 1500);
}

// Save while typing (debounced): a popup can close before a "change" event fires.
let typeTimer;
$("lastfmUser").addEventListener("input", () => {
  clearTimeout(typeTimer);
  typeTimer = setTimeout(async () => {
    const v = $("lastfmUser").value.trim();
    await chrome.storage.sync.set({ lastfmUser: v });
    await chrome.storage.local.set({ lastNp: null });
    $("np").hidden = true;
    flashSaved();
  }, 400);
});

$("refreshSec").addEventListener("change", async () => {
  await chrome.storage.sync.set({ refreshSec: parseInt($("refreshSec").value, 10) });
  flashSaved();
});

$("resetLinks").addEventListener("click", async (e) => {
  e.preventDefault();
  await chrome.storage.local.set({ mappings: {}, misses: {} });
  $("linkCount").textContent = "";
  $("resetLinks").firstChild.textContent = "Saved RYM links cleared ";
});

load();

// Shared configuration, loaded by the content script, background worker and popup.
const RLS_CONFIG = {
  // Last.fm API key used for all users (read-only calls: user.getRecentTracks).
  // Since 1 Dec 2026 Last.fm requires the key owner to have Last.fm Pro; users don't need it.
  apiKey: "755494485d45e76e5a74fa12cb49d7c7",
  repoUrl: "https://github.com/Idyllwilde/rym-now-playing-lastfm"
};

// Per-user settings (chrome.storage.sync) and their defaults.
const RLS_DEFAULTS = {
  lastfmUser: "",
  refreshSec: 30
};

// Fetches Last.fm data on behalf of the content script (keeps the request out of the RYM page context).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "lastfmRecent") {
    const url = "https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks" +
      "&user=" + encodeURIComponent(msg.user) +
      "&limit=" + encodeURIComponent(msg.limit || 2) +
      "&format=json&api_key=" + encodeURIComponent(msg.apiKey);
    fetch(url)
      .then((r) => r.json())
      .then((data) => sendResponse({ ok: !data.error, data, error: data.message }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true; // async response
  }
});

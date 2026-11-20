# RYM Now Playing (Last.fm)

A Chrome extension that shows what you're playing on Last.fm inside the **Listening to** card on your own RateYourMusic profile, with one click to set it as your RYM "listening to".

- Now playing (or last played) from Last.fm: cover, artist, album, track
- **Set listening**: adds the album to your RYM "Listening to" / play history
- **RYM page**: opens the album on RYM; **Wrong?** lets you link the correct release
- No match found: paste the RYM link once, it's remembered
- Only appears on your own profile; nothing changes on RYM unless you click **Set listening**

Not affiliated with RateYourMusic/Sonemic or Last.fm.

## Install

**Chrome Web Store:** _link once published_

**From source:**
1. Download or clone this repository.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the folder.
4. Click the extension icon and enter your Last.fm username.
5. Open your RYM profile while logged in.

## How it works

- The extension reads your recent Last.fm scrobbles (`user.getRecentTracks`) while your RYM profile is open (every 30 s by default, only while the tab is visible).
- It searches RYM for the matching release (preferring album > EP > mixtape > compilation > single) and caches the match locally.
- **Set listening** sends the same request RYM's own "Set listening" button on a release page sends, from your logged-in browser session. No passwords or RYM credentials are stored or sent anywhere.

## Privacy

See [PRIVACY.md](PRIVACY.md). In short: no analytics, no own server; your Last.fm username and cached matches are stored in your browser only.

## Development

Plain Manifest V3, no build step.

| File | Purpose |
|---|---|
| `config.js` | Last.fm API key, repository URL, default settings |
| `content.js` / `content.css` | The block on your RYM profile |
| `background.js` | Last.fm requests |
| `popup.*` | Toolbar popup (settings) |

## License

MIT

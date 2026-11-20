# Chrome Web Store listing (draft)

**Name:** RYM Now Playing (Last.fm)

**Summary (max 132 chars):**
Shows your Last.fm now playing on your RateYourMusic profile, with one click to set it as "listening to".

**Category:** Social & Communication (or: Fun / Entertainment)

**Description:**
See what you're playing on Last.fm right inside the "Listening to" card on your RateYourMusic profile, with cover art, artist, album and track.

• One click on "Set listening" adds the album to your RYM "Listening to".
• "RYM page" opens the album on RYM.
• If the release can't be matched automatically, paste its RYM link once and it's remembered.
• Only appears on your own profile. Nothing changes on RYM unless you click.

Setup: click the extension icon and enter your Last.fm username, then open your RYM profile while logged in.

Not affiliated with RateYourMusic/Sonemic or Last.fm. Open source: https://github.com/Idyllwilde/rym-now-playing-lastfm

## Single purpose
Show the user's Last.fm now-playing track on their own RateYourMusic profile and let them set it as their RYM "listening to".

## Permission justifications
- **storage**: saves the user's Last.fm username, refresh interval and cached RYM release matches.
- **Host permission ws.audioscrobbler.com**: fetches the user's recent tracks from the Last.fm API.
- **Content script on rateyourmusic.com/~***: draws the now-playing block on the user's own RYM profile page and performs release lookups / the "Set listening" request in the user's session.

## Remote code
No. All code is bundled in the package.

## Data usage (privacy tab)
- Collected: "Website content" / "User activity"? → The extension handles the user's Last.fm username and listening data only to display it locally; nothing is collected by the developer. Declare: no data sold, no data used for unrelated purposes, no creditworthiness use.
- Privacy policy URL: https://github.com/Idyllwilde/rym-now-playing-lastfm/blob/main/PRIVACY.md

## Assets needed
- Icon 128×128 (icons/icon128.png)
- At least 1 screenshot, 1280×800 or 640×400
- Optional small promo tile 440×280

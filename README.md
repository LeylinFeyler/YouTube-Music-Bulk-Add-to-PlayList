# YouTube Music Bulk Add to Playlist Pro

A Tampermonkey userscript for collecting songs from an artist's YouTube Music catalog and adding them to an existing playlist. It reads the artist's songs, albums, singles, and EPs, compares their track IDs with the destination playlist, and previews the new tracks before adding them.

The script runs inside your signed-in YouTube Music browser session. It requires no separate YouTube Data API key, Google Cloud project, local server, or build step. It uses YouTube Music's internal web endpoints, which may change without notice or impose request limits.

The current script version is **3.0.4**. The source filename still contains `2.0`; the `@version` field inside the file identifies the actual version. The script interface and its messages are currently in Ukrainian. English explanations of the controls are provided below.

## Requirements

Use a desktop browser with [Tampermonkey](https://www.tampermonkey.net/) installed and enabled. Sign in to [YouTube Music](https://music.youtube.com/) with an account or channel profile that can edit the destination playlist. If you use multiple profiles, select the correct one before collecting songs.

The script accepts ordinary playlist IDs beginning with `PL`, or YouTube and YouTube Music links containing such an ID. Special collections such as Liked Music and automatically generated mixes are not supported as destinations. Create a regular playlist in YouTube Music first; the script does not create one for you.

The script has been used successfully in Firefox with Tampermonkey during development. This is not a guarantee of compatibility with every browser, userscript manager, or YouTube Music layout.

## Installation

1. Install Tampermonkey for your browser using the browser-specific link on its [official website](https://www.tampermonkey.net/). Allow the extension to run on `music.youtube.com`.
2. Open [the userscript in this repository](<YouTube Music Bulk Add to Playlist Pro-2.0.user.js>). On GitHub, select **Raw** and copy the entire source, including the metadata block beginning with `// ==UserScript==` and the final `})();`.
3. Open the Tampermonkey dashboard and create a new script. Replace the entire editor template with the copied source, then save it using the editor's Save command or `Ctrl+S`. This follows Tampermonkey's [manual installation workflow](https://www.tampermonkey.net/faq.php?locale=en&q=Q102).
4. Check that the script is enabled in the dashboard. If an earlier copy is installed separately, disable it so that only one copy runs.
5. Open or reload `https://music.youtube.com/`. A red button labelled **ДОДАТИ ВСЕ В ПЛЕЙЛИСТ** should appear near the upper-right corner. Click it to open the panel. **Alt+Shift+P** also opens the panel when the script is running.

In Chromium-based browsers, userscript execution may require enabling **Allow User Scripts** in the extension's browser settings, or Developer Mode on older versions. See [Tampermonkey's execution-permission instructions](https://www.tampermonkey.net/faq.php?locale=en&q=Q209). This is separate from enabling the individual script in the dashboard.

No terminal commands are required to install or use the script. Cloning this repository alone does not install it into Tampermonkey.

## Using the script

### Select an artist and destination

Open the artist's main page in YouTube Music. Supported address formats include `/channel/UC…`, `/browse/UC…`, `/browse/MPLAUC…`, and `/@handle`, such as `https://music.youtube.com/@KingGnuOfficial`. The page must expose a music catalog; recognizing a channel URL does not mean that an ordinary video channel has albums or songs available to collect.

Open the script panel and paste your destination playlist link into its text field. A playlist ID beginning with `PL` is also accepted. **The field is initially populated with the author's playlist ID. Replace it with your own before collecting songs.** The destination is identified by its ID, not its title. Use the link below the status message to check which playlist is selected.

The destination field is not saved between page reloads. Check it again after refreshing the page. For an initial trial, use a separate test playlist that you can edit.

The other-editions checkbox is enabled by default. Leave it selected to follow the “Other versions” or “Other editions” sections of albums as well. Clear it to collect the artist's listed releases without that additional traversal.

### Collect and review

Click **1. Зібрати пісні** (Collect songs). The script resolves the artist ID, reads every returned page of the destination playlist, and collects tracks from the artist's catalog. You do not need to scroll the page or open the albums manually. Collection does not modify the playlist.

When collection finishes, the panel shows the artist, destination, total number of unique collected track IDs, number already present, and number of new tracks. The preview displays the first 100 new tracks. There are no individual selection controls: the Add button submits all new tracks in the collected result.

The JSON export contains the complete collected catalog, including tracks already present in the destination, along with artist and playlist IDs, release and skipped-row counts, and the activity log. It is not a backup of the destination playlist and cannot be imported by this script.

Changing the destination or the other-editions option clears the collected plan. Collect again after either change. To process another artist, open that artist's page and collect again; navigating to a different page does not automatically replace an existing plan.

### Add songs

Click **2. Додати N пісень** (Add N songs). Before writing, the script reads the destination again to exclude tracks added since collection. It submits the remaining tracks in batches of up to 25, checks the server's acknowledgements, and reads the playlist again to verify that the submitted IDs are present.

Keep the tab open and remain signed in while it runs. The final success message is shown only after verification. Open or refresh the destination playlist to see the changes. If no new tracks were found, the Add button remains disabled.

### Stop or recover from an interruption

Click **Зупинити** (Stop) to prevent further requests. An in-flight request is allowed to finish, so a batch already submitted may still be added. Stopping does not undo completed additions.

After an error, interruption, or page reload, return to the artist page, check the destination, and collect again. The new scan excludes IDs already present. A failed write is not retried automatically because the server may have accepted it even if the response was lost. Progress is not saved across reloads, and there is no automatic rollback.

### Interface reference

| Displayed control | Meaning |
| --- | --- |
| ДОДАТИ ВСЕ В ПЛЕЙЛИСТ | Open or close the bulk-add panel |
| Плейлист: посилання або ID | Destination playlist URL or ID |
| Також інші видання альбомів | Include other album editions |
| 1. Зібрати пісні | Collect songs and check for existing IDs |
| 2. Додати N пісень | Add the new tracks from the collected plan |
| Зупинити | Stop after the current request |
| Відкрити цільовий плейлист | Open the selected destination playlist |
| Зберегти список JSON | Download the collected catalog and log |
| Журнал | Expand the activity log |

## Catalog coverage and duplicate detection

The script reads structured JSON returned by YouTube Music rather than clicking visible menus. It locates the artist's Songs or Top songs section, follows its full-list link when available, and reads releases from Albums and Singles / EPs sections. It follows supported pagination links and requests the track list of each discovered release. Internal requests ask for English section labels; the language of the visible YouTube Music interface is not changed.

Tracks identified as audio songs are accepted. Tracks explicitly identified as music videos, user-uploaded videos, or podcast episodes are excluded, as are rows marked unavailable. Album tracks without a media-type field are accepted based on their placement in the album track list. The script does not inspect or compare audio recordings.

“Everything” means the tracks discoverable through these supported catalog sections for your account and region. Recommendations, radio, related artists, third-party playlists, and “Appears on” compilations are not traversed. Hidden or unavailable releases, guest appearances on other artists' albums, and changes in YouTube's response structure can leave gaps in the result.

Duplicate detection uses the exact YouTube track/video ID. An ID found in several releases is collected once, and an ID already present in the destination is excluded. Different IDs remain separate even when their titles or recordings are identical. Remasters, live recordings, alternate editions, and a music-video version of a song may therefore coexist. Existing duplicates in the destination are not removed.

Tracks are submitted in order of first discovery. The script does not sort existing entries or impose chronological album order. Their final placement also depends on the playlist's settings. Avoid running simultaneous additions to the same destination: the final pre-add scan is not a lock against edits from other tabs.

## Troubleshooting

### The button does not appear

Confirm that you are on `music.youtube.com`, that Tampermonkey is allowed to run there, and that the script is enabled. Reload the page after installation or an update. Try **Alt+Shift+P**. In Firefox, open the web console with **Ctrl+Shift+K** and look for `[YTM Bulk Add 3.0.4]` or an error referring to the userscript. The startup message indicates that panel initialization completed; it does not confirm that catalog requests will succeed.

### The artist cannot be recognized or no songs are found

Open the artist's main page through YouTube Music search and collect again. A watch page, album page, playlist page, or search-results page is not a supported starting point. A recognized channel may also lack the music sections expected by the parser.

### Playlist or session errors

Verify that the destination is a regular `PL…` playlist and that you can manually add a song to it using the current account or channel profile. For missing-session messages or HTTP 401/403 responses, check your sign-in state and editing permissions, then reload the page. A missing-configuration message means the script could not access the page's YouTube Music configuration.

Version 3.0.4 handles an empty playlist when its recognized track-list response omits the item array. Other response layouts can still fail. If an empty test playlist produces a missing-items error, adding one song manually and scanning again is a practical workaround observed during development.

### Rate limits, unexpected responses, or incomplete verification

For HTTP 429, stop and try again later. The script spaces requests approximately 900 milliseconds apart and uses a 45-second timeout, but these settings do not guarantee that YouTube will accept every request.

An unknown-list or continuation error means the parser could not reliably read the response. A failed acknowledgement or verification can occur after some tracks have already been added. Check the destination and collect again before another attempt.

When reporting a problem, include the script version, browser and Tampermonkey versions, artist URL, relevant log text, and whether the destination was empty. Do not include cookies or Authorization headers. Review exported JSON before sharing it: it contains playlist and artist IDs, song information, and log entries.

## Updates and local development

To update a manually installed copy, open the existing script in the Tampermonkey editor, replace its entire source with the updated repository file, save, and reload YouTube Music. Editing or pulling the file in a local Git checkout does not update the browser's installed copy. The script currently declares no explicit `@updateURL` or `@downloadURL`.

There are no runtime packages to install or assets to build. If Node.js is available, run a syntax check from the repository directory:

```sh
node --check 'YouTube Music Bulk Add to Playlist Pro-2.0.user.js'
```

A syntax check does not verify live YouTube Music compatibility. This repository currently does not include the development test suite.

## Session data and implementation

Requests go to `/youtubei/v1/` on `music.youtube.com` using the current browser session. The script reads session cookies locally to construct its authentication header. It does not send data to a separate service or include authentication credentials in its JSON export. Collection results and the log are held in memory until the page is reloaded, unless you download an export.

The implementation uses internal endpoints rather than the public YouTube Data API. It reuses configuration supplied by the page, including its client key when available; users do not need to supply a separate key. Endpoint and response formats were checked against [ytmusicapi](https://github.com/sigma67/ytmusicapi) and [YouTube.js](https://github.com/LuanRT/YouTube.js). Neither library is a runtime dependency. This is an independent project and is not affiliated with YouTube or Google.

## License

[MIT](LICENSE). Copyright (c) 2026 Geronimo.

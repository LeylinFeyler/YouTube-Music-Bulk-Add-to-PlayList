// ==UserScript==
// @name         YouTube Music Bulk Add to Playlist Pro
// @namespace    http://tampermonkey.net/
// @version      3.1.0
// @description  Collect artist songs, albums and singles, check duplicates, and add them to a playlist.
// @description:uk Збирає пісні, альбоми й сингли виконавця, перевіряє дублікати та додає до плейлиста.
// @author       Geronimo
// @match        https://music.youtube.com/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const LANGUAGE_KEY = 'ytm-bulk-add-language';
    let language = 'en';
    try {
        const saved = globalThis.localStorage?.getItem(LANGUAGE_KEY);
        if (saved === 'uk' || saved === 'en') language = saved;
    } catch { /* Storage can be unavailable; keep the in-memory preference. */ }
    const MESSAGES = {
    "noStatus": {
        "en": "no status",
        "uk": "без статусу"
    },
    "rateLimit": {
        "en": ": too many requests; try again later",
        "uk": ": забагато запитів; спробуй пізніше"
    },
    "previewMore": {
        "en": "Showing the first 100; export JSON for the full list.",
        "uk": "Нижче перші 100; повний список — у JSON."
    },
    "previewReview": {
        "en": "Review the list, then click Add.",
        "uk": "Переглянь список і натисни «Додати»."
    },
    "pageFormat": {
        "uk": "Невідомий формат сторінки YouTube Music. Збирання припинено.",
        "en": "Unknown YouTube Music page format. Collection stopped."
    },
    "trackListMissing": {
        "uk": "Не знайдено список треків. Не можна надійно перевірити весь плейлист / альбом.",
        "en": "Track list not found. The full playlist / album cannot be checked reliably."
    },
    "nextPageFormat": {
        "uk": "Невідомий формат наступної сторінки. Список може бути неповним.",
        "en": "Unknown next-page format. The list may be incomplete."
    },
    "paginationFormat": {
        "uk": "Нерозпізнана пагінація. Список може бути неповним.",
        "en": "Unrecognized pagination. The list may be incomplete."
    },
    "continuationMissing": {
        "uk": "YouTube Music не повернув очікуване продовження списку. Збирання припинено.",
        "en": "YouTube Music did not return the expected next page. Collection stopped."
    },
    "itemsMissing": {
        "uk": "Невідомий формат списку: відсутні елементи.",
        "en": "Unknown list format: items are missing."
    },
    "repeatedPage": {
        "uk": "YouTube повторив сторінку. Повноту списку не підтверджено.",
        "en": "YouTube repeated a page. List completeness could not be confirmed."
    },
    "playlistLink": {
        "uk": "Потрібне посилання на плейлист YouTube.",
        "en": "Enter a YouTube playlist link."
    },
    "playlistId": {
        "uk": "Вкажи ID звичайного плейлиста (PL…) або посилання на нього.",
        "en": "Enter a regular playlist ID (PL…) or its URL."
    },
    "artistUrl": {
        "uk": "Не розпізнано адресу виконавця: {0}. Відкрий сторінку /@ім’я або /channel/UC…",
        "en": "Unrecognized artist URL: {0}. Open an /@handle or /channel/UC… page."
    },
    "artistIdMissing": {
        "uk": "YouTube Music не повернув ID виконавця для {0}. Спробуй відкрити виконавця через пошук YouTube Music.",
        "en": "YouTube Music did not return an artist ID for {0}. Try opening the artist through YouTube Music search."
    },
    "addNotConfirmed": {
        "uk": "YouTube не підтвердив додавання ({0}).",
        "en": "YouTube did not confirm the addition ({0})."
    },
    "partialBatch": {
        "uk": "Відповідь не підтвердила всі треки пакета. Частину могло бути додано.",
        "en": "The response did not confirm every track in the batch. Some may have been added."
    },
    "stopped": {
        "uk": "Зупинено користувачем.",
        "en": "Stopped by the user."
    },
    "accountChanged": {
        "uk": "Акаунт змінився. Збери список заново.",
        "en": "The account changed. Collect songs again."
    },
    "noSession": {
        "uk": "Не знайдено авторизовану сесію. Увійди в YouTube Music і перезавантаж сторінку.",
        "en": "No signed-in session found. Sign in to YouTube Music and reload the page."
    },
    "noConfig": {
        "uk": "Немає конфігурації YouTube Music. Перезавантаж сторінку; скрипт має виконуватися в контексті сторінки.",
        "en": "YouTube Music configuration is unavailable. Reload the page; the script must run in the page context."
    },
    "httpError": {
        "uk": "HTTP {0}{1}",
        "en": "HTTP {0}{1}"
    },
    "uncertainWrite": {
        "uk": "{0}. Результат останнього пакета невідомий. Збери список заново перед повтором.",
        "en": "{0}. The last batch outcome is unknown. Collect songs again before retrying."
    },
    "readPlaylist": {
        "uk": "Читаю цільовий плейлист: {0}.",
        "en": "Reading destination playlist: {0}."
    },
    "playlistTrackError": {
        "uk": "Не вдалося прочитати один із треків плейлиста. Перевірку дублікатів припинено.",
        "en": "Could not read a playlist track. Duplicate checking stopped."
    },
    "playlistProgress": {
        "uk": "Перевіряю плейлист: прочитано {0} треків…",
        "en": "Checking playlist: {0} tracks read…"
    },
    "readArtist": {
        "uk": "Читаю каталог виконавця: {0}.",
        "en": "Reading artist catalog: {0}."
    },
    "releaseProgress": {
        "uk": "Збираю всі релізи {0}…",
        "en": "Collecting all releases by {0}…"
    },
    "releasesMissing": {
        "uk": "Не розпізнано повний список релізів. Додавання не починалося.",
        "en": "The full release list was not recognized. No additions have started."
    },
    "albumProgress": {
        "uk": "Реліз {0}/{1}: {2}. Пісень: {3}",
        "en": "Release {0}/{1}: {2}. Songs: {3}"
    },
    "noSongs": {
        "uk": "Не знайдено пісень. Відкрий головну сторінку виконавця, а не звичайний канал чи список відео. Можливо, формат сайту змінився.",
        "en": "No songs found. Open the artist's main page, not a regular channel or video list. The site format may have changed."
    },
    "collectionSummary": {
        "uk": "{0}: релізів {1}, унікальних ID пісень {2}, пропущених відео / недоступних рядків {3}.",
        "en": "{0}: releases {1}, unique song IDs {2}, skipped video / unavailable rows {3}."
    },
    "toggle": {
        "uk": "ДОДАТИ ВСЕ В ПЛЕЙЛИСТ",
        "en": "ADD ALL TO PLAYLIST"
    },
    "heading": {
        "uk": "Усі пісні виконавця",
        "en": "All songs by an artist"
    },
    "intro": {
        "uk": "Відкрий головну сторінку виконавця. Скрипт збере пісні, альбоми та сингли / EP.",
        "en": "Open the artist's main page. The script collects songs, albums, singles and EPs."
    },
    "targetLabel": {
        "uk": "Плейлист: посилання або ID",
        "en": "Playlist URL or ID"
    },
    "versionsLabel": {
        "uk": " Також інші видання альбомів",
        "en": " Include other album editions"
    },
    "duplicatesNote": {
        "uk": "Дублікати перевіряються за ID. Ремастери й різні записи однієї пісні можуть мати різні ID.",
        "en": "Duplicates are checked by ID. Remasters and different recordings may have different IDs."
    },
    "scan": {
        "uk": "1. Зібрати пісні",
        "en": "1. Collect songs"
    },
    "add": {
        "uk": "2. Додати",
        "en": "2. Add"
    },
    "stop": {
        "uk": "Зупинити",
        "en": "Stop"
    },
    "ready": {
        "uk": "Готово до збирання.",
        "en": "Ready to collect."
    },
    "openPlaylist": {
        "uk": "Відкрити цільовий плейлист",
        "en": "Open destination playlist"
    },
    "export": {
        "uk": "Зберегти список JSON",
        "en": "Export song list as JSON"
    },
    "log": {
        "uk": "Журнал",
        "en": "Activity log"
    },
    "runError": {
        "uk": "{0}\nПідтверджено доданих у цьому запуску: {1}. Перед повтором натисни «Зібрати пісні».",
        "en": "{0}\nConfirmed additions in this run: {1}. Click Collect songs before retrying."
    },
    "stopping": {
        "uk": "Зупиняю після поточного запиту. Уже надіслане додавання може завершитися.",
        "en": "Stopping after the current request. An addition already sent may still complete."
    },
    "resolving": {
        "uk": "Визначаю виконавця…",
        "en": "Resolving artist…"
    },
    "collectionStart": {
        "uk": "Початок збирання: {0}.",
        "en": "Starting collection: {0}."
    },
    "addCount": {
        "uk": "2. Додати {0} пісень",
        "en": "2. Add songs: {0}"
    },
    "preview": {
        "uk": "{0}\nПлейлист: {1}\nЗнайдено: {2}; уже є: {3}; нових: {4}.\n{5}",
        "en": "{0}\nPlaylist: {1}\nFound: {2}; already present: {3}; new: {4}.\n{5}"
    },
    "readyToAdd": {
        "uk": "Готово до додавання {0} пісень у {1}.",
        "en": "Ready to add {0} songs to {1}."
    },
    "adding": {
        "uk": "Додаю до «{0}»: {1}/{2}…",
        "en": "Adding to “{0}”: {1}/{2}…"
    },
    "confirmed": {
        "uk": "Підтверджено {0}/{1}.",
        "en": "Confirmed {0}/{1}."
    },
    "verificationMissing": {
        "uk": "Під час повторної перевірки не знайдено {0} треків. Оновлення може ще оброблятися.",
        "en": "Verification could not find {0} tracks. The update may still be processing."
    },
    "finished": {
        "uk": "Готово! Додано й перевірено: {0}. Уже були перед додаванням: {1}.\nОнови сторінку цільового плейлиста, щоб побачити зміни.",
        "en": "Done! Added and verified: {0}. Already present before adding: {1}.\nRefresh the destination playlist to see the changes."
    },
    "verified": {
        "uk": "Повторна перевірка плейлиста завершена.",
        "en": "Playlist verification completed."
    },
    "startup": {
        "uk": "[YTM Bulk Add 3.1.0] Панель запущено. Alt+Shift+P відкриває її.",
        "en": "[YTM Bulk Add 3.1.0] Panel initialized. Alt+Shift+P opens it."
    }
};
    function t(key, ...args) { return { key, args }; }
    function render(message) {
        if (!message || typeof message !== 'object' || !Object.hasOwn(MESSAGES, message.key)) return String(message ?? '');
        return MESSAGES[message.key][language].replace(/\{(\d+)\}/g, (_, index) => render(message.args[Number(index)]));
    }
    class LocalizedError extends Error {
        constructor(detail) { super(render(detail)); this.detail = detail; }
    }
    function errorDetail(error) { return error.detail ?? error.message ?? String(error); }

    const DEFAULT_PLAYLIST = 'PLlsCQDB_ve7YB19JET-pc0TN255DYOId0';
    const BATCH_SIZE = 25;
    const REQUEST_DELAY = 900;
    const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const textOf = value => value?.simpleText || (value?.runs || []).map(run => run.text || '').join('');

    // Search only inside the explicitly supplied renderer, never the entire page DOM.
    function values(root, key) {
        const found = [];
        function visit(node) {
            if (!node || typeof node !== 'object') return;
            if (Object.hasOwn(node, key)) found.push(node[key]);
            for (const value of Object.values(node)) visit(value);
        }
        visit(root);
        return found;
    }

    function endpointOf(root) {
        return values(root, 'browseEndpoint').find(endpoint => endpoint.browseId);
    }

    function releaseOf(item) {
        const card = item.musicTwoRowItemRenderer || item.musicResponsiveListItemRenderer;
        if (!card) return null;
        const endpoint = endpointOf(card.navigationEndpoint) || endpointOf(card.title);
        if (!endpoint || !(endpoint.browseId.startsWith('MPRE') ||
            endpoint.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType === 'MUSIC_PAGE_TYPE_ALBUM')) return null;
        return { browseId: endpoint.browseId, title: textOf(card.title) || endpoint.browseId };
    }

    function songOf(item, album = false, includeUnavailable = false) {
        const row = item.musicResponsiveListItemRenderer || item.musicTwoRowItemRenderer;
        if (!row) return null;
        const titleNode = row.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text || row.title;
        const watch = row.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint
            || row.navigationEndpoint?.watchEndpoint || values(titleNode, 'watchEndpoint')[0];
        const id = row.playlistItemData?.videoId || watch?.videoId;
        if (!VIDEO_ID.test(id || '')) return null;
        const type = watch?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType;
        const unavailable = row.musicItemRendererDisplayPolicy === 'MUSIC_ITEM_RENDERER_DISPLAY_POLICY_GREY_OUT';
        // Never infer "song" from a video title. Unknown types are accepted only on album track lists.
        const isSong = type === 'MUSIC_VIDEO_TYPE_ATV' || (!type && album);
        if (!includeUnavailable && (unavailable || !isSong)) return null;
        return { id, title: textOf(titleNode) || id, type: type || 'unknown' };
    }

    function sectionsOf(response) {
        const contents = response.contents;
        const layout = contents?.singleColumnBrowseResultsRenderer || contents?.twoColumnBrowseResultsRenderer;
        if (!layout) throw new LocalizedError(t('pageFormat'));
        const tab = layout.tabs?.find(tab => tab.tabRenderer?.selected)?.tabRenderer || layout.tabs?.[0]?.tabRenderer;
        return [...(tab?.content?.sectionListRenderer?.contents || []),
            ...(layout.secondaryContents?.sectionListRenderer?.contents || [])];
    }

    function trackShelf(response, album = false) {
        const sections = sectionsOf(response);
        const shelf = sections.map(section => section.musicPlaylistShelfRenderer).find(Boolean)
            || (album && sections.map(section => section.musicShelfRenderer).find(Boolean));
        if (!shelf) throw new LocalizedError(t('trackListMissing'));
        // An empty playlist can omit contents entirely. Only normalize a recognized
        // playlist shelf on the initial page; malformed continuation pages still fail.
        if (sections.some(section => section.musicPlaylistShelfRenderer === shelf) &&
            !Object.hasOwn(shelf, 'contents') && !Object.hasOwn(shelf, 'items') && !nextPage(shelf)) {
            return { ...shelf, contents: [] };
        }
        return shelf;
    }

    function nextPage(container) {
        const legacy = container.continuations?.find(item => item.nextContinuationData)?.nextContinuationData?.continuation;
        if (legacy) return { token: legacy, legacy: true };
        for (const item of container.contents || container.items || []) {
            if (!item.continuationItemRenderer) continue;
            const commands = values(item.continuationItemRenderer, 'continuationCommand');
            const command = commands.find(command => command.token &&
                (!command.request || command.request === 'CONTINUATION_REQUEST_TYPE_BROWSE'));
            if (!command) throw new LocalizedError(t('nextPageFormat'));
            return { token: command.token, legacy: false };
        }
        if (container.continuations?.length) throw new LocalizedError(t('paginationFormat'));
        return null;
    }

    function continuationContainer(response) {
        for (const key of ['musicPlaylistShelfContinuation', 'musicShelfContinuation', 'gridContinuation', 'musicCarouselShelfContinuation']) {
            if (response.continuationContents?.[key]) return response.continuationContents[key];
        }
        const actions = [...(response.onResponseReceivedActions || []), ...(response.onResponseReceivedEndpoints || [])];
        const append = actions.map(action => action.appendContinuationItemsAction).find(Boolean);
        if (append && Array.isArray(append.continuationItems)) return { contents: append.continuationItems };
        throw new LocalizedError(t('continuationMissing'));
    }

    async function readPages(first, body, api, consume, check = () => {}) {
        let container = first;
        const seen = new Set();
        while (true) {
            check();
            const items = container.contents || container.items;
            if (!Array.isArray(items)) throw new LocalizedError(t('itemsMissing'));
            consume(items);
            const next = nextPage(container);
            if (!next) return;
            if (seen.has(next.token)) throw new LocalizedError(t('repeatedPage'));
            seen.add(next.token);
            check();
            const response = await api('browse', next.legacy ? body : { continuation: next.token }, next.legacy ? next.token : undefined);
            container = continuationContainer(response);
        }
    }

    function parsePlaylist(value) {
        const input = value.trim();
        let id = input;
        if (/^https?:\/\//i.test(input)) {
            const url = new URL(input);
            if (!['music.youtube.com', 'www.youtube.com', 'youtube.com'].includes(url.hostname)) throw new LocalizedError(t('playlistLink'));
            id = url.searchParams.get('list') || '';
        }
        if (!/^PL[A-Za-z0-9_-]+$/.test(id)) throw new LocalizedError(t('playlistId'));
        return id;
    }

    function artistFromUrl(value) {
        const url = new URL(value);
        if (url.hostname !== 'music.youtube.com') return null;
        // Query parameters select views/tracking; they do not invalidate the artist ID.
        // MPLA is a music artist wrapper around a UC browse ID.
        const match = decodeURIComponent(url.pathname).match(/^\/(?:channel|browse)\/(?:MPLA)?(UC[A-Za-z0-9_-]+)\/?$/);
        return match?.[1] || null;
    }

    async function resolveArtist(value, api) {
        const direct = artistFromUrl(value);
        if (direct) return direct;
        const url = new URL(value);
        if (url.hostname !== 'music.youtube.com' || !/^\/@[^/]+\/?$/.test(url.pathname)) {
            throw new LocalizedError(t('artistUrl', url.pathname));
        }
        url.search = '';
        url.hash = '';
        const response = await api('navigation/resolve_url', { url: url.href });
        const id = response.endpoint?.browseEndpoint?.browseId;
        if (typeof id !== 'string' || !/^(?:MPLA)?UC[A-Za-z0-9_-]+$/.test(id)) {
            throw new LocalizedError(t('artistIdMissing', url.pathname));
        }
        return id.replace(/^MPLA/, '');
    }

    function addedIds(response, expected) {
        if (response.status !== 'STATUS_SUCCEEDED') throw new LocalizedError(t('addNotConfirmed', response.status || t('noStatus')));
        const confirmed = new Set((response.playlistEditResults || []).map(result => result.playlistEditVideoAddedResultData?.videoId).filter(Boolean));
        if (expected.some(id => !confirmed.has(id))) throw new LocalizedError(t('partialBatch'));
        return confirmed;
    }

    // Pure helpers can be exercised with Node; no account or browser writes during tests.
    if (typeof document === 'undefined') {
        if (typeof module !== 'undefined') module.exports = { values, releaseOf, songOf, sectionsOf, trackShelf, nextPage, continuationContainer, readPages, parsePlaylist, artistFromUrl, resolveArtist, addedIds };
        return;
    }
    if (window.top !== window.self || document.getElementById('ytm-bulk-add-pro')) return;

    const state = { busy: false, stop: false, plan: null, logs: [], confirmed: 0 };
    function check() { if (state.stop) throw new LocalizedError(t('stopped')); }
    function config(key) { return window.ytcfg?.get?.(key) ?? window.ytcfg?.data_?.[key]; }
    function identity() {
        return JSON.stringify([config('SESSION_INDEX') ?? '0', config('DELEGATED_SESSION_ID') || '', config('DATASYNC_ID') || '']);
    }
    function assertIdentity(expected) {
        if (identity() !== expected) throw new LocalizedError(t('accountChanged'));
    }

    async function authorization() {
        const cookies = new Map(document.cookie.split(';').map(part => {
            const index = part.indexOf('=');
            return [part.slice(0, index).trim(), part.slice(index + 1)];
        }));
        const secret = cookies.get('SAPISID') || cookies.get('__Secure-3PAPISID') || cookies.get('__Secure-1PAPISID');
        if (!secret) throw new LocalizedError(t('noSession'));
        const timestamp = Math.floor(Date.now() / 1000);
        const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`${timestamp} ${secret} ${location.origin}`));
        const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        return `SAPISIDHASH ${timestamp}_${hash}`;
    }

    function makeApi(account) {
        let lastRequest = 0;
        return async function api(endpoint, body, continuation) {
            check();
            assertIdentity(account);
            await sleep(Math.max(0, REQUEST_DELAY - (Date.now() - lastRequest)));
            check();
            const sourceContext = config('INNERTUBE_CONTEXT');
            if (!sourceContext?.client?.clientVersion) throw new LocalizedError(t('noConfig'));
            const context = JSON.parse(JSON.stringify(sourceContext));
            // Stable section names for parsing; the website's displayed language stays unchanged.
            context.client.hl = 'en';
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': await authorization(),
                'X-Origin': location.origin,
                'X-Goog-AuthUser': String(config('SESSION_INDEX') ?? '0'),
                'X-Youtube-Client-Name': String(config('INNERTUBE_CONTEXT_CLIENT_NAME') || 67),
                'X-Youtube-Client-Version': context.client.clientVersion,
            };
            if (config('DELEGATED_SESSION_ID')) headers['X-Goog-PageId'] = config('DELEGATED_SESSION_ID');
            if (context.client.visitorData) headers['X-Goog-Visitor-Id'] = context.client.visitorData;
            const url = new URL(`/youtubei/v1/${endpoint}`, location.origin);
            url.searchParams.set('prettyPrint', 'false');
            if (config('INNERTUBE_API_KEY')) url.searchParams.set('key', config('INNERTUBE_API_KEY'));
            if (continuation) {
                url.searchParams.set('ctoken', continuation);
                url.searchParams.set('continuation', continuation);
            }
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 45000);
            lastRequest = Date.now();
            try {
                // Never retry a write automatically: a lost response may still mean a successful write.
                assertIdentity(account);
                check();
                const response = await fetch(url, {
                    method: 'POST', credentials: 'same-origin', headers,
                    body: JSON.stringify({ context, ...body }), signal: controller.signal,
                });
                if (!response.ok) throw new LocalizedError(t('httpError', response.status, response.status === 429 ? t('rateLimit') : ''));
                const result = await response.json();
                if (result.error) throw new LocalizedError(`YouTube: ${result.error.message || result.error.code}`);
                return result;
            } catch (error) {
                if (endpoint === 'browse/edit_playlist') throw new LocalizedError(t('uncertainWrite', errorDetail(error)));
                throw error;
            } finally { clearTimeout(timeout); }
        };
    }

    async function playlistTracks(id, api) {
        log(t('readPlaylist', id));
        const body = { browseId: `VL${id}` };
        const response = await api('browse', body);
        const shelf = trackShelf(response);
        const tracks = new Set();
        await readPages(shelf, body, api, items => {
            for (const item of items) {
                const track = songOf(item, false, true);
                if (track) tracks.add(track.id);
                else if (item.musicResponsiveListItemRenderer && !item.musicResponsiveListItemRenderer.playlistItemData?.videoId) {
                    // Unavailable/deleted rows can legitimately lack an ID; they cannot match a new playable track.
                    const row = item.musicResponsiveListItemRenderer;
                    if (row.musicItemRendererDisplayPolicy !== 'MUSIC_ITEM_RENDERER_DISPLAY_POLICY_GREY_OUT') {
                        throw new LocalizedError(t('playlistTrackError'));
                    }
                }
            }
            status(t('playlistProgress', tracks.size));
        }, check);
        const title = values(response.header, 'title').map(textOf).find(Boolean)
            || values(sectionsOf(response), 'musicResponsiveHeaderRenderer').map(header => textOf(header.title)).find(Boolean) || id;
        return { tracks, title };
    }

    async function collectArtist(browseId, api, includeVersions) {
        log(t('readArtist', browseId));
        const songs = new Map();
        const releases = new Map();
        let skipped = 0;
        function consumeSongs(items, album = false) {
            for (const item of items) {
                const song = songOf(item, album);
                if (song) songs.set(song.id, song);
                else if (item.musicResponsiveListItemRenderer || item.musicTwoRowItemRenderer) skipped++;
            }
        }
        function consumeReleases(items) {
            for (const item of items) {
                const release = releaseOf(item);
                if (release) releases.set(release.browseId, release);
            }
        }
        const artist = await api('browse', { browseId });
        const name = textOf(artist.header?.musicImmersiveHeaderRenderer?.title)
            || textOf(artist.header?.musicVisualHeaderRenderer?.title) || browseId;
        const sections = sectionsOf(artist);
        const catalogs = new Map();
        for (const section of sections) {
            const shelf = section.musicShelfRenderer || section.musicCarouselShelfRenderer;
            if (!shelf) continue;
            const header = shelf.header?.musicCarouselShelfBasicHeaderRenderer;
            const title = textOf(header?.title || shelf.title).toLowerCase();
            if (/^(albums|singles|eps|singles & eps|singles and eps)$/.test(title)) {
                consumeReleases(shelf.contents || []);
                const endpoint = endpointOf(header?.moreContentButton) || endpointOf(header?.title);
                if (endpoint) catalogs.set(JSON.stringify([endpoint.browseId, endpoint.params]), endpoint);
                await readPages(shelf, { browseId }, api, consumeReleases, check);
            } else if (/^(songs|top songs)$/.test(title)) {
                await readPages(shelf, { browseId }, api, items => consumeSongs(items), check);
                const endpoint = endpointOf(shelf.bottomEndpoint) || endpointOf(shelf.bottomText)
                    || endpointOf(header?.moreContentButton) || endpointOf(header?.title) || endpointOf(shelf.title);
                if (endpoint) {
                    const body = { browseId: endpoint.browseId, ...(endpoint.params ? { params: endpoint.params } : {}) };
                    const allSongs = await api('browse', body);
                    await readPages(trackShelf(allSongs, true), body, api, items => consumeSongs(items), check);
                }
            }
        }
        for (const endpoint of catalogs.values()) {
            status(t('releaseProgress', name));
            const body = { browseId: endpoint.browseId, ...(endpoint.params ? { params: endpoint.params } : {}) };
            const response = await api('browse', body);
            const grids = sectionsOf(response).map(section => section.gridRenderer || section.musicCarouselShelfRenderer).filter(Boolean);
            if (!grids.length) throw new LocalizedError(t('releasesMissing'));
            for (const grid of grids) await readPages(grid, body, api, consumeReleases, check);
        }
        let completed = 0;
        // Map iteration also visits newly discovered alternate editions, once per browseId.
        for (const release of releases.values()) {
            check();
            status(t('albumProgress', ++completed, releases.size, release.title, songs.size));
            const body = { browseId: release.browseId };
            const response = await api('browse', body);
            await readPages(trackShelf(response, true), body, api, items => consumeSongs(items, true), check);
            if (includeVersions) {
                for (const section of sectionsOf(response)) {
                    const carousel = section.musicCarouselShelfRenderer;
                    const title = textOf(carousel?.header?.musicCarouselShelfBasicHeaderRenderer?.title).toLowerCase();
                    if (/^(other versions|other editions)$/.test(title)) {
                        await readPages(carousel, body, api, consumeReleases, check);
                    }
                }
            }
        }
        if (!songs.size) throw new LocalizedError(t('noSongs'));
        log(t('collectionSummary', name, completed, songs.size, skipped));
        return { name, songs: [...songs.values()], releaseCount: completed, skipped };
    }

    const host = document.createElement('div');
    host.id = 'ytm-bulk-add-pro';
    const bindings = new Map();
    const root = host.attachShadow({ mode: 'open' });
    // Build DOM directly: innerHTML can be blocked by the site's Trusted Types policy.
    function element(tag, attributes = {}, text = '', parent = root) {
        const node = document.createElement(tag);
        for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
        if (text && typeof text === 'object') {
            const label = document.createTextNode(render(text));
            node.append(label);
            bindings.set(label, text);
        } else node.textContent = text;
        parent.append(node);
        return node;
    }
    element('style', {}, `
            :host { position:fixed; right:18px; top:78px; z-index:10000; font:14px/1.45 system-ui,sans-serif; color:#eee; }
            * { box-sizing:border-box; }
            button { font:inherit; cursor:pointer; border:0; border-radius:7px; padding:9px 12px; background:#e83d52; color:white; }
            button:disabled { opacity:.45; cursor:default; }
            .secondary { background:#414149; }
            #panel { width:min(420px,calc(100vw - 36px)); max-height:calc(100vh - 170px); overflow:auto; background:#202024; border:1px solid #555; border-radius:12px; padding:14px; box-shadow:0 8px 32px #0009; }
            [hidden] { display:none !important; }
            h3 { margin:0 0 10px; font-size:16px; }
            p { margin:8px 0; }
            label { display:block; margin:10px 0; }
            input[type=text] { width:100%; margin-top:5px; padding:8px; background:#101014; color:white; border:1px solid #777; border-radius:5px; font:inherit; }
            a { color:#9ecbff; } .row { display:flex; gap:8px; flex-wrap:wrap; margin:10px 0; }
            #status { white-space:pre-wrap; overflow-wrap:anywhere; } #preview { max-height:180px; overflow:auto; padding-left:24px; }
            #log { white-space:pre-wrap; overflow-wrap:anywhere; max-height:160px; overflow:auto; font-size:12px; }
            select { margin-left:8px; padding:6px; background:#101014; color:white; border:1px solid #777; border-radius:5px; }
            small { color:#ccc; }
        `);
    element('button', { id: 'toggle', type: 'button' }, t('toggle'));
    const panel = element('section', { id: 'panel', hidden: '' });
    element('h3', {}, t('heading'), panel);
    const languageLabel = element('label', {}, 'Language / Мова', panel);
    const languageSelect = element('select', { id: 'language', 'aria-label': 'Language / Мова' }, '', languageLabel);
    element('option', { value: 'en' }, 'English', languageSelect);
    element('option', { value: 'uk' }, 'Українська', languageSelect);
    element('p', {}, t('intro'), panel);
    const targetLabel = element('label', {}, t('targetLabel'), panel);
    element('input', { id: 'target', type: 'text', spellcheck: 'false' }, '', targetLabel);
    const versionsLabel = element('label', {}, '', panel);
    element('input', { id: 'versions', type: 'checkbox', checked: '' }, '', versionsLabel);
    element('span', {}, t('versionsLabel'), versionsLabel);
    element('small', {}, t('duplicatesNote'), panel);
    const actions = element('div', { class: 'row' }, '', panel);
    element('button', { id: 'scan', type: 'button' }, t('scan'), actions);
    element('button', { id: 'add', type: 'button', disabled: '' }, t('add'), actions);
    element('button', { id: 'stop', type: 'button', class: 'secondary', disabled: '' }, t('stop'), actions);
    element('p', { id: 'status', role: 'status', 'aria-live': 'polite' }, t('ready'), panel);
    element('a', { id: 'playlist', target: '_blank', rel: 'noopener' }, t('openPlaylist'), panel);
    element('ol', { id: 'preview' }, '', panel);
    const exports = element('div', { class: 'row' }, '', panel);
    element('button', { id: 'export', type: 'button', class: 'secondary', disabled: '' }, t('export'), exports);
    const details = element('details', {}, '', panel);
    element('summary', {}, t('log'), details);
    element('pre', { id: 'log' }, '', details);
    function mount() {
        if (!host.isConnected) (document.body || document.documentElement).append(host);
        // Host styles must win over page-wide rules on ordinary div elements.
        for (const [key, value] of Object.entries({
            display: 'block', position: 'fixed', top: '78px', right: '18px',
            bottom: 'auto', left: 'auto', width: 'max-content', height: 'auto',
            'z-index': '2147483647', visibility: 'visible', opacity: '1',
            'pointer-events': 'auto', transform: 'none', margin: '0', padding: '0',
        })) host.style.setProperty(key, value, 'important');
    }
    const $ = id => root.getElementById(id);
    $('target').value = DEFAULT_PLAYLIST;
    function setText(node, message) {
        bindings.set(node, message);
        node.textContent = render(message);
    }
    function status(message) { setText($('status'), message); }
    function formattedLogs() {
        return state.logs.map(entry => `${entry.time.toLocaleTimeString(language === 'uk' ? 'uk-UA' : 'en-US')} ${render(entry.message)}`);
    }
    function refreshLanguage() {
        host.setAttribute('lang', language);
        for (const [node, message] of bindings) node.textContent = render(message);
        $('log').textContent = formattedLogs().join('\n');
    }
    $('language').value = language;
    $('language').onchange = () => {
        language = $('language').value === 'uk' ? 'uk' : 'en';
        try { globalThis.localStorage?.setItem(LANGUAGE_KEY, language); } catch { /* In-memory switching still works. */ }
        refreshLanguage();
    };
    function log(message) {
        state.logs.push({ time: new Date(), message });
        $('log').textContent = formattedLogs().join('\n');
    }
    function updateLink() {
        try { $('playlist').href = `https://music.youtube.com/playlist?list=${parsePlaylist($('target').value)}`; }
        catch { $('playlist').removeAttribute('href'); }
    }
    function controls() {
        $('scan').disabled = state.busy;
        $('target').disabled = state.busy;
        $('versions').disabled = state.busy;
        $('stop').disabled = !state.busy || state.stop;
        $('add').disabled = state.busy || !state.plan?.pending.length;
        $('export').disabled = state.busy || !state.plan;
    }
    function invalidate() {
        state.plan = null;
        $('preview').replaceChildren();
        controls();
        updateLink();
    }
    async function run(task) {
        if (state.busy) return;
        state.busy = true;
        state.stop = false;
        controls();
        try { await task(); }
        catch (error) {
            log(errorDetail(error));
            status(t('runError', errorDetail(error), state.confirmed));
            // A partial write / failed verification must never leave a stale add button enabled.
            if (state.plan) state.plan.pending = [];
        } finally { state.busy = false; controls(); }
    }
    $('toggle').onclick = () => { $('panel').hidden = !$('panel').hidden; };
    $('target').oninput = invalidate;
    $('versions').onchange = invalidate;
    $('stop').onclick = () => {
        state.stop = true;
        status(t('stopping'));
        controls();
    };
    $('scan').onclick = () => run(async () => {
        invalidate();
        state.confirmed = 0;
        const playlistId = parsePlaylist($('target').value);
        const artistUrl = location.href;
        const account = identity();
        const api = makeApi(account);
        status(t('resolving'));
        const browseId = await resolveArtist(artistUrl, api);
        log(t('collectionStart', browseId));
        const existing = await playlistTracks(playlistId, api);
        const artist = await collectArtist(browseId, api, $('versions').checked);
        check();
        const pending = artist.songs.filter(song => !existing.tracks.has(song.id));
        state.plan = { ...artist, playlistId, playlistTitle: existing.title, browseId, account, pending };
        setText($('add'), t('addCount', pending.length));
        $('preview').replaceChildren(...pending.slice(0, 100).map(song => {
            const li = document.createElement('li');
            li.textContent = song.title;
            return li;
        }));
        status(t('preview', artist.name, existing.title, artist.songs.length, artist.songs.length - pending.length, pending.length, pending.length > 100 ? t('previewMore') : t('previewReview')));
        log(t('readyToAdd', pending.length, playlistId));
    });
    $('add').onclick = () => run(async () => {
        const plan = state.plan;
        if (!plan?.pending.length) return;
        assertIdentity(plan.account);
        const api = makeApi(plan.account);
        // Re-read every page immediately before writing, including songs added in another tab.
        const existing = await playlistTracks(plan.playlistId, api);
        const pending = plan.pending.filter(song => !existing.tracks.has(song.id));
        state.confirmed = 0;
        for (let offset = 0; offset < pending.length; offset += BATCH_SIZE) {
            check();
            const ids = pending.slice(offset, offset + BATCH_SIZE).map(song => song.id);
            status(t('adding', plan.playlistTitle, state.confirmed, pending.length));
            const response = await api('browse/edit_playlist', {
                playlistId: plan.playlistId,
                actions: ids.map(id => ({ action: 'ACTION_ADD_VIDEO', addedVideoId: id })),
            });
            addedIds(response, ids);
            state.confirmed += ids.length;
            log(t('confirmed', state.confirmed, pending.length));
        }
        check();
        const verified = await playlistTracks(plan.playlistId, api);
        const missing = pending.filter(song => !verified.tracks.has(song.id));
        if (missing.length) throw new LocalizedError(t('verificationMissing', missing.length));
        plan.pending = [];
        status(t('finished', state.confirmed, plan.songs.length - pending.length));
        log(t('verified'));
    });
    $('export').onclick = () => {
        if (!state.plan) return;
        const { name, browseId, playlistId, songs, releaseCount, skipped } = state.plan;
        const blob = new Blob([JSON.stringify({ artist: name, browseId, playlistId, releaseCount, skipped, songs, log: formattedLogs() }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'youtube-music-songs.json';
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    };
    window.addEventListener('beforeunload', event => {
        if (state.busy) { event.preventDefault(); event.returnValue = ''; }
    });
    refreshLanguage();
    updateLink();
    mount();
    document.addEventListener('yt-navigate-finish', mount);
    document.addEventListener('keydown', event => {
        if (event.altKey && event.shiftKey && event.code === 'KeyP') {
            mount();
            $('panel').hidden = false;
        }
    });
    console.info(render(t('startup')));
})();

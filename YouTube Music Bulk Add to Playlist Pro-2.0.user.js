// ==UserScript==
// @name         YouTube Music Bulk Add to Playlist Pro
// @namespace    http://tampermonkey.net/
// @version      3.0.4
// @description  Збирає пісні, альбоми й сингли виконавця, перевіряє дублікати та додає до плейлиста.
// @author       Geronimo
// @match        https://music.youtube.com/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(function () {
    'use strict';

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
        if (!layout) throw new Error('Невідомий формат сторінки YouTube Music. Збирання припинено.');
        const tab = layout.tabs?.find(tab => tab.tabRenderer?.selected)?.tabRenderer || layout.tabs?.[0]?.tabRenderer;
        return [...(tab?.content?.sectionListRenderer?.contents || []),
            ...(layout.secondaryContents?.sectionListRenderer?.contents || [])];
    }

    function trackShelf(response, album = false) {
        const sections = sectionsOf(response);
        const shelf = sections.map(section => section.musicPlaylistShelfRenderer).find(Boolean)
            || (album && sections.map(section => section.musicShelfRenderer).find(Boolean));
        if (!shelf) throw new Error('Не знайдено список треків. Не можна надійно перевірити весь плейлист / альбом.');
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
            if (!command) throw new Error('Невідомий формат наступної сторінки. Список може бути неповним.');
            return { token: command.token, legacy: false };
        }
        if (container.continuations?.length) throw new Error('Нерозпізнана пагінація. Список може бути неповним.');
        return null;
    }

    function continuationContainer(response) {
        for (const key of ['musicPlaylistShelfContinuation', 'musicShelfContinuation', 'gridContinuation', 'musicCarouselShelfContinuation']) {
            if (response.continuationContents?.[key]) return response.continuationContents[key];
        }
        const actions = [...(response.onResponseReceivedActions || []), ...(response.onResponseReceivedEndpoints || [])];
        const append = actions.map(action => action.appendContinuationItemsAction).find(Boolean);
        if (append && Array.isArray(append.continuationItems)) return { contents: append.continuationItems };
        throw new Error('YouTube Music не повернув очікуване продовження списку. Збирання припинено.');
    }

    async function readPages(first, body, api, consume, check = () => {}) {
        let container = first;
        const seen = new Set();
        while (true) {
            check();
            const items = container.contents || container.items;
            if (!Array.isArray(items)) throw new Error('Невідомий формат списку: відсутні елементи.');
            consume(items);
            const next = nextPage(container);
            if (!next) return;
            if (seen.has(next.token)) throw new Error('YouTube повторив сторінку. Повноту списку не підтверджено.');
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
            if (!['music.youtube.com', 'www.youtube.com', 'youtube.com'].includes(url.hostname)) throw new Error('Потрібне посилання на плейлист YouTube.');
            id = url.searchParams.get('list') || '';
        }
        if (!/^PL[A-Za-z0-9_-]+$/.test(id)) throw new Error('Вкажи ID звичайного плейлиста (PL…) або посилання на нього.');
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
            throw new Error(`Не розпізнано адресу виконавця: ${url.pathname}. Відкрий сторінку /@ім’я або /channel/UC…`);
        }
        url.search = '';
        url.hash = '';
        const response = await api('navigation/resolve_url', { url: url.href });
        const id = response.endpoint?.browseEndpoint?.browseId;
        if (typeof id !== 'string' || !/^(?:MPLA)?UC[A-Za-z0-9_-]+$/.test(id)) {
            throw new Error(`YouTube Music не повернув ID виконавця для ${url.pathname}. Спробуй відкрити виконавця через пошук YouTube Music.`);
        }
        return id.replace(/^MPLA/, '');
    }

    function addedIds(response, expected) {
        if (response.status !== 'STATUS_SUCCEEDED') throw new Error(`YouTube не підтвердив додавання (${response.status || 'без статусу'}).`);
        const confirmed = new Set((response.playlistEditResults || []).map(result => result.playlistEditVideoAddedResultData?.videoId).filter(Boolean));
        if (expected.some(id => !confirmed.has(id))) throw new Error('Відповідь не підтвердила всі треки пакета. Частину могло бути додано.');
        return confirmed;
    }

    // Pure helpers can be exercised with Node; no account or browser writes during tests.
    if (typeof document === 'undefined') {
        if (typeof module !== 'undefined') module.exports = { values, releaseOf, songOf, sectionsOf, trackShelf, nextPage, continuationContainer, readPages, parsePlaylist, artistFromUrl, resolveArtist, addedIds };
        return;
    }
    if (window.top !== window.self || document.getElementById('ytm-bulk-add-pro')) return;

    const state = { busy: false, stop: false, plan: null, logs: [], confirmed: 0 };
    function check() { if (state.stop) throw new Error('Зупинено користувачем.'); }
    function config(key) { return window.ytcfg?.get?.(key) ?? window.ytcfg?.data_?.[key]; }
    function identity() {
        return JSON.stringify([config('SESSION_INDEX') ?? '0', config('DELEGATED_SESSION_ID') || '', config('DATASYNC_ID') || '']);
    }
    function assertIdentity(expected) {
        if (identity() !== expected) throw new Error('Акаунт змінився. Збери список заново.');
    }

    async function authorization() {
        const cookies = new Map(document.cookie.split(';').map(part => {
            const index = part.indexOf('=');
            return [part.slice(0, index).trim(), part.slice(index + 1)];
        }));
        const secret = cookies.get('SAPISID') || cookies.get('__Secure-3PAPISID') || cookies.get('__Secure-1PAPISID');
        if (!secret) throw new Error('Не знайдено авторизовану сесію. Увійди в YouTube Music і перезавантаж сторінку.');
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
            if (!sourceContext?.client?.clientVersion) throw new Error('Немає конфігурації YouTube Music. Перезавантаж сторінку; скрипт має виконуватися в контексті сторінки.');
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
                if (!response.ok) throw new Error(`HTTP ${response.status}${response.status === 429 ? ': забагато запитів; спробуй пізніше' : ''}`);
                const result = await response.json();
                if (result.error) throw new Error(`YouTube: ${result.error.message || result.error.code}`);
                return result;
            } catch (error) {
                if (endpoint === 'browse/edit_playlist') throw new Error(`${error.message}. Результат останнього пакета невідомий. Збери список заново перед повтором.`);
                throw error;
            } finally { clearTimeout(timeout); }
        };
    }

    async function playlistTracks(id, api) {
        log(`Читаю цільовий плейлист: ${id}.`);
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
                        throw new Error('Не вдалося прочитати один із треків плейлиста. Перевірку дублікатів припинено.');
                    }
                }
            }
            status(`Перевіряю плейлист: прочитано ${tracks.size} треків…`);
        }, check);
        const title = values(response.header, 'title').map(textOf).find(Boolean)
            || values(sectionsOf(response), 'musicResponsiveHeaderRenderer').map(header => textOf(header.title)).find(Boolean) || id;
        return { tracks, title };
    }

    async function collectArtist(browseId, api, includeVersions) {
        log(`Читаю каталог виконавця: ${browseId}.`);
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
            status(`Збираю всі релізи ${name}…`);
            const body = { browseId: endpoint.browseId, ...(endpoint.params ? { params: endpoint.params } : {}) };
            const response = await api('browse', body);
            const grids = sectionsOf(response).map(section => section.gridRenderer || section.musicCarouselShelfRenderer).filter(Boolean);
            if (!grids.length) throw new Error('Не розпізнано повний список релізів. Додавання не починалося.');
            for (const grid of grids) await readPages(grid, body, api, consumeReleases, check);
        }
        let completed = 0;
        // Map iteration also visits newly discovered alternate editions, once per browseId.
        for (const release of releases.values()) {
            check();
            status(`Реліз ${++completed}/${releases.size}: ${release.title}. Пісень: ${songs.size}`);
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
        if (!songs.size) throw new Error('Не знайдено пісень. Відкрий головну сторінку виконавця, а не звичайний канал чи список відео. Можливо, формат сайту змінився.');
        log(`${name}: релізів ${completed}, унікальних ID пісень ${songs.size}, пропущених відео / недоступних рядків ${skipped}.`);
        return { name, songs: [...songs.values()], releaseCount: completed, skipped };
    }

    const host = document.createElement('div');
    host.id = 'ytm-bulk-add-pro';
    const root = host.attachShadow({ mode: 'open' });
    // Build DOM directly: innerHTML can be blocked by the site's Trusted Types policy.
    function element(tag, attributes = {}, text = '', parent = root) {
        const node = document.createElement(tag);
        for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
        node.textContent = text;
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
            small { color:#ccc; }
        `);
    element('button', { id: 'toggle', type: 'button' }, 'ДОДАТИ ВСЕ В ПЛЕЙЛИСТ');
    const panel = element('section', { id: 'panel', hidden: '' });
    element('h3', {}, 'Усі пісні виконавця', panel);
    element('p', {}, 'Відкрий головну сторінку виконавця. Скрипт збере пісні, альбоми та сингли / EP.', panel);
    const targetLabel = element('label', {}, 'Плейлист: посилання або ID', panel);
    element('input', { id: 'target', type: 'text', spellcheck: 'false' }, '', targetLabel);
    const versionsLabel = element('label', {}, '', panel);
    element('input', { id: 'versions', type: 'checkbox', checked: '' }, '', versionsLabel);
    element('span', {}, ' Також інші видання альбомів', versionsLabel);
    element('small', {}, 'Дублікати перевіряються за ID. Ремастери й різні записи однієї пісні можуть мати різні ID.', panel);
    const actions = element('div', { class: 'row' }, '', panel);
    element('button', { id: 'scan', type: 'button' }, '1. Зібрати пісні', actions);
    element('button', { id: 'add', type: 'button', disabled: '' }, '2. Додати', actions);
    element('button', { id: 'stop', type: 'button', class: 'secondary', disabled: '' }, 'Зупинити', actions);
    element('p', { id: 'status', role: 'status', 'aria-live': 'polite' }, 'Готово до збирання.', panel);
    element('a', { id: 'playlist', target: '_blank', rel: 'noopener' }, 'Відкрити цільовий плейлист', panel);
    element('ol', { id: 'preview' }, '', panel);
    const exports = element('div', { class: 'row' }, '', panel);
    element('button', { id: 'export', type: 'button', class: 'secondary', disabled: '' }, 'Зберегти список JSON', exports);
    const details = element('details', {}, '', panel);
    element('summary', {}, 'Журнал', details);
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
    function status(message) { $('status').textContent = message; }
    function log(message) {
        state.logs.push(`${new Date().toLocaleTimeString()} ${message}`);
        $('log').textContent = state.logs.join('\n');
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
            log(error.message);
            status(`${error.message}\nПідтверджено доданих у цьому запуску: ${state.confirmed}. Перед повтором натисни «Зібрати пісні».`);
            // A partial write / failed verification must never leave a stale add button enabled.
            if (state.plan) state.plan.pending = [];
        } finally { state.busy = false; controls(); }
    }
    $('toggle').onclick = () => { $('panel').hidden = !$('panel').hidden; };
    $('target').oninput = invalidate;
    $('versions').onchange = invalidate;
    $('stop').onclick = () => {
        state.stop = true;
        status('Зупиняю після поточного запиту. Уже надіслане додавання може завершитися.');
        controls();
    };
    $('scan').onclick = () => run(async () => {
        invalidate();
        state.confirmed = 0;
        const playlistId = parsePlaylist($('target').value);
        const artistUrl = location.href;
        const account = identity();
        const api = makeApi(account);
        status('Визначаю виконавця…');
        const browseId = await resolveArtist(artistUrl, api);
        log(`Початок збирання: ${browseId}.`);
        const existing = await playlistTracks(playlistId, api);
        const artist = await collectArtist(browseId, api, $('versions').checked);
        check();
        const pending = artist.songs.filter(song => !existing.tracks.has(song.id));
        state.plan = { ...artist, playlistId, playlistTitle: existing.title, browseId, account, pending };
        $('add').textContent = `2. Додати ${pending.length} пісень`;
        $('preview').replaceChildren(...pending.slice(0, 100).map(song => {
            const li = document.createElement('li');
            li.textContent = song.title;
            return li;
        }));
        status(`${artist.name}\nПлейлист: ${existing.title}\nЗнайдено: ${artist.songs.length}; уже є: ${artist.songs.length - pending.length}; нових: ${pending.length}.\n${pending.length > 100 ? 'Нижче перші 100; повний список — у JSON.' : 'Переглянь список і натисни «Додати».'}`);
        log(`Готово до додавання ${pending.length} пісень у ${playlistId}.`);
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
            status(`Додаю до «${plan.playlistTitle}»: ${state.confirmed}/${pending.length}…`);
            const response = await api('browse/edit_playlist', {
                playlistId: plan.playlistId,
                actions: ids.map(id => ({ action: 'ACTION_ADD_VIDEO', addedVideoId: id })),
            });
            addedIds(response, ids);
            state.confirmed += ids.length;
            log(`Підтверджено ${state.confirmed}/${pending.length}.`);
        }
        check();
        const verified = await playlistTracks(plan.playlistId, api);
        const missing = pending.filter(song => !verified.tracks.has(song.id));
        if (missing.length) throw new Error(`Під час повторної перевірки не знайдено ${missing.length} треків. Оновлення може ще оброблятися.`);
        plan.pending = [];
        status(`Готово! Додано й перевірено: ${state.confirmed}. Уже були перед додаванням: ${plan.songs.length - pending.length}.\nОнови сторінку цільового плейлиста, щоб побачити зміни.`);
        log('Повторна перевірка плейлиста завершена.');
    });
    $('export').onclick = () => {
        if (!state.plan) return;
        const { name, browseId, playlistId, songs, releaseCount, skipped } = state.plan;
        const blob = new Blob([JSON.stringify({ artist: name, browseId, playlistId, releaseCount, skipped, songs, log: state.logs }, null, 2)], { type: 'application/json' });
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
    updateLink();
    mount();
    document.addEventListener('yt-navigate-finish', mount);
    document.addEventListener('keydown', event => {
        if (event.altKey && event.shiftKey && event.code === 'KeyP') {
            mount();
            $('panel').hidden = false;
        }
    });
    console.info('[YTM Bulk Add 3.0.4] Панель запущено. Alt+Shift+P відкриває її.');
})();

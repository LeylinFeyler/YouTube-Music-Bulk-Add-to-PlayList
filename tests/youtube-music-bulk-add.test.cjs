'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../YouTube Music Bulk Add to Playlist Pro-2.0.user.js');
const id = n => String(n).padStart(11, '0');
const row = (n, type = 'MUSIC_VIDEO_TYPE_ATV') => ({ musicResponsiveListItemRenderer: {
    playlistItemData: { videoId: id(n) },
    flexColumns: [{ musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: `Song ${n}` }] } } }],
    overlay: { musicItemThumbnailOverlayRenderer: { content: { musicPlayButtonRenderer: {
        playNavigationEndpoint: { watchEndpoint: { videoId: id(n),
            watchEndpointMusicSupportedConfigs: { watchEndpointMusicConfig: { musicVideoType: type } } } },
    } } } },
} });
const more = token => ({ continuationItemRenderer: { continuationEndpoint: {
    commandExecutorCommand: { commands: [ { playlistVotingRefreshPopupCommand: {} },
        { continuationCommand: { token, request: 'CONTINUATION_REQUEST_TYPE_BROWSE' } } ] },
} } });
const layout = sections => ({ contents: { twoColumnBrowseResultsRenderer: {
    tabs: [{ tabRenderer: { selected: true, content: { sectionListRenderer: { contents: [] } } } }],
    secondaryContents: { sectionListRenderer: { contents: sections } },
} } });

test('target link preserves the exact supplied playlist ID', () => {
    assert.equal(core.parsePlaylist('https://music.youtube.com/playlist?list=PLlsCQDB_ve7YB19JET-pc0TN255DYOId0'), 'PLlsCQDB_ve7YB19JET-pc0TN255DYOId0');
    assert.throws(() => core.parsePlaylist('https://example.com/?list=PL123'));
    assert.throws(() => core.parsePlaylist('RD123'));
});
test('song classification rejects clips, UGC, podcasts, and unknown types outside albums', () => {
    assert.equal(core.songOf(row(1)).title, 'Song 1');
    for (const type of ['MUSIC_VIDEO_TYPE_OMV', 'MUSIC_VIDEO_TYPE_UGC', 'MUSIC_VIDEO_TYPE_PODCAST_EPISODE', null]) {
        assert.equal(core.songOf(row(1, type)), null);
    }
    assert.equal(core.songOf(row(1, null), true).id, id(1));
    assert.equal(core.songOf(row(1, 'MUSIC_VIDEO_TYPE_OMV'), true), null);
});
test('unavailable songs are skipped, but IDs remain available for deduplication', () => {
    const item = row(2);
    item.musicResponsiveListItemRenderer.musicItemRendererDisplayPolicy = 'MUSIC_ITEM_RENDERER_DISPLAY_POLICY_GREY_OUT';
    assert.equal(core.songOf(item), null);
    assert.equal(core.songOf(item, false, true).id, id(2));
});
test('existing playlist video IDs are included regardless of video type', () => {
    assert.equal(core.songOf(row(3, 'MUSIC_VIDEO_TYPE_OMV'), false, true).id, id(3));
});
test('does not discover unrelated videos inside menus', () => {
    assert.equal(core.songOf({ musicResponsiveListItemRenderer: {
        menu: { watchEndpoint: { videoId: id(9) } },
    } }), null);
});
test('only album cards become releases, not artists or playlists', () => {
    const card = browseId => ({ musicTwoRowItemRenderer: {
        title: { runs: [{ text: 'Release' }] }, navigationEndpoint: { browseEndpoint: { browseId } },
    } });
    assert.equal(core.releaseOf(card('MPRE123')).browseId, 'MPRE123');
    assert.equal(core.releaseOf(card('UC123')), null);
    assert.equal(core.releaseOf(card('VLPL123')), null);
});
test('playlist tracks exclude recommendations and unrelated section continuations', () => {
    const shelf = { contents: [row(1), more('real')] };
    const response = layout([{ musicShelfRenderer: { contents: [row(2)] } }, { musicPlaylistShelfRenderer: shelf }]);
    assert.equal(core.trackShelf(response), shelf);
    assert.equal(core.nextPage(core.trackShelf(response)).token, 'real');
});
test('unexpected playlist structures fail instead of pretending to be empty', () => {
    assert.throws(() => core.trackShelf(layout([{ musicShelfRenderer: { contents: [] } }])));
    assert.throws(() => core.sectionsOf({}));
    assert.throws(() => core.continuationContainer({ responseContext: {} }));
});
test('reads more than 900 playlist entries through nested modern continuations', async () => {
    const found = new Set();
    let calls = 0;
    function page(n) {
        const contents = Array.from({ length: 50 }, (_, i) => row(n * 50 + i));
        if (n < 19) contents.push(more(String(n + 1)));
        return { contents };
    }
    await core.readPages(page(0), { browseId: 'VLPLtest' }, async (endpoint, body, legacy) => {
        calls++;
        assert.equal(endpoint, 'browse');
        assert.equal(legacy, undefined);
        return { onResponseReceivedActions: [{ appendContinuationItemsAction: { continuationItems: page(Number(body.continuation)).contents } }] };
    }, items => items.forEach(item => { const track = core.songOf(item, false, true); if (track) found.add(track.id); }));
    assert.equal(calls, 19);
    assert.equal(found.size, 1000);
    assert.ok(found.has(id(999)));
});
test('legacy album pagination keeps the browseId and params', async () => {
    const body = { browseId: 'UCtest', params: 'albums-params' };
    const consumed = [];
    await core.readPages({ items: ['first'], continuations: [{ nextContinuationData: { continuation: 'legacy-token' } }] }, body,
        async (endpoint, request, token) => {
            assert.deepEqual(request, body);
            assert.equal(token, 'legacy-token');
            return { continuationContents: { gridContinuation: { items: ['second'] } } };
        }, items => consumed.push(...items));
    assert.deepEqual(consumed, ['first', 'second']);
});
test('repeated and unrecognized continuation tokens abort', async () => {
    await assert.rejects(core.readPages({ contents: [more('repeat')] }, {}, async () => ({
        onResponseReceivedActions: [{ appendContinuationItemsAction: { continuationItems: [more('repeat')] } }],
    }), () => {}), /repeated/);
    assert.throws(() => core.nextPage({ contents: [{ continuationItemRenderer: {} }] }));
});
test('stop prevents the next continuation request', async () => {
    let stopped = false;
    let requests = 0;
    await assert.rejects(core.readPages({ contents: [more('next')] }, {}, async () => {
        requests++;
        return { continuationContents: { musicShelfContinuation: { contents: [] } } };
    }, () => { stopped = true; }, () => { if (stopped) throw Error('Stopped'); }));
    assert.equal(requests, 0);
});
test('only individually acknowledged writes count as successful', () => {
    const response = { status: 'STATUS_SUCCEEDED', playlistEditResults: [
        { playlistEditVideoAddedResultData: { videoId: id(1), setVideoId: 'item1' } },
    ] };
    assert.ok(core.addedIds(response, [id(1)]).has(id(1)));
    assert.throws(() => core.addedIds(response, [id(1), id(2)]));
    assert.throws(() => core.addedIds({ status: 'STATUS_FAILED' }, [id(1)]));
    assert.throws(() => core.addedIds({ status: 'STATUS_SUCCEEDED' }, [id(1)]));
});

for (const empty of [false, true]) test(`browser workflow with ${empty ? 'empty' : 'populated'} destination scans, adds and verifies`, async () => {
    const vm = require('node:vm');
    const fs = require('node:fs');
    class Element {
        constructor() { this.value = ''; this.textContent = ''; this.checked = true; this.children = []; this.style = { setProperty() {} }; }
        setAttribute(key, value) { if (key === 'id') elements.set(value, this); if (key === 'hidden' || key === 'disabled') this[key] = true; }
        set innerHTML(value) { throw new TypeError('TrustedHTML required'); }
        get textContent() { return this._text || (this.children || []).map(child => child.textContent).join(''); }
        set textContent(value) { this._text = String(value); this.children = []; }
        append(...items) { this.children.push(...items); }
        replaceChildren(...items) { this.children = items; }
        removeAttribute() {}
        attachShadow() { return shadow; }
    }
    const elements = new Map();
    const shadow = { append() {}, set innerHTML(value) { throw new TypeError('TrustedHTML required'); }, getElementById(name) {
        if (!elements.has(name)) elements.set(name, new Element());
        return elements.get(name);
    } };
    const document = { cookie: 'SAPISID=test-session-secret', body: new Element(),
        getElementById: () => null, addEventListener() {}, createTextNode: text => ({ textContent: text }), createElement: () => new Element() };
    const cfg = { SESSION_INDEX: '2', DELEGATED_SESSION_ID: 'brand-account',
        INNERTUBE_CONTEXT: { client: { clientName: 'WEB_REMIX', clientVersion: 'test', hl: 'uk' } } };
    const window = { ytcfg: { get: key => cfg[key] }, addEventListener() {} };
    window.top = window.self = window;
    const release = n => ({ musicTwoRowItemRenderer: { title: { runs: [{ text: `Album ${n}` }] },
        navigationEndpoint: { browseEndpoint: { browseId: `MPRE${n}` } } } });
    const catalog = { musicCarouselShelfRenderer: { header: { musicCarouselShelfBasicHeaderRenderer: {
        title: { runs: [{ text: 'Albums' }] }, moreContentButton: { buttonRenderer: {
            navigationEndpoint: { browseEndpoint: { browseId: 'UCartist', params: 'full-albums' } },
        } },
    } }, contents: [release(1)] } };
    const existing = new Set(empty ? [] : [id(1)]);
    const writes = [];
    const requests = [];
    const location = new URL('https://music.youtube.com/channel/UCartist');
    const fakeFetch = async (url, options) => {
        const { context, ...body } = JSON.parse(options.body);
        requests.push({ url: String(url), body });
        assert.equal(context.client.hl, 'en');
        assert.equal(options.credentials, 'same-origin');
        assert.equal(options.headers['X-Goog-AuthUser'], '2');
        assert.equal(options.headers['X-Goog-PageId'], 'brand-account');
        assert.match(options.headers.Authorization, /^SAPISIDHASH \d+_[a-f0-9]{40}$/);
        let result;
        if (url.pathname.endsWith('/browse/edit_playlist')) {
            writes.push(body);
            for (const action of body.actions) {
                assert.equal(action.action, 'ACTION_ADD_VIDEO');
                assert.equal(action.dedupeOption, undefined);
                assert.ok(!existing.has(action.addedVideoId));
                existing.add(action.addedVideoId);
            }
            result = { status: 'STATUS_SUCCEEDED', playlistEditResults: body.actions.map(action => ({
                playlistEditVideoAddedResultData: { videoId: action.addedVideoId, setVideoId: 'confirmed' },
            })) };
        } else if (body.browseId?.startsWith('VLPL')) {
            result = layout([{ musicPlaylistShelfRenderer: existing.size ? { contents: [...existing].map(value => row(Number(value))) } : { playlistId: 'PLempty' } }]);
        } else if (body.browseId === 'UCartist' && !body.params) {
            result = layout([catalog]);
            result.header = { musicImmersiveHeaderRenderer: { title: { runs: [{ text: 'Artist' }] } } };
        } else if (body.params === 'full-albums' && !url.searchParams.has('continuation')) {
            result = layout([{ gridRenderer: { items: [release(1)], continuations: [{ nextContinuationData: { continuation: 'album-page-2' } }] } }]);
        } else if (url.searchParams.get('continuation') === 'album-page-2') {
            result = { continuationContents: { gridContinuation: { items: [release(2)] } } };
        } else if (body.browseId === 'MPRE1') {
            result = layout([{ musicShelfRenderer: { contents: [row(1), row(2), row(99, 'MUSIC_VIDEO_TYPE_OMV')] } }]);
        } else if (body.browseId === 'MPRE2') {
            result = layout([{ musicShelfRenderer: { contents: [row(2), row(3)] } }]);
        } else throw Error(`Unexpected request ${JSON.stringify(body)}`);
        return { ok: true, json: async () => result };
    };
    const saved = new Map();
    const localStorage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) };
    const context = vm.createContext({ localStorage, document, window, location, URL, fetch: fakeFetch,
        crypto: require('node:crypto').webcrypto, TextEncoder, AbortController,
        setTimeout: (fn, ms) => ms < 45000 ? setTimeout(fn, 0) : 0, clearTimeout,
    });
    vm.runInContext(fs.readFileSync(require.resolve('../YouTube Music Bulk Add to Playlist Pro-2.0.user.js'), 'utf8'), context);
    const element = name => shadow.getElementById(name);
    await element('scan').onclick();
    assert.equal(writes.length, 0, element('status').textContent);
    assert.equal(element('add').disabled, false, element('status').textContent);
    assert.match(element('status').textContent, empty ? /Found: 3; already present: 0; new: 3/ : /Found: 3; already present: 1; new: 2/);
    assert.deepEqual(element('preview').children.map(item => item.textContent), empty ? ['Song 1', 'Song 2', 'Song 3'] : ['Song 2', 'Song 3']);
    const target = element('target').value;
    element('language').value = 'uk';
    element('language').onchange();
    assert.match(element('status').textContent, /Знайдено: 3/);
    assert.match(element('log').textContent, /Читаю каталог виконавця/);
    assert.match(element('add').textContent, /Додати/);
    assert.equal(element('target').value, target);
    assert.equal(element('add').disabled, false);
    assert.equal(saved.get('ytm-bulk-add-language'), 'uk');
    // Switch during a live operation, without replacing the collected plan.
    const operation = element('add').onclick();
    element('language').value = 'en';
    element('language').onchange();
    await operation;
    assert.equal(writes.length, 1, element('status').textContent);
    assert.deepEqual(writes[0].actions.map(action => action.addedVideoId), empty ? [id(1), id(2), id(3)] : [id(2), id(3)]);
    assert.match(element('status').textContent, empty ? /Added and verified: 3/ : /Added and verified: 2/);
    assert.equal(element('add').disabled, true);
    element('target').value = 'invalid';
    await element('scan').onclick();
    assert.match(element('status').textContent, /Enter a regular playlist ID/);
    element('language').value = 'uk';
    element('language').onchange();
    assert.match(element('status').textContent, /Вкажи ID звичайного плейлиста/);
    assert.match(element('log').textContent, /Вкажи ID звичайного плейлиста/);
    assert.equal(cfg.INNERTUBE_CONTEXT.client.hl, 'uk');
    assert.equal(requests.filter(request => request.body.browseId?.startsWith('VLPL')).length, 3);
    // A fresh script execution restores the saved choice.
    const source = fs.readFileSync(require.resolve('../YouTube Music Bulk Add to Playlist Pro-2.0.user.js'), 'utf8');
    vm.runInContext(source, context);
    assert.equal(element('language').value, 'uk');
    assert.equal(element('scan').textContent, '1. Зібрати пісні');
    context.localStorage = { getItem() { throw Error('Storage blocked'); }, setItem() { throw Error('Storage blocked'); } };
    vm.runInContext(source, context);
    assert.equal(element('language').value, 'en');
    element('language').value = 'uk';
    element('language').onchange();
    assert.equal(element('scan').textContent, '1. Зібрати пісні');
});

test('artist URLs accept view parameters and MPLA wrappers without accepting playlists', () => {
    for (const path of ['/channel/UCexample', '/browse/UCexample?params=section', '/channel/UCexample/?si=tracking', '/browse/MPLAUCexample']) {
        assert.equal(core.artistFromUrl(`https://music.youtube.com${path}`), 'UCexample');
    }
    for (const path of ['/playlist?list=PLexample', '/browse/MPREexample', '/watch?v=UCexample', '/']) {
        assert.equal(core.artistFromUrl(`https://music.youtube.com${path}`), null);
    }
    assert.equal(core.artistFromUrl('https://example.com/channel/UCexample'), null);
});

test('all supplied channel links resolve without extra requests', async () => {
    for (const id of ['UCeqjRAl_a1ZrrwJ_IbIwjWQ', 'UC6IhDHJbJUoRJGUPnlh5GRQ', 'UClZMIQn97IcvrdGviWz-qRw', 'UC5DHwv9N4OQ9AWtKr8YSefw']) {
        assert.equal(await core.resolveArtist(`https://music.youtube.com/channel/${id}`, () => { throw Error('Unexpected request'); }), id);
    }
});
test('KingGnu handle resolves using the navigation endpoint', async () => {
    const result = await core.resolveArtist('https://music.youtube.com/@KingGnuOfficial?si=tracking', async (endpoint, body) => {
        assert.equal(endpoint, 'navigation/resolve_url');
        assert.equal(body.url, 'https://music.youtube.com/@KingGnuOfficial');
        return { endpoint: { browseEndpoint: { browseId: 'UCfixtureArtist' } } };
    });
    assert.equal(result, 'UCfixtureArtist');
});
test('unresolved handles and non-artist endpoints fail before collection', async () => {
    for (const response of [{}, { endpoint: { browseEndpoint: { browseId: 'VLPLwrong' } } }]) {
        await assert.rejects(core.resolveArtist('https://music.youtube.com/@KingGnuOfficial', async () => response), /did not return an artist ID/);
    }
    await assert.rejects(core.resolveArtist('https://music.youtube.com/playlist?list=PLtest', () => { throw Error('Should not fetch'); }), /Unrecognized/);
});

 test('missing continuation contents must not be treated as an empty playlist', async () => {
    await assert.rejects(core.readPages({ contents: [more('next')] }, {}, async () => ({
        continuationContents: { musicPlaylistShelfContinuation: {} },
    }), () => {}), /items are missing/);
});

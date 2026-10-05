const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { before, after, test } = require('node:test');
const { chromium } = require('playwright');

let context;
let worker;
let profile;

const protection = {
  enabled: true, hideShorts: true, hideNonWhitelisted: true,
  feedDataFilter: false, blockHoverPreview: false, blockWatchPlayback: false,
  bypassUntil: 0, whitelist: [{ handle: '@allowed', channelId: 'UCallowed' }]
};

function regular(id = 'regular', handle = 'allowed') {
  return `<ytd-video-renderer id="${id}">
    <a href="/watch?v=${id}">Regular video</a>
    <a href="/@${handle}">Channel</a>
  </ytd-video-renderer>`;
}

function channelCard(id = 'channel', handle = 'allowed') {
  return `<ytd-channel-renderer id="${id}">
    <a href="/@${handle}">Channel result</a>
  </ytd-channel-renderer>`;
}

function playlistCard(id = 'playlist', handle = 'allowed') {
  return `<yt-lockup-view-model id="${id}">
    <a href="/playlist?list=PL-${id}">Playlist or mix</a>
    <a href="/@${handle}">Channel</a>
  </yt-lockup-view-model>`;
}

function unknownCard(id = 'unknown') {
  return `<div id="${id}" class="unknown-search-result">Unclassified result</div>`;
}

function short(id = 'modern') {
  return `<div class="ytGridShelfViewModelGridShelfItem" id="${id}-item">
    <ytm-shorts-lockup-view-model-v2 id="${id}">
      <ytm-shorts-lockup-view-model>
        <a href="/shorts/${id}">Shorts thumbnail</a>
        <div>Shorts views and menu</div>
      </ytm-shorts-lockup-view-model>
    </ytm-shorts-lockup-view-model-v2>
  </div>`;
}

function shelf(contents, id = 'shelf') {
  return `<grid-shelf-view-model id="${id}">
    <h2>Shorts</h2>
    <div class="ytGridShelfViewModelGridShelfRow">${contents}</div>
    <button>Show more</button>
  </grid-shelf-view-model>`;
}

before(async () => {
  profile = await fs.mkdtemp(path.join(os.tmpdir(), 'yt-wl-shorts-test-'));
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chrome', headless: process.env.HEADFUL !== '1',
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging', '--no-first-run', '--no-default-browser-check']
  });
  const cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: path.join(__dirname, '..') });
  const installed = await cdp.send('Extensions.getExtensions');
  assert.ok(installed.extensions.some(extension => extension.id === id && extension.enabled));
  worker = context.serviceWorkers().find(item => item.url().startsWith(`chrome-extension://${id}/`)) ||
    await context.waitForEvent('serviceworker', {
      predicate: item => item.url().startsWith(`chrome-extension://${id}/`)
    });
  await worker.evaluate(async () => {
    while (!(await chrome.storage.local.get('whitelist')).whitelist) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  });
}, { timeout: 30000 });

after(async () => {
  if (context) await context.close();
  if (profile) await fs.rm(profile, { recursive: true, force: true });
});

async function fixture(t, contents, pathname = '/results?search_query=planet') {
  await worker.evaluate(config => chrome.storage.local.set(config), protection);
  const page = await context.newPage();
  t.after(() => page.close());
  await page.route('https://www.youtube.com/**', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><head><style>
      grid-shelf-view-model, ytd-video-renderer, ytd-channel-renderer,
      ytd-section-list-renderer, ytd-item-section-renderer, ytd-search,
      ytd-reel-shelf-renderer, ytd-reel-item-renderer, ytm-shorts-lockup-view-model-v2,
      ytm-shorts-lockup-view-model, yt-lockup-view-model, ytd-section-header-renderer,
      ytd-continuation-item-renderer { display: block; padding: 12px; }
      .ytGridShelfViewModelGridShelfItem { display: flex; padding: 12px; }
    </style></head><body>
      <input id="search-box" name="search_query" value="planet">
      <button id="filters">Filters</button>
      <yt-chip-cloud-renderer id="search-filter-chips">Search filters</yt-chip-cloud-renderer>
      <ytd-search><ytd-section-list-renderer><ytd-item-section-renderer>
        <div id="contents">${regular()}${contents}</div>
      </ytd-item-section-renderer></ytd-section-list-renderer></ytd-search>
    </body></html>`
  }));
  await page.goto('https://www.youtube.com' + pathname);
  await allowedFeedBridge(page);
  await page.waitForFunction(() => document.documentElement.classList.contains('yt-wl-hide-shorts'));
  await page.waitForFunction(() => document.querySelector('#regular')?.getAttribute('data-yt-wl-status') === 'allowed');
  return page;
}

async function allowedFeedBridge(page) {
  await page.evaluate(() => {
    window.postMessage({ type: 'YT_WL_FEED_CONFIG', enabled: true, hideShorts: true,
      failClosed: true, bypassed: false, channels: [{ channelId: 'UCallowed', handle: '@allowed' }] }, location.origin);
  });
}

async function visible(page, selector) {
  return page.locator(selector).evaluate(element => element.checkVisibility({
    checkVisibilityCSS: true, checkOpacity: true
  }));
}

test('modern search cards and their empty shelves are hidden', async t => {
  const page = await fixture(t, shelf(short()));
  assert.equal(await visible(page, '#modern'), false);
  assert.equal(await visible(page, '#modern-item'), false);
  assert.equal(await visible(page, '#shelf'), false);
  assert.equal(await visible(page, '#regular'), true);
});

test('search pages hide channels, playlists, and unclassified result cards', async t => {
  const page = await fixture(t, channelCard() + playlistCard() + unknownCard() + regular('blocked', 'blocked'));
  for (const selector of ['#channel', '#playlist', '#unknown', '#blocked']) {
    assert.equal(await visible(page, selector), false, selector + ' should be hidden');
  }
  assert.equal(await visible(page, '#regular'), true);
});

test('bridge-preserved blocked videos remain hidden by the DOM whitelist filter', async t => {
  const page = await fixture(t, regular('blocked', 'blocked'));
  assert.equal(await visible(page, '#blocked'), false);
  assert.equal(await page.locator('#blocked').getAttribute('data-yt-wl-status'), 'blocked');
});

test('allowlisted lockup videos remain visible on search pages', async t => {
  const lockup = `<yt-lockup-view-model id="allowed-lockup">
    <a href="/watch?v=lockup12345">Allowed lockup video</a>
    <a href="/@allowed">Channel</a>
  </yt-lockup-view-model>`;
  const page = await fixture(t, lockup);
  assert.equal(await visible(page, '#allowed-lockup'), true);
});

test('allowlisted rich-item videos remain visible on search pages', async t => {
  const richItem = `<ytd-rich-item-renderer id="allowed-rich-item">
    ${regular('nested-allowed')}
  </ytd-rich-item-renderer>`;
  const page = await fixture(t, richItem);
  assert.equal(await visible(page, '#allowed-rich-item'), true);
});

test('search controls, messages, and continuation items remain visible', async t => {
  const page = await fixture(t, '<h2 id="heading">Results</h2>' +
    '<yt-did-you-mean-renderer id="did-you-mean">Did you mean this?</yt-did-you-mean-renderer>' +
    '<div id="continuation" class="continuation-item">Show more results</div>' + channelCard());
  for (const selector of ['#search-box', '#filters', '#search-filter-chips', '#heading', '#did-you-mean', '#continuation']) {
    assert.equal(await visible(page, selector), true, selector + ' should be preserved');
  }
  assert.equal(await visible(page, '#channel'), false);
});

test('Shorts types are hidden by CSS before their links hydrate', async t => {
  const page = await fixture(t, '');
  const isVisible = await page.evaluate(() => {
    const card = document.createElement('ytm-shorts-lockup-view-model-v2');
    card.textContent = 'Pending Shorts card';
    document.body.appendChild(card);
    return card.checkVisibility();
  });
  assert.equal(isVisible, false);
});

test('mixed shelves preserve allowed regular videos', async t => {
  const page = await fixture(t, shelf(short() + regular('mixed-regular')));
  assert.equal(await visible(page, '#modern-item'), false);
  assert.equal(await visible(page, '#mixed-regular'), true);
  assert.equal(await visible(page, '#shelf'), true);
});

test('late Shorts insertion is filtered by the existing observer', async t => {
  const page = await fixture(t, '');
  await page.evaluate(html => document.querySelector('#contents').insertAdjacentHTML('beforeend', html),
    shelf(short('late')) + regular('late-control'));
  await page.waitForFunction(() => document.querySelector('#late-control')?.getAttribute('data-yt-wl-status') === 'allowed');
  assert.equal(await visible(page, '#late-item'), false);
  assert.equal(await visible(page, '#shelf'), false);
});

test('an empty Shorts shelf is restored when a regular item arrives', async t => {
  const page = await fixture(t, shelf(short()));
  assert.equal(await visible(page, '#shelf'), false);
  await page.locator('.ytGridShelfViewModelGridShelfRow').evaluate((row, html) => {
    row.insertAdjacentHTML('beforeend', html);
  }, regular('later-regular'));
  await page.waitForFunction(() => document.querySelector('#later-regular')?.getAttribute('data-yt-wl-status') === 'allowed');
  assert.equal(await visible(page, '#shelf'), true);
  assert.equal(await visible(page, '#later-regular'), true);
  assert.equal(await visible(page, '#modern-item'), false);
});

test('late channel and playlist cards are filtered on search pages', async t => {
  const page = await fixture(t, '');
  await allowedFeedBridge(page);
  await page.evaluate(html => document.querySelector('#contents').insertAdjacentHTML('beforeend', html),
    channelCard('late-channel') + playlistCard('late-playlist') + regular('late-allowed'));
  await page.waitForFunction(() => document.querySelector('#late-allowed')?.getAttribute('data-yt-wl-status') === 'allowed');
  assert.equal(await visible(page, '#late-channel'), false);
  assert.equal(await visible(page, '#late-playlist'), false);
  assert.equal(await visible(page, '#late-allowed'), true);
});

test('strict result-card filtering is limited to search pages', async t => {
  const page = await fixture(t, channelCard('browse-channel') + playlistCard('browse-playlist'), '/watch?v=allowed12345');
  assert.equal(await page.evaluate(() => location.pathname), '/watch');
  assert.equal(await visible(page, '#browse-channel'), true);
  assert.equal(await visible(page, '#browse-playlist'), true);
});

test('legacy Shorts suppression is unchanged', async t => {
  const page = await fixture(t, '<ytd-reel-shelf-renderer id="legacy"><ytd-reel-item-renderer><a href="/shorts/legacy">Legacy short</a></ytd-reel-item-renderer></ytd-reel-shelf-renderer>');
  assert.equal(await visible(page, '#legacy'), false);
  assert.equal(await visible(page, '#regular'), true);
});

test('allowlisted legacy Shorts remain visible when Shorts hiding is disabled', async t => {
  const page = await fixture(t, '<ytd-reel-item-renderer id="allowed-search-short">' +
    '<a href="/shorts/allowed-short">Allowed Short</a><a href="/@allowed">Channel</a></ytd-reel-item-renderer>');
  await worker.evaluate(() => chrome.storage.local.set({ hideShorts: false }));
  await page.waitForFunction(() => !document.documentElement.classList.contains('yt-wl-hide-shorts'));
  assert.equal(await visible(page, '#allowed-search-short'), true);
  assert.equal(await page.locator('#allowed-search-short').getAttribute('data-yt-wl-status'), 'allowed');
});

test('SPA navigation continues to suppress modern Shorts', async t => {
  const page = await fixture(t, '');
  await page.evaluate(html => {
    history.pushState({}, '', '/results?search_query=space');
    document.querySelector('#contents').insertAdjacentHTML('beforeend', html);
    window.dispatchEvent(new Event('yt-navigate-finish'));
  }, shelf(short('navigation')) + regular('navigation-control'));
  await page.waitForFunction(() => document.querySelector('#navigation-control')?.getAttribute('data-yt-wl-status') === 'allowed');
  assert.equal(await visible(page, '#navigation-item'), false);
  assert.equal(await visible(page, '#shelf'), false);
});

function sponsored(id = 'sponsored') {
  return `<ytd-ad-slot-renderer id="${id}">
    <ytd-in-feed-ad-layout-renderer>
      <ytd-promoted-sparkles-web-renderer>
        <a href="/watch?v=advertised">Sponsored video</a>
        <a href="/@allowed">Allowed advertiser</a>
        <button>Visit site</button>
      </ytd-promoted-sparkles-web-renderer>
    </ytd-in-feed-ad-layout-renderer>
  </ytd-ad-slot-renderer>`;
}

test('sponsored search cards are hidden without hiding ordinary videos', async t => {
  const page = await fixture(t, sponsored());
  assert.equal(await visible(page, '#sponsored'), false);
  assert.equal(await visible(page, '#regular'), true);
});

test('late sponsored containers are hidden on first paint', async t => {
  const page = await fixture(t, '');
  const isVisible = await page.evaluate(html => {
    document.body.insertAdjacentHTML('beforeend', html);
    return document.querySelector('#sponsored').checkVisibility();
  }, sponsored());
  assert.equal(isVisible, false);
});

test('sponsored wrappers are filtered after late insertion', async t => {
  const page = await fixture(t, '');
  await page.evaluate(html => document.querySelector('#contents').insertAdjacentHTML('beforeend', html),
    `<ytd-rich-item-renderer id="ad-wrapper">${sponsored()}</ytd-rich-item-renderer>` + regular('ad-control'));
  await page.waitForFunction(() => document.querySelector('#ad-control')?.getAttribute('data-yt-wl-status') === 'allowed');
  assert.equal(await visible(page, '#ad-wrapper'), false);
  assert.equal(await visible(page, '#ad-control'), true);
});

test('a regular video title mentioning sponsorship remains visible', async t => {
  const page = await fixture(t, regular('discussion').replace('Regular video', 'How sponsored videos work'));
  assert.equal(await visible(page, '#discussion'), true);
});

test('disabling protection restores ownerless sponsored cards and Shorts shelves', async t => {
  const page = await fixture(t, '<ytd-ad-slot-renderer id="ownerless"><div>Sponsored video</div><button>Visit site</button></ytd-ad-slot-renderer>' + shelf(short()));
  assert.equal(await visible(page, '#ownerless'), false);
  assert.equal(await visible(page, '#shelf'), false);
  await worker.evaluate(() => chrome.storage.local.set({ enabled: false }));
  await page.waitForFunction(() => !document.documentElement.classList.contains('yt-wl-hide-sponsored'));
  assert.equal(await visible(page, '#ownerless'), true);
  assert.equal(await visible(page, '#shelf'), true);
  assert.equal(await visible(page, '#modern-item'), true);
  assert.equal(await visible(page, '#regular'), true);
});

test('a video nested inside a hidden ad does not keep an ad-only shelf visible', async t => {
  const ad = `<ytd-ad-slot-renderer id="nested-ad"><ytd-in-feed-ad-layout-renderer>${regular('advertised-video')}</ytd-in-feed-ad-layout-renderer></ytd-ad-slot-renderer>`;
  const page = await fixture(t, shelf(ad), '/watch?v=allowed12345');
  assert.equal(await visible(page, '#nested-ad'), false);
  assert.equal(await visible(page, '#advertised-video'), false);
  assert.equal(await visible(page, '#shelf'), false);
  assert.equal(await visible(page, '#regular'), true);
});

test('an ad-only shelf is restored when an ordinary sibling arrives', async t => {
  const ad = `<ytd-ad-slot-renderer id="nested-ad"><ytd-in-feed-ad-layout-renderer>${regular('advertised-video')}</ytd-in-feed-ad-layout-renderer></ytd-ad-slot-renderer>`;
  const page = await fixture(t, shelf(ad), '/watch?v=allowed12345');
  assert.equal(await visible(page, '#shelf'), false);
  await page.locator('.ytGridShelfViewModelGridShelfRow').evaluate((row, html) => row.insertAdjacentHTML('beforeend', html), regular('ordinary-sibling'));
  await page.waitForFunction(() => document.querySelector('#ordinary-sibling')?.getAttribute('data-yt-wl-status') === 'allowed');
  assert.equal(await visible(page, '#shelf'), true);
  assert.equal(await visible(page, '#ordinary-sibling'), true);
  assert.equal(await visible(page, '#nested-ad'), false);
  assert.equal(await visible(page, '#advertised-video'), false);
});

test('adult bypass restores sponsored cards until protection resumes', async t => {
  const page = await fixture(t, sponsored());
  await worker.evaluate(() => chrome.storage.local.set({ bypassUntil: Date.now() + 60000 }));
  await page.waitForFunction(() => document.documentElement.classList.contains('yt-wl-bypassed'));
  assert.equal(await visible(page, '#sponsored'), true);
  await worker.evaluate(() => chrome.storage.local.set({ bypassUntil: 0 }));
  await page.waitForFunction(() => document.documentElement.classList.contains('yt-wl-hide-shorts'));
  assert.equal(await visible(page, '#sponsored'), false);
});

test('adult bypass restores Shorts and re-enabling protection hides them', async t => {
  const page = await fixture(t, shelf(short()));
  await worker.evaluate(() => chrome.storage.local.set({ bypassUntil: Date.now() + 60000 }));
  await page.waitForFunction(() => document.documentElement.classList.contains('yt-wl-bypassed'));
  assert.equal(await visible(page, '#modern-item'), true);
  assert.equal(await visible(page, '#shelf'), true);
  await worker.evaluate(() => chrome.storage.local.set({ bypassUntil: 0 }));
  await page.waitForFunction(() => document.documentElement.classList.contains('yt-wl-hide-shorts'));
  assert.equal(await visible(page, '#modern-item'), false);
  assert.equal(await visible(page, '#shelf'), false);
});

test('disabling strict search filtering restores every result wrapper', async t => {
  const nestedChannel = `<div id="nested-toggle-shell">${channelCard('nested-toggle-channel')}</div>`;
  const page = await fixture(t, channelCard('toggle-channel') + playlistCard('toggle-playlist') + unknownCard('toggle-unknown') +
    nestedChannel + `<ytd-rich-item-renderer id="toggle-rich-item">${regular('toggle-video')}</ytd-rich-item-renderer>`);
  for (const selector of ['#toggle-channel', '#toggle-playlist', '#toggle-unknown', '#nested-toggle-shell']) {
    assert.equal(await visible(page, selector), false, selector + ' should initially be blocked');
  }
  assert.equal(await visible(page, '#toggle-rich-item'), true);
  await worker.evaluate(() => chrome.storage.local.set({ hideNonWhitelisted: false }));
  await page.waitForFunction(() => !document.documentElement.classList.contains('yt-wl-hide-search-results'));
  for (const selector of ['#toggle-channel', '#toggle-playlist', '#toggle-unknown', '#toggle-rich-item']) {
    assert.equal(await visible(page, selector), true, selector + ' should be restored');
  }
  assert.equal(await page.locator('#nested-toggle-shell').getAttribute('data-yt-wl-search-blocked'), '');
  assert.equal(await visible(page, '#nested-toggle-shell'), false, 'generic containers are not hidden by the card marker rule');
});

test('adult bypass restores hidden search result cards until protection resumes', async t => {
  const page = await fixture(t, channelCard('bypass-channel') + playlistCard('bypass-playlist') + unknownCard('bypass-unknown'));
  for (const selector of ['#bypass-channel', '#bypass-playlist', '#bypass-unknown']) {
    assert.equal(await visible(page, selector), false, selector + ' should initially be blocked');
  }
  await worker.evaluate(() => chrome.storage.local.set({ bypassUntil: Date.now() + 60000 }));
  await page.waitForFunction(() => document.documentElement.classList.contains('yt-wl-bypassed'));
  for (const selector of ['#bypass-channel', '#bypass-playlist', '#bypass-unknown']) {
    assert.equal(await visible(page, selector), true, selector + ' should be restored during bypass');
  }
  await worker.evaluate(() => chrome.storage.local.set({ bypassUntil: 0 }));
  await page.waitForFunction(() => document.documentElement.classList.contains('yt-wl-hide-search-results'));
  for (const selector of ['#bypass-channel', '#bypass-playlist', '#bypass-unknown']) {
    assert.equal(await visible(page, selector), false, selector + ' should be filtered again');
  }
});

test('bypass restores search results hidden through an unrecognized wrapper', async t => {
  const wrappedChannel = `<div id="nested-result-shell">${channelCard('wrapped-channel')}</div>`;
  const page = await fixture(t, wrappedChannel);
  assert.equal(await visible(page, '#nested-result-shell'), false);
  await worker.evaluate(() => chrome.storage.local.set({ bypassUntil: Date.now() + 60000 }));
  await page.waitForFunction(() => document.documentElement.classList.contains('yt-wl-bypassed'));
  assert.equal(await visible(page, '#nested-result-shell'), true);
  assert.equal(await visible(page, '#wrapped-channel'), true);
});

test('disabling protection removes search result markers and restores wrappers', async t => {
  const wrappedChannel = `<div id="disabled-result-shell">${channelCard('disabled-channel')}</div>`;
  const page = await fixture(t, wrappedChannel);
  assert.equal(await visible(page, '#disabled-result-shell'), false);
  await worker.evaluate(() => chrome.storage.local.set({ enabled: false }));
  await page.waitForFunction(() => !document.documentElement.classList.contains('yt-wl-hide-sponsored'));
  assert.equal(await visible(page, '#disabled-result-shell'), true);
  assert.equal(await page.locator('#disabled-result-shell').getAttribute('data-yt-wl-search-blocked'), '');
  assert.equal(await page.locator('#disabled-result-shell').getAttribute('data-yt-wl-status'), null);
});

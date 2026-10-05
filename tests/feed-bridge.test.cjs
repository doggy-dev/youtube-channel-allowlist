const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'feed-bridge.js'), 'utf8');

function bridge(config = {}, pathname = '/results') {
  const context = vm.createContext({ Response, console });
  context.pathname = pathname;
  vm.runInContext(`
    window = globalThis;
    location = { origin: 'https://www.youtube.com', pathname };
    const listeners = [];
    window.addEventListener = (type, listener) => {
      if (type === 'message') listeners.push(listener);
    };
    window.postMessage = data => {
      for (const listener of listeners) listener({ source: window, data });
    };
    window.fetch = async () => new Response(JSON.stringify(fetchPayload));
    XMLHttpRequest = class {
      open() {}
      send() {}
    };
  `, context);
  vm.runInContext(source, context, { filename: 'feed-bridge.js' });

  function configure(changes) {
    context.config = {
      type: 'YT_WL_FEED_CONFIG', enabled: true, hideShorts: true,
      failClosed: true, bypassed: false,
      channels: [{ channelId: 'UCallowed', handle: '@allowed' }],
      ...changes
    };
    vm.runInContext('window.postMessage(config)', context);
  }
  configure(config);

  return {
    configure,
    initial(payload) {
      context.input = JSON.stringify(payload);
      return JSON.parse(vm.runInContext(`
        window.ytInitialData = JSON.parse(input);
        JSON.stringify(window.ytInitialData);
      `, context));
    },
    async fetch(payload) {
      context.fetchPayload = payload;
      const response = await vm.runInContext("window.fetch('/youtubei/v1/search')", context);
      return response.json();
    }
  };
}

function short(id = 'short-1') {
  return {
    shortsLockupViewModel: {
      entityId: id,
      onTap: {
        innertubeCommand: {
          commandMetadata: { webCommandMetadata: { url: '/shorts/' + id } },
          reelWatchEndpoint: { videoId: id }
        }
      }
    }
  };
}

function video(id = 'regular-1', channelId = 'UCallowed') {
  return { videoRenderer: { videoId: id, channelId, title: { simpleText: id } } };
}

function videoLockup(id = 'lockup-video') {
  return {
    lockupViewModel: {
      contentType: 'LOCKUP_CONTENT_TYPE_VIDEO',
      contentId: id,
      channelId: 'UCallowed',
      rendererContext: {
        commandContext: {
          onTap: {
            innertubeCommand: {
              watchEndpoint: { videoId: id },
              commandMetadata: { webCommandMetadata: { url: '/watch?v=' + id } }
            }
          }
        }
      }
    }
  };
}

function grid(contents, extra = {}) {
  return { gridShelfViewModel: { contents, ...extra } };
}

function search(items) {
  return {
    contents: {
      twoColumnSearchResultsRenderer: {
        primaryContents: {
          sectionListRenderer: {
            contents: [{ itemSectionRenderer: { contents: items } }]
          }
        }
      }
    }
  };
}

function results(payload) {
  return payload.contents.twoColumnSearchResultsRenderer.primaryContents
    .sectionListRenderer.contents[0].itemSectionRenderer.contents;
}

test('search feed preserves videos and non-video items for reversible DOM filtering', () => {
  const channel = { channelRenderer: { channelId: 'UCallowed', title: { simpleText: 'Allowed channel' } } };
  const playlist = {
    lockupViewModel: {
      contentId: 'PL-mix',
      contentType: 'LOCKUP_CONTENT_TYPE_PLAYLIST',
      channelId: 'UCallowed'
    }
  };
  const unknownCard = { unknownSearchCardRenderer: { title: { simpleText: 'Unknown result' } } };
  const heading = { sectionHeaderRenderer: { title: { simpleText: 'Search results' } } };
  const continuation = { continuationItemRenderer: { trigger: 'CONTINUATION_TRIGGER_ON_ITEM_SHOWN' } };
  const filtered = bridge().initial(search([
    video(), video('blocked', 'UCblocked'), channel, playlist, unknownCard, heading, continuation
  ]));

  assert.deepEqual(results(filtered), [video(), video('blocked', 'UCblocked'), channel, playlist, unknownCard, heading, continuation]);
});

test('typed allowlisted video lockups survive strict search filtering', () => {
  const filtered = bridge().initial(search([videoLockup()]));
  assert.deepEqual(results(filtered), [videoLockup()]);
});

test('playlist lockups are not destructively classified as videos', () => {
  const playlist = {
    lockupViewModel: {
      contentId: 'PL-blocked',
      contentType: 'LOCKUP_CONTENT_TYPE_PLAYLIST',
      channelId: 'UCblocked'
    }
  };
  assert.deepEqual(results(bridge().initial(search([playlist]))), [playlist]);
});

test('off-page feed payloads retain unknown non-video items', () => {
  const payload = { contents: [{ unknownSearchCardRenderer: { title: { simpleText: 'Unknown result' } } }] };
  const filtered = bridge({}, '/feed/subscriptions').initial(payload);
  assert.deepEqual(filtered, payload);
});

test('initial search data removes modern Shorts-only shelves', () => {
  const filtered = bridge().initial(search([video(), grid([short()])]));
  assert.deepEqual(results(filtered), [video()]);
});

test('mixed modern search shelves retain regular videos for DOM whitelist filtering', () => {
  const header = {
    sectionHeaderViewModel: {
      leadingAccessory: {
        image: { sources: [{ clientResource: { imageName: 'YOUTUBE_SHORTS_BRAND_24' } }] }
      }
    }
  };
  const filtered = bridge().initial(search([grid([short(), video(), video('blocked', 'UCblocked')], { header })]));
  assert.deepEqual(results(filtered), [grid([video(), video('blocked', 'UCblocked')], { header })]);
});

test('typed modern Shorts are removed before their endpoints hydrate', () => {
  const filtered = bridge().initial(search([{ shortsLockupViewModel: { entityId: 'pending-short' } }, video()]));
  assert.deepEqual(results(filtered), [video()]);
});

test('fetch search responses remove modern Shorts', async () => {
  const filtered = await bridge().fetch(search([grid([short()]), video()]));
  assert.deepEqual(results(filtered), [video()]);
});

test('nested modern grids retain continuations while filtering Shorts', () => {
  const continuation = { continuationItemRenderer: { trigger: 'CONTINUATION_TRIGGER_ON_ITEM_SHOWN' } };
  const filtered = bridge().initial({ contents: [grid([short(), continuation])] });
  assert.deepEqual(filtered, { contents: [grid([continuation])] });
});

test('search bridge removes Shorts but preserves regular cards for DOM filtering', () => {
  const filtered = bridge().initial(search([
    { reelItemRenderer: { videoId: 'legacy-short', channelId: 'UCallowed' } },
    video(), video('blocked', 'UCblocked'),
    { videoRenderer: { videoId: 'unknown' } }
  ]));
  assert.deepEqual(results(filtered), [video(), video('blocked', 'UCblocked'), { videoRenderer: { videoId: 'unknown' } }]);
});

test('non-search feeds retain channel filtering and fail-closed behavior', () => {
  const filtered = bridge({}, '/feed/subscriptions').initial({ contents: [
    { reelItemRenderer: { videoId: 'legacy-short', channelId: 'UCallowed' } },
    video(), video('blocked', 'UCblocked'),
    { videoRenderer: { videoId: 'unknown' } }
  ] });
  assert.deepEqual(filtered.contents, [video()]);
});

test('ordinary portrait grids are not treated as Shorts shelves', () => {
  const shelf = grid([video()], { contentAspectRatio: 'GRID_SHELF_CONTENT_ASPECT_RATIO_TWO_BY_THREE' });
  assert.deepEqual(results(bridge().initial(search([shelf]))), [shelf]);
});

for (const config of [{ enabled: false }, { bypassed: true }]) {
  test('inactive feed protection passes through ' + JSON.stringify(config), () => {
    const payload = search([grid([short(), video('blocked', 'UCblocked')])]);
    assert.deepEqual(bridge(config).initial(payload), payload);
  });
}

test('turning off Shorts hiding permits an allowed Shorts item', () => {
  const item = short();
  item.shortsLockupViewModel.channelId = 'UCallowed';
  assert.deepEqual(results(bridge({ hideShorts: false }).initial(search([item]))), [item]);
});

test('repeated filtering preserves regular results', () => {
  const filter = bridge();
  const once = filter.initial(search([grid([short(), video()])]));
  assert.deepEqual(filter.initial(once), search([grid([video()])]));
});

for (const renderer of [
  'adSlotRenderer', 'inFeedAdLayoutRenderer', 'promotedVideoRenderer',
  'promotedSparklesWebRenderer', 'promotedSparklesTextSearchRenderer',
  'displayAdRenderer', 'searchPyvRenderer'
]) {
  test('initial search removes sponsored ' + renderer + ' entries', () => {
    const ad = { [renderer]: { content: video('advertised') } };
    assert.deepEqual(results(bridge().initial(search([ad, video()]))), [video()]);
  });
}

test('fetch responses remove sponsored slots wrapping allowed videos', async () => {
  const ad = { adSlotRenderer: { fulfillmentContent: { inFeedAdLayoutRenderer: { content: video() } } } };
  assert.deepEqual(results(await bridge().fetch(search([ad, video()]))), [video()]);
});

test('rich items wrapping sponsored content are removed', () => {
  const ad = { richItemRenderer: { content: { adSlotRenderer: {} } } };
  assert.deepEqual(results(bridge().initial(search([ad, video()]))), [video()]);
});

test('sponsored-only modern grids are removed without hiding mixed grids', () => {
  const ad = { adSlotRenderer: {} };
  assert.deepEqual(results(bridge().initial(search([grid([ad]), grid([ad, video()])]))), [grid([video()])]);
});

test('videos discussing sponsorship are not treated as advertising', () => {
  const item = video();
  item.videoRenderer.title.simpleText = 'How sponsored videos work';
  assert.deepEqual(results(bridge().initial(search([item]))), [item]);
});

for (const config of [{ enabled: false }, { bypassed: true }]) {
  test('inactive protection leaves sponsored entries unchanged ' + JSON.stringify(config), () => {
    const payload = search([{ adSlotRenderer: {} }, video()]);
    assert.deepEqual(bridge(config).initial(payload), payload);
  });
}

test('protection resumes after adult bypass ends', () => {
  const filter = bridge({ bypassed: true });
  const payload = search([grid([short()]), video()]);
  assert.deepEqual(filter.initial(payload), payload);
  filter.configure({ bypassed: false });
  assert.deepEqual(results(filter.initial(payload)), [video()]);
});

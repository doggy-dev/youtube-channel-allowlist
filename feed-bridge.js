// MAIN-world feed filter: strip non-whitelisted items from ytInitialData + youtubei fetch/XHR
// before YouTube paints cards. Whitelist-only (opposite of commercial blacklist interceptor).
(function () {
  'use strict';
  if (window.__ytWlFeedBridge) return;
  window.__ytWlFeedBridge = true;

  let enabled = true;
  let hideShorts = true;
  let failClosed = true; // drop items with no resolvable channel
  let bypassed = false;
  /** @type {{ ids: Set<string>, handles: Set<string> }} */
  let allow = { ids: new Set(), handles: new Set() };

  function normHandle(h) {
    return String(h || '')
      .toLowerCase()
      .replace(/^@/, '')
      .trim();
  }

  function setAllowList(channels) {
    const ids = new Set();
    const handles = new Set();
    (channels || []).forEach((ch) => {
      if (ch && ch.channelId) ids.add(String(ch.channelId).trim());
      const h = normHandle(ch && (ch.handle || ch.vanity || ch.customUrl));
      if (h) handles.add(h);
    });
    allow = { ids, handles };
  }

  function isAllowedChannel(channelId, handle) {
    if (bypassed) return true;
    if (!enabled) return true;
    if (allow.ids.size === 0 && allow.handles.size === 0) return false;
    if (channelId && allow.ids.has(String(channelId).trim())) return true;
    const h = normHandle(handle);
    if (h && allow.handles.has(h)) return true;
    return false;
  }

  function textFrom(obj) {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    if (obj.simpleText) return obj.simpleText;
    if (Array.isArray(obj.runs)) return obj.runs.map((r) => r.text || '').join('');
    return '';
  }

  function handleFromUrl(url) {
    if (!url) return '';
    const m = String(url).match(/\/@([a-zA-Z0-9_.-]+)/);
    if (m) return m[1];
    const vanity = String(url).match(/^\/([A-Za-z0-9_-]{2,100})(?:\/|$)/);
    if (vanity && !['watch', 'channel', 'c', 'user', 'feed', 'results', 'shorts', 'playlist'].includes(vanity[1].toLowerCase())) {
      return vanity[1];
    }
    return '';
  }

  function channelFromEndpoint(ep) {
    if (!ep) return { channelId: '', handle: '' };
    const browse = ep.browseEndpoint || {};
    const channelId = browse.browseId && String(browse.browseId).startsWith('UC') ? browse.browseId : '';
    const handle =
      handleFromUrl(browse.canonicalBaseUrl) ||
      handleFromUrl(ep.commandMetadata && ep.commandMetadata.webCommandMetadata && ep.commandMetadata.webCommandMetadata.url);
    return { channelId, handle };
  }

  function channelFromOwner(ownerText) {
    const run = ownerText && ownerText.runs && ownerText.runs[0];
    if (!run) return { channelId: '', handle: '' };
    return channelFromEndpoint(run.navigationEndpoint);
  }

  /**
   * Extract video-ish identity from a renderer object.
   * Returns null if this node is not a video item we care about.
   */
  function extractVideoMeta(node) {
    if (!node || typeof node !== 'object') return null;

    let r =
      node.videoRenderer ||
      node.gridVideoRenderer ||
      node.compactVideoRenderer ||
      node.reelItemRenderer ||
      node.shortsLockupViewModel ||
      node.playlistVideoRenderer ||
      node.lockupViewModel ||
      null;

    // richItemRenderer wraps another renderer
    if (!r && node.richItemRenderer && node.richItemRenderer.content) {
      return extractVideoMeta(node.richItemRenderer.content);
    }

    // Newer lockups can represent videos, playlists, mixes, or channels.
    if (node.lockupViewModel) {
      const lockup = node.lockupViewModel;
      try {
        const meta = lockup.metadata || lockup.contentMetadata || {};
        const channelId = lockup.channelId || meta.channelId || '';
        const command =
          lockup.rendererContext?.commandContext?.onTap?.innertubeCommand ||
          lockup.onTap?.innertubeCommand ||
          {};
        const endpoint = command.watchEndpoint || {};
        const url = command.commandMetadata?.webCommandMetadata?.url || '';
        if (url.includes('/shorts/')) {
          return { videoId: 'shorts', title: '', channelId: '', handle: '', isShorts: true };
        }

        const contentType = String(lockup.contentType || '').toUpperCase();
        const isVideo = contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' || !!endpoint.videoId;
        const videoId = endpoint.videoId || lockup.videoId ||
          (contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' ? lockup.contentId : '');
        if (isVideo && videoId) {
          return {
            videoId,
            title: '',
            channelId,
            handle: handleFromUrl(url),
            isShorts: false
          };
        }
      } catch (e) {}
    }

    if (!r) return null;

    const endpoint = r.navigationEndpoint || r.onTap?.innertubeCommand;
    const videoId = r.videoId || endpoint?.watchEndpoint?.videoId || null;
    const reelId = r.videoId || endpoint?.reelWatchEndpoint?.videoId;
    const isShorts = !!(
      node.reelItemRenderer ||
      node.shortsLockupViewModel ||
      endpoint?.reelWatchEndpoint ||
      (endpoint?.commandMetadata?.webCommandMetadata?.url || '').includes('/shorts/')
    );

    if (!videoId && !reelId && !isShorts) return null;

    const title = textFrom(r.title) || textFrom(r.headline) || '';
    let channelId = r.channelId || '';
    let handle = '';

    const owner = channelFromOwner(r.ownerText || r.shortBylineText || r.longBylineText);
    channelId = channelId || owner.channelId;
    handle = owner.handle;

    if (!channelId && r.navigationEndpoint) {
      // no-op for watch endpoint
    }

    return {
      videoId: videoId || reelId || (isShorts ? 'shorts' : ''),
      title,
      channelId,
      handle,
      isShorts
    };
  }

  function pageChannelFromLocation() {
    try {
      const path = location.pathname || '';
      const at = path.match(/^\/(@[a-zA-Z0-9_.-]+)/);
      if (at) return { handle: at[1].slice(1), channelId: '' };
      const id = path.match(/^\/channel\/([a-zA-Z0-9_-]+)/);
      if (id) return { handle: '', channelId: id[1] };
      const cu = path.match(/^\/(c|user)\/([a-zA-Z0-9_.-]+)/);
      if (cu) return { handle: cu[2], channelId: '' };
      const parts = path.split('/').filter(Boolean);
      if (parts[0] && !['watch', 'results', 'feed', 'shorts', 'playlist', 'gaming', 'music'].includes(parts[0].toLowerCase())) {
        if (/^[A-Za-z0-9_-]{2,100}$/.test(parts[0]) && (!parts[1] || /^(featured|videos|streams|playlists|community|channels|about|shorts)$/i.test(parts[1]))) {
          return { handle: parts[0], channelId: '' };
        }
      }
    } catch (e) {}
    return null;
  }

  function onAllowedChannelPage() {
    const page = pageChannelFromLocation();
    if (!page) return false;
    return isAllowedChannel(page.channelId, page.handle);
  }

  const SPONSORED_RENDERERS = [
    'adSlotRenderer',
    'inFeedAdLayoutRenderer',
    'promotedVideoRenderer',
    'promotedSparklesWebRenderer',
    'promotedSparklesTextSearchRenderer',
    'displayAdRenderer',
    'searchPyvRenderer'
  ];

  function isSponsoredItem(node) {
    if (!node || typeof node !== 'object') return false;
    if (SPONSORED_RENDERERS.some((key) => node[key])) return true;
    return !!(node.richItemRenderer && isSponsoredItem(node.richItemRenderer.content));
  }

  function shouldKeepItem(node) {
    if (bypassed || !enabled) return true;
    if (isSponsoredItem(node)) return false;

    const meta = extractVideoMeta(node);
    if (!meta) {
      // Search-card pruning is handled reversibly in the DOM layer.
      return true;
    }

    if (hideShorts && meta.isShorts) return false;

    // Search cards are filtered reversibly after YouTube renders them.
    if (location.pathname === '/results') return true;

    if (meta.channelId || meta.handle) {
      return isAllowedChannel(meta.channelId, meta.handle);
    }

    // Channel /videos tabs often omit per-item owner — trust page URL if allowed
    if (onAllowedChannelPage()) return true;

    // Unknown channel on a video-like item
    return failClosed ? false : true;
  }

  function filterArray(arr) {
    if (!Array.isArray(arr)) return arr;
    const out = [];
    let dropped = 0;
    for (const item of arr) {
      if (shouldKeepItem(item)) {
        // Also filter nested contents if present
        const grid = item && item.gridShelfViewModel;
        const hadBlockedItems = Array.isArray(grid?.contents) && grid.contents.some((entry) =>
          isSponsoredItem(entry) || (hideShorts && extractVideoMeta(entry)?.isShorts)
        );
        filterTree(item);
        if (hadBlockedItems && grid.contents.length === 0) {
          dropped++;
        } else {
          out.push(item);
        }
      } else {
        dropped++;
      }
    }
    if (dropped > 0) {
      try {
        window.postMessage({ type: 'YT_WL_FEED_FILTERED', dropped }, location.origin);
      } catch (e) {}
    }
    return out;
  }

  function filterTree(root) {
    if (!root || typeof root !== 'object') return root;

    // Common list containers
    if (Array.isArray(root.contents)) {
      root.contents = filterArray(root.contents);
      root.contents.forEach(filterTree);
    }
    if (Array.isArray(root.items)) {
      root.items = filterArray(root.items);
      root.items.forEach(filterTree);
    }
    if (Array.isArray(root.results)) {
      root.results = filterArray(root.results);
      root.results.forEach(filterTree);
    }

    // Nested known structures
    const nestedKeys = [
      'richGridRenderer',
      'sectionListRenderer',
      'itemSectionRenderer',
      'shelfRenderer',
      'horizontalListRenderer',
      'gridRenderer',
      'gridShelfViewModel',
      'playlistVideoListRenderer',
      'twoColumnSearchResultsRenderer',
      'twoColumnBrowseResultsRenderer',
      'twoColumnWatchNextResults',
      'secondaryResults',
      'primaryContents',
      'tabRenderer',
      'richSectionRenderer',
      'richShelfRenderer',
      'reelShelfRenderer'
    ];

    for (const key of nestedKeys) {
      if (root[key]) filterTree(root[key]);
    }

    // Tabs array
    if (Array.isArray(root.tabs)) {
      root.tabs.forEach(filterTree);
    }

    // Watch next / secondary
    if (root.results && typeof root.results === 'object' && !Array.isArray(root.results)) {
      filterTree(root.results);
    }

    return root;
  }

  function filterPayload(data) {
    if (!data || typeof data !== 'object') return data;
    if (bypassed || !enabled) return data;
    try {
      filterTree(data);
      // Explicit paths commercial also hits (belt and suspenders)
      const search =
        data.contents &&
        data.contents.twoColumnSearchResultsRenderer &&
        data.contents.twoColumnSearchResultsRenderer.primaryContents &&
        data.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer;
      if (search && Array.isArray(search.contents)) {
        search.contents.forEach((section) => {
          if (section.itemSectionRenderer && Array.isArray(section.itemSectionRenderer.contents)) {
            section.itemSectionRenderer.contents = filterArray(section.itemSectionRenderer.contents);
          }
        });
      }
    } catch (e) {
      // Fail open on filter bugs so we don't break YouTube entirely
      console.warn('[YT-WL feed-bridge] filter error', e);
    }
    return data;
  }

  // ---- ytInitialData hook ----
  let storedInitial = window.ytInitialData;
  try {
    Object.defineProperty(window, 'ytInitialData', {
      configurable: true,
      enumerable: true,
      get: function () {
        return storedInitial;
      },
      set: function (value) {
        storedInitial = filterPayload(value);
      }
    });
    if (storedInitial) storedInitial = filterPayload(storedInitial);
  } catch (e) {
    console.warn('[YT-WL feed-bridge] ytInitialData hook failed', e);
  }

  // ---- fetch hook ----
  const originalFetch = window.fetch;
  try {
    window.fetch = function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : args[0] && args[0].url ? args[0].url : '';
      const p = originalFetch.apply(this, args);
      if (!url || url.indexOf('/youtubei/v1/') === -1) return p;
      if (bypassed || !enabled) return p;

      return p
        .then((response) => {
          const clone = response.clone();
          return clone
            .json()
            .then((json) => {
              filterPayload(json);
              return new Response(JSON.stringify(json), {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers
              });
            })
            .catch(() => response);
        })
        .catch((err) => {
          throw err;
        });
    };
  } catch (e) {
    console.warn('[YT-WL feed-bridge] fetch hook failed', e);
  }

  // ---- XHR hook (some endpoints still use it) ----
  try {
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__ytWlUrl = url;
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      if (
        !bypassed &&
        enabled &&
        this.__ytWlUrl &&
        String(this.__ytWlUrl).indexOf('/youtubei/v1/') !== -1
      ) {
        this.addEventListener('load', function () {
          try {
            if (this.responseType && this.responseType !== '' && this.responseType !== 'text') return;
            const text = this.responseText;
            if (!text || (text[0] !== '{' && text[0] !== '[')) return;
            const json = JSON.parse(text);
            filterPayload(json);
            Object.defineProperty(this, 'responseText', {
              configurable: true,
              get: function () {
                return JSON.stringify(json);
              }
            });
            try {
              Object.defineProperty(this, 'response', {
                configurable: true,
                get: function () {
                  return JSON.stringify(json);
                }
              });
            } catch (e) {}
          } catch (e) {}
        });
      }
      return origSend.apply(this, arguments);
    };
  } catch (e) {
    console.warn('[YT-WL feed-bridge] XHR hook failed', e);
  }

  // ---- settings from content script ----
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    if (data.type === 'YT_WL_FEED_CONFIG') {
      enabled = data.enabled !== false;
      hideShorts = !!data.hideShorts;
      failClosed = data.failClosed !== false;
      bypassed = !!data.bypassed;
      setAllowList(data.channels || []);
      // Re-filter current boot data if present
      if (storedInitial) {
        try {
          storedInitial = filterPayload(storedInitial);
        } catch (e) {}
      }
    }

    if (data.type === 'YT_WL_REQUEST_FEED_STATUS') {
      try {
        window.postMessage(
          {
            type: 'YT_WL_FEED_STATUS',
            enabled,
            bypassed,
            allowIds: allow.ids.size,
            allowHandles: allow.handles.size
          },
          location.origin
        );
      } catch (e) {}
    }
  });

  // Announce ready so content script can push config
  try {
    window.postMessage({ type: 'YT_WL_FEED_BRIDGE_READY' }, location.origin);
  } catch (e) {}
})();

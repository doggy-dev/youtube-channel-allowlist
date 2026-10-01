// Smart Popup Blocker Pro - Content Script (Camouflaged Edition)
(function () {
  'use strict';

  // State
  let settings = {
    enabled: true,
    hideNonWhitelisted: true,
    blockHoverPreview: true,
    blockWatchPlayback: true,
    hideShorts: true,
    hideAds: true,
    feedDataFilter: true,
    showPageButtons: false,
    parentPassword: 'varna',
    bypassUntil: 0,
    whitelist: []
  };

  let isWatchBlocked = false;
  let currentBlockedVideoId = null;
  let allowedWatchVideoId = null; // once allowed for this /watch?v=, never re-hold
  let debounceFilterTimer = null;
  let observer = null;
  let bypassExpiryTimer = null;
  let pendingWatchCheckTimer = null;

  // Media hold state machine (commercial-style locked/unlocked)
  // unlocked | pending | locked
  let mediaHoldState = 'unlocked';
  let mediaHoldKey = null;
  let mediaHoldTimer = null;
  let lastPlayerMeta = null; // { channelId, handle, name, videoId, source, at }

  function isBypassed() {
    return !!(settings.bypassUntil && settings.bypassUntil > Date.now());
  }

  function isWatchLikePage() {
    const path = window.location.pathname || '';
    return path.startsWith('/watch') || path.startsWith('/embed/') || path.startsWith('/live/');
  }

  // Top-level YouTube paths that are NOT custom channel vanity URLs
  const RESERVED_YT_ROOTS = new Set([
    'watch', 'shorts', 'feed', 'results', 'playlist', 'playlists', 'channel', 'c', 'user',
    'gaming', 'music', 'podcasts', 'sports', 'premium', 'account', 'reporthistory',
    'creators', 'creator', 'live', 'embed', 'hashtag', 'kids', 'about', 'ads', 't',
    'howyoutubeworks', 'new', 'paid_memberships', 'redirect', 'pair', 'upload',
    'dashboard', 'signin', 'signup', 'logout', 'oops', 'error', 'unsupported_browsers',
    'iframe_api', 'api', 'youtubei', 's', 'img', 'yts', 'account_advanced',
    'account_notifications', 'account_privacy', 'account_sharing', 'account_playback',
    'attribution_link', 'audiolibrary', 'cards', 'comment', 'comments', 'get_video_info',
    'login', 'logout', 'oembed', 'profile', 'share', 'subscribe_ajax', 'timeline',
    'verify_age', 'youtube'
  ]);

  const CHANNEL_TAB_NAMES = new Set([
    'featured', 'videos', 'streams', 'live', 'playlists', 'community', 'channels',
    'about', 'shorts', 'podcasts', 'releases', 'courses', 'store', 'search'
  ]);

  // /TheRoyalInstitution or /TheRoyalInstitution/videos (no @ /channel/ prefix)
  function getVanitySlugFromPath(path) {
    const parts = (path || '').split('/').filter(Boolean);
    if (parts.length === 0) return null;
    const root = parts[0];
    if (!root || root.startsWith('@')) return null;
    if (RESERVED_YT_ROOTS.has(root.toLowerCase())) return null;
    if (!/^[A-Za-z0-9_-]{2,100}$/.test(root)) return null;
    if (parts.length > 1 && !CHANNEL_TAB_NAMES.has(parts[1].toLowerCase())) return null;
    return root;
  }

  function isChannelPage() {
    const path = window.location.pathname || '';
    return (
      path.startsWith('/@') ||
      path.startsWith('/channel/') ||
      path.startsWith('/c/') ||
      path.startsWith('/user/') ||
      !!getVanitySlugFromPath(path)
    );
  }

  function needsPlaybackGate() {
    return isWatchLikePage() || isChannelPage();
  }

  function getChannelFromUrl() {
    const path = window.location.pathname || '';
    const handleMatch = path.match(/^\/(@[a-zA-Z0-9_.-]+)/);
    if (handleMatch) {
      return { handle: handleMatch[1], channelId: null, name: handleMatch[1] };
    }
    const idMatch = path.match(/^\/channel\/([a-zA-Z0-9_-]+)/);
    if (idMatch) {
      return { handle: null, channelId: idMatch[1], name: idMatch[1] };
    }
    const customMatch = path.match(/^\/(c|user)\/([a-zA-Z0-9_.-]+)/);
    if (customMatch) {
      return { handle: `@${customMatch[2]}`, channelId: null, name: customMatch[2] };
    }
    const vanity = getVanitySlugFromPath(path);
    if (vanity) {
      // Treat vanity custom URL as a handle-equivalent for whitelist matching
      return { handle: `@${vanity}`, channelId: null, name: vanity, vanity };
    }
    return null;
  }

  function scheduleBypassExpiry() {
    if (bypassExpiryTimer) {
      clearTimeout(bypassExpiryTimer);
      bypassExpiryTimer = null;
    }

    if (!settings.bypassUntil || settings.bypassUntil <= Date.now()) {
      return;
    }

    const delay = Math.min(settings.bypassUntil - Date.now() + 50, 2147483647);
    bypassExpiryTimer = setTimeout(() => {
      bypassExpiryTimer = null;
      settings.bypassUntil = 0;
      chrome.storage.local.set({ bypassUntil: 0 }).catch(() => {});
      applyBypassState();
      filterAllVideos();
      if (needsPlaybackGate()) {
        checkWatchPage();
      }
    }, delay);
  }

  function applySettingsClasses() {
    const root = document.documentElement;
    root.classList.toggle('yt-wl-hide-shorts', !!(settings.enabled && settings.hideShorts && !isBypassed()));
    root.classList.toggle('yt-wl-hide-ads', !!(settings.enabled && settings.hideAds !== false && !isBypassed()));
    root.classList.toggle('yt-wl-block-preview', !!(settings.enabled && settings.blockHoverPreview && !isBypassed()));
  }

  // Destinations that should never be reachable in child mode
  const BLOCKED_PATH_PREFIXES = [
    '/gaming',
    '/feed/hype',
    '/feed/trending',
    '/feed/explore',
    '/feed/storefront',
    '/feed/guide_builder',
    '/feed/library',
    '/feed/history',
    '/feed/subscriptions',
    '/reporthistory',
    '/creators',
    '/creator',
    '/music',
    '/podcasts',
    '/sports',
    '/channel/UC-9-kyTW8ZkZNDHQJ6FgpwQ', // Music topic
    '/channel/UCEgdi0XIXXZ-qJOFPf4JSKw', // Sports topic
    '/channel/UCrXUsMBzfFTVWEY8qaVXCdQ', // Gaming topic sometimes
    '/hashtag',
    '/premium',
    '/paid_memberships',
    '/account',
    '/account_',
    '/kids',
    '/howyoutubeworks',
    '/t/',
    '/about',
    '/ads',
    '/new'
  ];

  function isBlockedDestination(urlLike) {
    try {
      const raw = String(urlLike || '');
      const url = raw.startsWith('http')
        ? new URL(raw)
        : new URL(raw, 'https://www.youtube.com');
      if (!/youtube\.com$/i.test(url.hostname) && !/\.youtube\.com$/i.test(url.hostname)) {
        return false;
      }
      const path = url.pathname || '/';
      return BLOCKED_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + '/'));
    } catch (e) {
      return false;
    }
  }

  function redirectIfBlockedPath() {
    if (isBypassed()) return false;
    if (isBlockedDestination(window.location.href)) {
      try { window.stop(); } catch (e) {}
      window.location.replace('https://www.youtube.com/');
      return true;
    }
    return false;
  }

  // Intercept History API (client-side SPA navigation)
  try {
    const origPush = history.pushState;
    history.pushState = function (state, title, url) {
      if (!isBypassed()) {
        if (settings.hideShorts && url && String(url).includes('/shorts')) {
          window.location.replace('https://www.youtube.com/');
          return;
        }
        if (url && isBlockedDestination(url)) {
          window.location.replace('https://www.youtube.com/');
          return;
        }
      }
      return origPush.apply(this, arguments);
    };

    const origReplace = history.replaceState;
    history.replaceState = function (state, title, url) {
      if (!isBypassed()) {
        if (settings.hideShorts && url && String(url).includes('/shorts')) {
          window.location.replace('https://www.youtube.com/');
          return;
        }
        if (url && isBlockedDestination(url)) {
          window.location.replace('https://www.youtube.com/');
          return;
        }
      }
      return origReplace.apply(this, arguments);
    };
  } catch (e) {}

  // Intercept clicks on Shorts + blocked sidebar destinations
  window.addEventListener(
    'click',
    (e) => {
      if (isBypassed()) return;
      const a = e.target.closest && e.target.closest('a');
      if (!a || !a.href) return;

      if (settings.hideShorts && a.href.includes('/shorts')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        window.location.href = 'https://www.youtube.com/';
        return false;
      }

      if (isBlockedDestination(a.href)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        window.location.href = 'https://www.youtube.com/';
        return false;
      }
    },
    true
  );

  // Initialize
  async function init() {
    try {
      const data = await chrome.storage.local.get(null);
      if (data) {
        settings = { ...settings, ...data };
      }
    } catch (e) {
      console.warn('Storage get failed', e);
    }

    applyBypassState();

    if (redirectIfBlockedPath()) return;

    if (!isBypassed() && settings.hideShorts && window.location.pathname.startsWith('/shorts')) {
      try { window.stop(); } catch (e) {}
      window.location.replace('https://www.youtube.com/');
      return;
    }

    syncFeedBridgeConfig();
    setupPreviewBlockerListeners();
    startObserver();
    filterAllVideos();
    handlePageChange();
    setupListeners();
  }

  function applyBypassState() {
    scheduleBypassExpiry();
    applySettingsClasses();
    syncFeedBridgeConfig();

    if (isBypassed()) {
      document.documentElement.classList.add('yt-wl-bypassed');
      releaseMediaHold(null);
      removeWatchOverlay();
      unblockAllVideos();
      removeMyChannelsHub();
    } else {
      document.documentElement.classList.remove('yt-wl-bypassed');
      // Fail-closed for non-whitelisted channel pages as early as possible
      if (isChannelPage() && settings.blockWatchPlayback && isCurrentChannelPageAllowed() !== true) {
        engageMediaHold('locked', 'channel:' + window.location.pathname, { killSrc: true });
      }
      injectMyChannelsGuideLinks();
      if (window.location.pathname === '/' || window.location.hash === '#my-channels') {
        renderMyChannelsHub();
      }
    }
  }

  function unblockAllVideos() {
    document.querySelectorAll('.yt-wl-blocked, [data-yt-wl-status="blocked"], [data-yt-wl-status="pending"]').forEach((el) => {
      el.classList.remove('yt-wl-blocked');
      el.removeAttribute('data-yt-wl-status');
    });
    document.querySelectorAll('.yt-wl-empty-shelf').forEach((el) => {
      el.classList.remove('yt-wl-empty-shelf');
    });
  }

  // ================= MAIN-WORLD BRIDGES (registered via manifest world: MAIN) =================
  // player-bridge.js + feed-bridge.js run in the page world automatically.
  // We only sync whitelist/config over window.postMessage.

  function syncFeedBridgeConfig() {
    try {
      const channels = (settings.whitelist || []).map((ch) => ({
        channelId: ch.channelId || '',
        handle: ch.handle || '',
        vanity: ch.vanity || ch.customUrl || ''
      }));
      window.postMessage(
        {
          type: 'YT_WL_FEED_CONFIG',
          enabled: !!(settings.enabled && settings.feedDataFilter && settings.hideNonWhitelisted),
          hideShorts: !!settings.hideShorts,
          hideAds: settings.hideAds !== false,
          failClosed: true,
          bypassed: isBypassed(),
          channels
        },
        location.origin
      );
    } catch (e) {}
  }

  function requestPlayerMeta() {
    try {
      window.postMessage({ type: 'YT_WL_REQUEST_META' }, location.origin);
    } catch (e) {}
  }

  function mergeChannelInfo(base, extra) {
    if (!extra) return base;
    if (!base) return { ...extra };
    return {
      handle: base.handle || extra.handle || null,
      channelId: base.channelId || extra.channelId || null,
      name: base.name || extra.name || null,
      vanity: base.vanity || extra.vanity || null
    };
  }

  function extractChannelFromInlinePlayerScripts() {
    // Isolated-world fallback: scrape channelId/handle from embedded boot JSON
    try {
      const scripts = document.querySelectorAll('script');
      let channelId = null;
      let handle = null;
      let name = null;
      let videoId = null;

      for (const script of scripts) {
        const text = script.textContent || '';
        if (!text.includes('ytInitialPlayerResponse') && !text.includes('videoDetails')) continue;

        if (!channelId) {
          const idMatch = text.match(/"channelId"\s*:\s*"(UC[a-zA-Z0-9_-]{20,})"/);
          if (idMatch) channelId = idMatch[1];
        }
        if (!channelId) {
          const extMatch = text.match(/"externalChannelId"\s*:\s*"(UC[a-zA-Z0-9_-]{20,})"/);
          if (extMatch) channelId = extMatch[1];
        }
        if (!handle) {
          const hMatch = text.match(/"ownerProfileUrl"\s*:\s*"[^"]*?\/(@[a-zA-Z0-9_.-]+)"/);
          if (hMatch) handle = hMatch[1];
        }
        if (!name) {
          const aMatch = text.match(/"author"\s*:\s*"([^"]{1,120})"/);
          if (aMatch) name = aMatch[1];
        }
        if (!videoId) {
          const vMatch = text.match(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/);
          if (vMatch) videoId = vMatch[1];
        }
        if (channelId && (handle || name)) break;
      }

      if (!channelId && !handle) return null;
      return { channelId, handle, name, videoId, source: 'inline-script' };
    } catch (e) {
      return null;
    }
  }

  // ================= MEDIA HOLD (locked / pending / unlocked) =================
  function stopMediaOnce(opts = {}) {
    const soft = !!opts.soft;
    const allVideos = !!opts.allVideos;
    const killSrc = !!opts.killSrc;

    const list = allVideos
      ? document.querySelectorAll('video')
      : document.querySelectorAll('video.html5-main-video, #movie_player video, .html5-video-player video');

    list.forEach((video) => {
      try {
        video.pause();
        if (!soft) {
          video.muted = true;
        }
        if (killSrc) {
          video.removeAttribute('src');
          video.srcObject = null;
          video.load();
        }
      } catch (e) {}
    });
  }

  function engageMediaHold(mode, key, opts = {}) {
    // Never re-hold a video that was already allowed this navigation
    if (
      mode !== 'unlocked' &&
      key &&
      allowedWatchVideoId &&
      key === allowedWatchVideoId &&
      mediaHoldState === 'unlocked'
    ) {
      return;
    }

    const nextState = mode === 'locked' ? 'locked' : 'pending';
    const sameHold = mediaHoldState === nextState && mediaHoldKey === key;

    mediaHoldState = nextState;
    mediaHoldKey = key || mediaHoldKey;
    isWatchBlocked = true;

    document.documentElement.classList.add('yt-wl-media-held');
    if (isChannelPage()) {
      document.documentElement.classList.add('yt-wl-channel-blocked');
    }

    // killSrc only on first engage of a locked channel page — not every tick
    const killOnce = !!opts.killSrc && !sameHold;
    stopMediaOnce({
      soft: nextState === 'pending',
      allVideos: isChannelPage() || nextState === 'locked',
      killSrc: killOnce
    });

    if (!mediaHoldTimer) {
      mediaHoldTimer = setInterval(() => {
        if (mediaHoldState === 'unlocked' || isBypassed()) return;
        stopMediaOnce({
          soft: mediaHoldState === 'pending',
          allVideos: isChannelPage() || mediaHoldState === 'locked',
          killSrc: false
        });
      }, 120);
    }
  }

  function releaseMediaHold(allowedKey) {
    mediaHoldState = 'unlocked';
    mediaHoldKey = null;
    isWatchBlocked = false;

    if (mediaHoldTimer) {
      clearInterval(mediaHoldTimer);
      mediaHoldTimer = null;
    }

    document.documentElement.classList.remove('yt-wl-media-held');
    document.documentElement.classList.remove('yt-wl-channel-blocked');

    if (allowedKey) {
      allowedWatchVideoId = allowedKey;
    }
  }

  // Back-compat wrapper used by a few call sites during transition
  function pauseMainVideoHard(opts = {}) {
    stopMediaOnce(opts);
  }

  function isCurrentChannelPageAllowed() {
    if (!isChannelPage()) return null;
    const pageChannel = getChannelFromUrl();
    if (!pageChannel || (!pageChannel.handle && !pageChannel.channelId)) return false;
    return isChannelWhitelisted(pageChannel);
  }

  // ================= PREVIEW / HOVER BLOCKER =================
  function setupPreviewBlockerListeners() {
    window.addEventListener(
      'play',
      (e) => {
        if (isBypassed()) return;

        const target = e.target;
        if (!target || target.tagName !== 'VIDEO') return;

        // If on shorts, kill playback immediately
        if (settings.hideShorts && (window.location.pathname.startsWith('/shorts') || target.closest('ytd-shorts, #shorts-container'))) {
          e.preventDefault();
          e.stopImmediatePropagation();
          target.pause();
          target.muted = true;
          target.removeAttribute('src');
          window.location.replace('https://www.youtube.com/');
          return;
        }

        // Channel pages: URL is authoritative — block play unless whitelisted
        if (settings.enabled && settings.blockWatchPlayback && isChannelPage()) {
          const allowed = isCurrentChannelPageAllowed();
          if (allowed !== true) {
            e.preventDefault();
            e.stopImmediatePropagation();
            target.pause();
            target.muted = true;
            try {
              target.removeAttribute('src');
              target.srcObject = null;
              target.load();
            } catch (err) {}
            return;
          }
        }

        // Watch / gated pages: only while media hold is active
        if (settings.enabled && settings.blockWatchPlayback && (mediaHoldState !== 'unlocked' || isWatchBlocked)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          target.pause();
          return;
        }

        // If hover preview player, kill preview playback
        if (settings.enabled && settings.blockHoverPreview) {
          const isPreview = target.closest(
            '#inline-preview-player, ytd-video-preview, ytd-inline-preview-renderer, #video-preview, #preview-player'
          );
          if (isPreview) {
            target.pause();
            target.currentTime = 0;
            target.muted = true;
            target.removeAttribute('src');
            target.load();
          }
        }
      },
      true
    );
  }

  // ================= WHITELIST CHECK =================
  function isChannelWhitelisted(channelInfo) {
    if (isBypassed()) return true;
    if (!channelInfo) return false;
    if (!settings.whitelist || settings.whitelist.length === 0) return false;

    const normHandle = (channelInfo.handle || '').toLowerCase().replace(/^@/, '').trim();
    const normId = (channelInfo.channelId || '').trim();
    const normVanity = (channelInfo.vanity || '').toLowerCase().replace(/^@/, '').trim();

    return settings.whitelist.some((item) => {
      const itemHandle = (item.handle || '').toLowerCase().replace(/^@/, '').trim();
      const itemId = (item.channelId || '').trim();
      // customUrl / vanity sometimes stored without @
      const itemVanity = (item.vanity || item.customUrl || '').toLowerCase().replace(/^@/, '').trim();

      if (normHandle && itemHandle && normHandle === itemHandle) return true;
      if (normId && itemId && normId === itemId) return true;
      if (normVanity && itemHandle && normVanity === itemHandle) return true;
      if (normHandle && itemVanity && normHandle === itemVanity) return true;
      if (normVanity && itemVanity && normVanity === itemVanity) return true;
      return false;
    });
  }

  // Extract Channel Details from Video Cards / owner blocks
  function extractChannelFromElement(el) {
    if (!el) return null;

    let handle = null;
    let channelId = null;
    let name = null;

    const links = el.querySelectorAll('a[href]');
    for (const a of links) {
      const href = a.getAttribute('href') || '';

      if (!handle) {
        const handleMatch = href.match(/\/(@[a-zA-Z0-9_.-]+)/);
        if (handleMatch) {
          handle = handleMatch[1];
          if (!name) name = a.textContent?.trim() || handle;
        }
      }

      if (!channelId) {
        const idMatch = href.match(/\/channel\/([a-zA-Z0-9_-]+)/);
        if (idMatch) {
          channelId = idMatch[1];
          if (!name) name = a.textContent?.trim() || channelId;
        }
      }

      if (!handle && !channelId) {
        const customMatch = href.match(/\/(c|user)\/([a-zA-Z0-9_.-]+)/);
        if (customMatch) {
          handle = `@${customMatch[2]}`;
          if (!name) name = a.textContent?.trim() || handle;
        }
      }
    }

    if (!handle && !channelId && !name) {
      return null;
    }

    return { handle, channelId, name };
  }

  const VIDEO_SELECTORS = [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-reel-item-renderer',
    'ytd-playlist-video-renderer',
    'yt-lockup-view-model',
    'ytd-radio-renderer',
    'ytd-notification-renderer'
  ].join(', ');

  function processVideoCard(card) {
    if (isBypassed()) {
      card.classList.remove('yt-wl-blocked');
      card.removeAttribute('data-yt-wl-status');
      return;
    }

    if (settings.hideShorts && card.querySelector('a[href*="/shorts/"]')) {
      card.setAttribute('data-yt-wl-status', 'blocked');
      card.classList.add('yt-wl-blocked');
      return;
    }

    // Channel pages: cards often omit channel links. Trust the URL identity.
    if (isChannelPage()) {
      let pageChannel = getChannelFromUrl();
      if (pageChannel) {
        const meta = extractChannelFromPageMeta();
        if (meta) {
          pageChannel = {
            handle: pageChannel.handle || meta.handle,
            channelId: pageChannel.channelId || meta.channelId,
            name: meta.name || pageChannel.name,
            vanity: pageChannel.vanity
          };
        }
      }
      if (pageChannel && (pageChannel.handle || pageChannel.channelId)) {
        if (isChannelWhitelisted(pageChannel)) {
          card.setAttribute('data-yt-wl-status', 'allowed');
          card.classList.remove('yt-wl-blocked');
          return;
        }
        if (settings.hideNonWhitelisted) {
          card.setAttribute('data-yt-wl-status', 'blocked');
          card.classList.add('yt-wl-blocked');
          return;
        }
      }
    }

    const channelInfo = extractChannelFromElement(card);

    // Fail-closed only off channel pages (home/search/sidebar), where unknown = unsafe
    if (!channelInfo || (!channelInfo.handle && !channelInfo.channelId)) {
      if (settings.hideNonWhitelisted && !isChannelPage()) {
        card.setAttribute('data-yt-wl-status', 'pending');
        card.classList.add('yt-wl-blocked');
      }
      return;
    }

    const whitelisted = isChannelWhitelisted(channelInfo);

    if (whitelisted) {
      card.setAttribute('data-yt-wl-status', 'allowed');
      card.classList.remove('yt-wl-blocked');
    } else if (settings.hideNonWhitelisted) {
      card.setAttribute('data-yt-wl-status', 'blocked');
      card.classList.add('yt-wl-blocked');
    } else {
      card.removeAttribute('data-yt-wl-status');
      card.classList.remove('yt-wl-blocked');
    }
  }

  function isShortsShelfHost(el) {
    if (!el || el.nodeType !== 1) return false;
    if (
      el.matches?.(
        'ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts], grid-shelf-view-model, ytm-shorts-lockup-view-model, [is-shorts]'
      )
    ) {
      return true;
    }
    const headerText = (
      el.querySelector?.(
        '#title, #title-text, h2, span#title, .grid-shelf-view-model-wiz__header, [role="heading"]'
      )?.textContent || ''
    ).trim();
    if (/^shorts$/i.test(headerText)) return true;
    if (el.querySelector?.('ytm-shorts-lockup-view-model, ytd-reel-item-renderer')) return true;
    const shortsLinks = el.querySelectorAll?.('a[href*="/shorts/"]') || [];
    if (shortsLinks.length >= 2) return true;
    return false;
  }

  const AD_DOM_SELECTORS = [
    'ytd-ad-slot-renderer',
    'ytd-promoted-sparkles-text-search-renderer',
    'ytd-promoted-sparkles-web-renderer',
    'ytd-promoted-video-renderer',
    'ytd-search-pyv-renderer',
    'ytd-in-feed-ad-layout-renderer',
    'ytd-display-ad-renderer',
    'ytd-banner-promo-renderer',
    'ytd-statement-banner-renderer',
    'ytd-brand-video-shelf-renderer',
    'ytd-brand-video-singleton-renderer',
    'ytd-action-companion-ad-renderer'
  ].join(', ');

  function markAds() {
    if (isBypassed() || !settings.enabled || settings.hideAds === false) {
      document.querySelectorAll('[data-yt-wl-ad="1"], .yt-wl-ad-blocked').forEach((el) => {
        el.removeAttribute('data-yt-wl-ad');
        el.classList.remove('yt-wl-ad-blocked', 'yt-wl-blocked');
      });
      return;
    }

    document.querySelectorAll(AD_DOM_SELECTORS).forEach((el) => {
      el.setAttribute('data-yt-wl-ad', '1');
      el.classList.add('yt-wl-ad-blocked', 'yt-wl-blocked');
      const section = el.closest('ytd-item-section-renderer, ytd-rich-item-renderer, ytd-rich-section-renderer');
      if (section) {
        section.setAttribute('data-yt-wl-ad', '1');
        section.classList.add('yt-wl-ad-blocked', 'yt-wl-blocked');
      }
    });

    // "Sponsored" badge rows (search / home)
    document.querySelectorAll('ytd-video-renderer, yt-lockup-view-model, ytd-rich-item-renderer').forEach((el) => {
      if (el.getAttribute('data-yt-wl-ad') === '1') return;
      const text = (el.textContent || '').slice(0, 400);
      if (/\bSponsored\b/i.test(text) || el.querySelector('.badge-style-type-ad, [aria-label*="Sponsored" i]')) {
        el.setAttribute('data-yt-wl-ad', '1');
        el.classList.add('yt-wl-ad-blocked', 'yt-wl-blocked');
      }
    });
  }

  function checkEmptyShelves() {
    if (isBypassed()) {
      document.querySelectorAll('.yt-wl-empty-shelf').forEach((s) => s.classList.remove('yt-wl-empty-shelf'));
      return;
    }

    const shelves = document.querySelectorAll(
      [
        'ytd-rich-section-renderer',
        'ytd-rich-shelf-renderer',
        'ytd-reel-shelf-renderer',
        'ytd-item-section-renderer',
        'grid-shelf-view-model'
      ].join(', ')
    );
    shelves.forEach((shelf) => {
      if (settings.hideShorts && isShortsShelfHost(shelf)) {
        shelf.classList.add('yt-wl-empty-shelf');
        return;
      }

      const items = shelf.querySelectorAll(
        'ytd-rich-item-renderer, ytd-reel-item-renderer, yt-lockup-view-model, ytm-shorts-lockup-view-model, ytd-video-renderer'
      );
      if (items.length > 0) {
        const visibleItems = Array.from(items).filter((el) => !el.classList.contains('yt-wl-blocked'));
        if (visibleItems.length === 0) {
          shelf.classList.add('yt-wl-empty-shelf');
        } else {
          shelf.classList.remove('yt-wl-empty-shelf');
        }
      }
    });
  }

  function filterAllVideos() {
    if (isBypassed()) {
      unblockAllVideos();
      markAds();
      return;
    }
    const cards = document.querySelectorAll(VIDEO_SELECTORS);
    cards.forEach(processVideoCard);
    markAds();
    checkEmptyShelves();
  }

  function scheduleFilter() {
    if (debounceFilterTimer) clearTimeout(debounceFilterTimer);
    debounceFilterTimer = setTimeout(() => {
      filterAllVideos();
      if (needsPlaybackGate()) {
        checkWatchPage();
      } else if (!isBypassed() && settings.hideShorts && window.location.pathname.startsWith('/shorts')) {
        window.location.replace('https://www.youtube.com/');
      } else if (!isBypassed() && (window.location.pathname === '/' || window.location.hash === '#my-channels')) {
        renderMyChannelsHub();
      }
      injectMyChannelsGuideLinks();
    }, 100);
  }

  function getVideoId() {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromQuery = params.get('v');
      if (fromQuery) return fromQuery;

      const path = window.location.pathname || '';
      const embedMatch = path.match(/^\/embed\/([a-zA-Z0-9_-]+)/);
      if (embedMatch) return embedMatch[1];
      const liveMatch = path.match(/^\/live\/([a-zA-Z0-9_-]+)/);
      if (liveMatch) return liveMatch[1];
      return null;
    } catch (e) {
      return null;
    }
  }

  function extractChannelFromPageMeta() {
    const channelIdMeta = document.querySelector('meta[itemprop="channelId"]');
    const authorLink = document.querySelector('span[itemprop="author"] link[itemprop="url"]');
    const authorName = document.querySelector('link[itemprop="name"], meta[itemprop="name"]');

    let channelId = channelIdMeta?.getAttribute('content') || null;
    let handle = null;
    let name = authorName?.getAttribute('content') || null;

    if (authorLink) {
      const href = authorLink.getAttribute('href') || '';
      const handleMatch = href.match(/\/(@[a-zA-Z0-9_.-]+)/);
      if (handleMatch) handle = handleMatch[1];
      const idMatch = href.match(/\/channel\/([a-zA-Z0-9_-]+)/);
      if (idMatch) channelId = channelId || idMatch[1];
    }

    if (!handle && !channelId && !name) return null;
    return { handle, channelId, name };
  }

  function resolveWatchChannelInfo() {
    const currentVid = getVideoId();
    let channelInfo = null;

    // 1) Prefer MAIN-world player meta (ytInitialPlayerResponse / ytInitialData)
    if (lastPlayerMeta) {
      const metaFresh =
        !currentVid ||
        !lastPlayerMeta.videoId ||
        lastPlayerMeta.videoId === currentVid ||
        Date.now() - (lastPlayerMeta.at || 0) < 15000;
      if (metaFresh && (lastPlayerMeta.channelId || lastPlayerMeta.handle)) {
        channelInfo = {
          handle: lastPlayerMeta.handle || null,
          channelId: lastPlayerMeta.channelId || null,
          name: lastPlayerMeta.name || null
        };
      }
    }

    // 2) Inline boot JSON scrape (isolated world)
    if (!channelInfo || (!channelInfo.channelId && !channelInfo.handle)) {
      channelInfo = mergeChannelInfo(channelInfo, extractChannelFromInlinePlayerScripts());
    }

    // 3) Page meta tags
    if (!channelInfo || (!channelInfo.channelId && !channelInfo.handle)) {
      channelInfo = mergeChannelInfo(channelInfo, extractChannelFromPageMeta());
    }

    // 4) DOM owner block (last resort)
    if (!channelInfo || (!channelInfo.channelId && !channelInfo.handle)) {
      const ownerEl = document.querySelector(
        '#owner, ytd-video-owner-renderer, #upload-info #channel-name, .ytp-title-channel'
      );
      channelInfo = mergeChannelInfo(channelInfo, extractChannelFromElement(ownerEl));
    }

    return channelInfo;
  }

  // ================= WATCH / EMBED / LIVE / CHANNEL PAGE PROTECTION =================
  function checkWatchPage() {
    if (isBypassed() || !settings.enabled || !settings.blockWatchPlayback) {
      releaseMediaHold(null);
      removeWatchOverlay();
      return;
    }

    if (!needsPlaybackGate()) {
      releaseMediaHold(null);
      removeWatchOverlay();
      return;
    }

    // Channel pages: URL-first. Fail-closed unless proven whitelisted.
    if (isChannelPage()) {
      const pageChannel = getChannelFromUrl();
      let channelInfo = pageChannel ? { ...pageChannel } : null;
      const metaInfo = extractChannelFromPageMeta();
      channelInfo = mergeChannelInfo(channelInfo, metaInfo);
      if (lastPlayerMeta) {
        channelInfo = mergeChannelInfo(channelInfo, lastPlayerMeta);
      }
      const headerName = document.querySelector(
        '#channel-header #text, #page-header h1, yt-dynamic-text-view-model, #channel-name'
      )?.textContent?.trim();
      if (headerName && channelInfo) {
        channelInfo.name = headerName;
      }

      const currentVid = 'channel:' + (window.location.pathname || '');

      if (channelInfo && (channelInfo.handle || channelInfo.channelId) && isChannelWhitelisted(channelInfo)) {
        releaseMediaHold(null);
        removeWatchOverlay();
        return;
      }

      // Locked hold for non-whitelisted / unresolved channel pages
      engageMediaHold('locked', currentVid, { killSrc: true });
      enforceWatchBlock(
        channelInfo || { name: 'Resolving channel…', handle: pageChannel?.handle },
        currentVid
      );

      if (!channelInfo || (!channelInfo.handle && !channelInfo.channelId)) {
        if (pendingWatchCheckTimer) clearTimeout(pendingWatchCheckTimer);
        pendingWatchCheckTimer = setTimeout(() => {
          pendingWatchCheckTimer = null;
          if (isChannelPage() && !isBypassed()) checkWatchPage();
        }, 400);
      }
      return;
    }

    const currentVid = getVideoId();

    // Already allowed this watch video — never re-enter hold
    if (currentVid && allowedWatchVideoId === currentVid && mediaHoldState === 'unlocked') {
      return;
    }

    requestPlayerMeta();
    const channelInfo = resolveWatchChannelInfo();

    if (channelInfo && (channelInfo.handle || channelInfo.channelId)) {
      if (isChannelWhitelisted(channelInfo)) {
        releaseMediaHold(currentVid);
        removeWatchOverlay();
        return;
      }
      engageMediaHold('locked', currentVid, { killSrc: false });
      enforceWatchBlock(channelInfo, currentVid);
      return;
    }

    // Unknown owner: pending hold (pause loop + CSS), retry — do not kill src
    if (currentVid && allowedWatchVideoId === currentVid) {
      return;
    }

    engageMediaHold('pending', currentVid, { killSrc: false });
    requestPlayerMeta();

    if (pendingWatchCheckTimer) clearTimeout(pendingWatchCheckTimer);
    pendingWatchCheckTimer = setTimeout(() => {
      pendingWatchCheckTimer = null;
      if (isWatchLikePage() && !isBypassed()) {
        checkWatchPage();
      }
    }, 350);
  }

  function enforceWatchBlock(channelInfo, videoId) {
    if (isBypassed()) {
      releaseMediaHold(null);
      removeWatchOverlay();
      return;
    }

    allowedWatchVideoId = null;
    engageMediaHold('locked', videoId, { killSrc: isChannelPage() });

    const playerContainer = document.querySelector(
      isChannelPage()
        ? '#movie_player, #player-container-outer, #player-container, #player, .html5-video-player, ytd-channel-video-player-renderer, ytd-player, #cinematics-container, ytd-browse #primary'
        : '#movie_player, #player-container-outer, #player-container, #player, .html5-video-player'
    );
    if (playerContainer) {
      playerContainer.classList.add('yt-wl-player-blocked');
      if (getComputedStyle(playerContainer).position === 'static') {
        playerContainer.style.position = 'relative';
      }
    }

    let existingOverlay = document.getElementById('yt-wl-watch-blocker');
    if (existingOverlay && currentBlockedVideoId === videoId) {
      return;
    }

    currentBlockedVideoId = videoId;

    if (!existingOverlay) {
      const mountTarget = isChannelPage()
        ? (document.body || document.documentElement)
        : (playerContainer || document.body);
      if (!mountTarget) {
        if (pendingWatchCheckTimer) clearTimeout(pendingWatchCheckTimer);
        pendingWatchCheckTimer = setTimeout(() => {
          pendingWatchCheckTimer = null;
          if (needsPlaybackGate() && !isBypassed()) checkWatchPage();
        }, 300);
        return;
      }
      existingOverlay = document.createElement('div');
      existingOverlay.className = isChannelPage()
        ? 'yt-wl-watch-overlay yt-wl-channel-page-overlay'
        : 'yt-wl-watch-overlay';
      existingOverlay.id = 'yt-wl-watch-blocker';
      mountTarget.appendChild(existingOverlay);
    }

    const displayName = channelInfo.name || channelInfo.handle || channelInfo.channelId || 'Restricted Source';
    const displayHandle = channelInfo.handle ? `(${channelInfo.handle})` : '';

    existingOverlay.innerHTML = `
      <div class="yt-wl-watch-card">
        <div class="yt-wl-icon-shield">⚠️</div>
        <h2 class="yt-wl-watch-title">Content Unavailable</h2>
        <p class="yt-wl-watch-desc">
          Playback from this channel is restricted under current security policy:
        </p>
        <div class="yt-wl-channel-highlight">${escapeHtml(displayName)} ${escapeHtml(displayHandle)}</div>
        <p class="yt-wl-parent-notice">
          This channel is not permitted on this browser.
        </p>
        <div class="yt-wl-btn-group">
          <a href="https://www.youtube.com/" class="yt-wl-btn-home" id="yt-wl-return-home-btn">
            🏠 Return to YouTube Home
          </a>
        </div>
      </div>
    `;

    const homeBtn = existingOverlay.querySelector('#yt-wl-return-home-btn');
    if (homeBtn) {
      homeBtn.onclick = (e) => {
        e.preventDefault();
        window.location.href = 'https://www.youtube.com/';
      };
    }
  }

  function removeWatchOverlay() {
    // Do not clear allowedWatchVideoId here — releaseMediaHold owns allow-cache
    currentBlockedVideoId = null;

    if (pendingWatchCheckTimer) {
      clearTimeout(pendingWatchCheckTimer);
      pendingWatchCheckTimer = null;
    }

    // If still locked/pending, keep hold; only strip overlay chrome when unlocked
    if (mediaHoldState === 'unlocked') {
      isWatchBlocked = false;
      document.documentElement.classList.remove('yt-wl-channel-blocked');
    }

    const overlay = document.getElementById('yt-wl-watch-blocker');
    if (overlay) {
      overlay.remove();
    }

    document.querySelectorAll('.yt-wl-player-blocked').forEach((el) => {
      el.classList.remove('yt-wl-player-blocked');
    });
  }

  // ================= "MY CHANNELS" SIDEBAR & HUB =================
  function safeChannelHref(ch) {
    const handle = (ch.handle || '').trim();
    if (handle && /^@[a-zA-Z0-9_.-]+$/.test(handle)) {
      return `https://www.youtube.com/${handle}/videos`;
    }
    const vanity = (ch.vanity || ch.customUrl || '').trim().replace(/^@/, '');
    if (vanity && /^[A-Za-z0-9_-]+$/.test(vanity)) {
      return `https://www.youtube.com/${vanity}/videos`;
    }
    const channelId = (ch.channelId || '').trim();
    if (channelId && /^[a-zA-Z0-9_-]+$/.test(channelId)) {
      return `https://www.youtube.com/channel/${channelId}/videos`;
    }
    const name = (ch.name || '').trim();
    if (name) {
      return `https://www.youtube.com/results?search_query=${encodeURIComponent(name)}`;
    }
    return 'https://www.youtube.com/';
  }

  function injectMyChannelsGuideLinks() {
    if (isBypassed()) {
      document.querySelectorAll('#yt-wl-guide-link, #yt-wl-mini-guide-link').forEach(el => el.remove());
      return;
    }

    // Hide every guide section after the first + footer leftovers (DOM can change)
    document.querySelectorAll('ytd-guide-renderer #sections > ytd-guide-section-renderer').forEach((section, idx) => {
      if (idx > 0) {
        section.style.setProperty('display', 'none', 'important');
      }
    });
    document.querySelectorAll(
      'ytd-guide-renderer #footer, ytd-guide-renderer #guide-links-primary, ytd-guide-renderer #guide-links-secondary, ytd-guide-renderer #copyright'
    ).forEach((el) => {
      el.style.setProperty('display', 'none', 'important');
    });

    // 1. Expanded Guide Injection
    const guideItems = document.querySelector('ytd-guide-renderer #sections ytd-guide-section-renderer:first-child #items');
    if (guideItems && !document.getElementById('yt-wl-guide-link')) {
      const guideLink = document.createElement('a');
      guideLink.id = 'yt-wl-guide-link';
      guideLink.className = 'yt-wl-custom-guide-entry';
      guideLink.href = 'https://www.youtube.com/#my-channels';
      guideLink.innerHTML = `
        <span class="yt-wl-guide-icon">📺</span>
        <span>My Channels</span>
      `;
      guideLink.onclick = (e) => {
        e.preventDefault();
        window.location.href = 'https://www.youtube.com/#my-channels';
        renderMyChannelsHub();
      };
      guideItems.prepend(guideLink);
    }

    // 2. Mini Guide Injection (Collapsed mode)
    const miniGuideItems = document.querySelector('ytd-mini-guide-renderer #items');
    if (miniGuideItems && !document.getElementById('yt-wl-mini-guide-link')) {
      const miniLink = document.createElement('a');
      miniLink.id = 'yt-wl-mini-guide-link';
      miniLink.className = 'yt-wl-custom-mini-guide-entry';
      miniLink.href = 'https://www.youtube.com/#my-channels';
      miniLink.innerHTML = `
        <span class="yt-wl-guide-icon">📺</span>
        <span>My Channels</span>
      `;
      miniLink.onclick = (e) => {
        e.preventDefault();
        window.location.href = 'https://www.youtube.com/#my-channels';
        renderMyChannelsHub();
      };
      miniGuideItems.prepend(miniLink);
    }
  }

  function renderMyChannelsHub() {
    if (isBypassed()) return;

    // Only on YouTube Home (optionally with #my-channels)
    const onHome = window.location.pathname === '/' || window.location.pathname === '';
    if (!onHome) {
      removeMyChannelsHub();
      return;
    }

    const browseContainer = document.querySelector('ytd-browse[page-subtype="home"] #primary, ytd-browse #primary');
    if (!browseContainer) return;

    let hub = document.getElementById('yt-wl-channels-hub');
    if (!hub) {
      hub = document.createElement('div');
      hub.id = 'yt-wl-channels-hub';
      hub.className = 'yt-wl-channels-hub';
      browseContainer.prepend(hub);
    }

    const defaultGrid = browseContainer.querySelector('ytd-rich-grid-renderer #contents');
    if (defaultGrid) {
      defaultGrid.style.display = 'none';
    }

    const list = settings.whitelist || [];

    if (list.length === 0) {
      hub.innerHTML = `
        <div class="yt-wl-hub-header">
          <div class="yt-wl-hub-title">📺 My Channels</div>
          <div class="yt-wl-hub-subtitle">You have no approved channels yet.</div>
        </div>
        <div class="yt-wl-hub-empty">
          <div class="yt-wl-hub-empty-icon">🛡️</div>
          <div class="yt-wl-hub-empty-title">No Whitelisted Channels</div>
          <p>Ask a parent to approve your favorite channels using the extension icon.</p>
        </div>
      `;
      return;
    }

    hub.textContent = '';

    const header = document.createElement('div');
    header.className = 'yt-wl-hub-header';
    header.innerHTML = `
      <div class="yt-wl-hub-title">📺 My Channels</div>
      <div class="yt-wl-hub-subtitle">Your approved channels. Click any channel to watch their videos:</div>
    `;
    hub.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'yt-wl-hub-grid';

    list.forEach(ch => {
      const initial = (ch.name || ch.handle || '?').replace(/^@/, '').charAt(0).toUpperCase();
      const card = document.createElement('a');
      card.className = 'yt-wl-hub-card';
      card.href = safeChannelHref(ch);

      const avatarWrap = document.createElement('div');
      avatarWrap.className = 'yt-wl-hub-avatar-wrap';

      if (ch.avatarUrl) {
        const img = document.createElement('img');
        img.className = 'yt-wl-hub-avatar-img';
        img.src = ch.avatarUrl;
        img.alt = ch.name || ch.handle || 'Channel';
        img.referrerPolicy = 'no-referrer';
        img.onerror = () => {
          img.remove();
          const fallback = document.createElement('div');
          fallback.className = 'yt-wl-hub-avatar-fallback';
          fallback.textContent = initial;
          avatarWrap.appendChild(fallback);
        };
        avatarWrap.appendChild(img);
      } else {
        const fallback = document.createElement('div');
        fallback.className = 'yt-wl-hub-avatar-fallback';
        fallback.textContent = initial;
        avatarWrap.appendChild(fallback);
      }

      const nameEl = document.createElement('div');
      nameEl.className = 'yt-wl-hub-name';
      nameEl.title = ch.name || ch.handle || '';
      nameEl.textContent = ch.name || ch.handle || '';

      const handleEl = document.createElement('div');
      handleEl.className = 'yt-wl-hub-handle';
      handleEl.textContent = ch.handle || '';

      const action = document.createElement('div');
      action.className = 'yt-wl-hub-action-btn';
      action.textContent = 'Watch Channel Videos ➔';

      card.appendChild(avatarWrap);
      card.appendChild(nameEl);
      card.appendChild(handleEl);
      card.appendChild(action);
      grid.appendChild(card);
    });

    hub.appendChild(grid);

    // Fetch any missing avatars in the background; storage update will re-render
    if (list.some((ch) => !ch.avatarUrl && (ch.handle || ch.channelId))) {
      chrome.runtime.sendMessage({ action: 'syncAvatars' }).catch(() => {});
    }
  }

  function removeMyChannelsHub() {
    const hub = document.getElementById('yt-wl-channels-hub');
    if (hub) hub.remove();

    const defaultGrid = document.querySelector('ytd-browse[page-subtype="home"] ytd-rich-grid-renderer #contents');
    if (defaultGrid) {
      defaultGrid.style.display = '';
    }
  }

  // ================= MUTATION OBSERVER =================
  function startObserver() {
    if (observer) observer.disconnect();

    observer = new MutationObserver((mutations) => {
      if (isBypassed()) return;

      let shouldFilter = false;

      for (const mutation of mutations) {
        const target = mutation.target;
        if (target && target.closest && (
          target.closest('#yt-wl-watch-blocker') ||
          target.closest('#yt-wl-channels-hub')
        )) {
          continue;
        }

        if (mutation.addedNodes.length > 0) {
          shouldFilter = true;
          break;
        }
      }

      if (shouldFilter) {
        scheduleFilter();
      }

      if (isWatchBlocked || mediaHoldState !== 'unlocked') {
        stopMediaOnce({
          soft: mediaHoldState === 'pending',
          allVideos: isChannelPage() || mediaHoldState === 'locked',
          killSrc: false
        });
      }
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function handlePageChange() {
    applyBypassState();
    syncFeedBridgeConfig();
    requestPlayerMeta();

    if (redirectIfBlockedPath()) return;

    if (!isBypassed() && settings.hideShorts && window.location.pathname.startsWith('/shorts')) {
      window.location.replace('https://www.youtube.com/');
      return;
    }

    // New navigation — clear allow-cache unless same watch id
    const vid = getVideoId();
    if (!vid || vid !== allowedWatchVideoId) {
      allowedWatchVideoId = null;
      lastPlayerMeta = null;
      if (mediaHoldState !== 'unlocked') {
        releaseMediaHold(null);
      }
    }

    scheduleFilter();
    if (needsPlaybackGate()) {
      checkWatchPage();
    } else {
      releaseMediaHold(null);
      removeWatchOverlay();
    }

    if (window.location.pathname === '/' || window.location.pathname === '') {
      renderMyChannelsHub();
    } else {
      removeMyChannelsHub();
    }
  }

  // ================= EVENT LISTENERS =================
  function setupListeners() {
    window.addEventListener(
      'play',
      (e) => {
        if (isBypassed()) return;
        const video = e.target;
        if (!video || video.tagName !== 'VIDEO') return;

        if (settings.enabled && settings.blockWatchPlayback && isChannelPage()) {
          if (isCurrentChannelPageAllowed() !== true) {
            e.preventDefault();
            e.stopPropagation();
            video.pause();
            video.muted = true;
            return;
          }
        }

        if (mediaHoldState !== 'unlocked' || isWatchBlocked) {
          e.preventDefault();
          e.stopPropagation();
          video.pause();
        }
      },
      true
    );

    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'YT_WL_FEED_BRIDGE_READY') {
        syncFeedBridgeConfig();
        return;
      }

      if (data.type === 'YT_WL_PLAYER_META') {
        lastPlayerMeta = {
          channelId: data.channelId || null,
          handle: data.handle || null,
          name: data.name || null,
          videoId: data.videoId || null,
          source: data.source || 'bridge',
          at: Date.now()
        };

        // Re-evaluate when meta arrives
        if (needsPlaybackGate()) {
          checkWatchPage();
        }
      }
    });

    window.addEventListener('yt-navigate-start', () => {
      allowedWatchVideoId = null;
      lastPlayerMeta = null;
      if (redirectIfBlockedPath()) return;
      if (!isBypassed() && settings.hideShorts && window.location.pathname.startsWith('/shorts')) {
        try { window.stop(); } catch (err) {}
        window.location.replace('https://www.youtube.com/');
        return;
      }
      if (!needsPlaybackGate()) {
        releaseMediaHold(null);
        removeWatchOverlay();
      }
    });

    window.addEventListener('yt-navigate-finish', () => {
      handlePageChange();
    });

    window.addEventListener('popstate', () => {
      handlePageChange();
    });

    // Listen to changes in chrome.storage
    chrome.storage.onChanged.addListener((changes) => {
      for (const [key, change] of Object.entries(changes)) {
        settings[key] = change.newValue;
      }
      applyBypassState();
      filterAllVideos();
      syncFeedBridgeConfig();
      if (needsPlaybackGate()) {
        // Whitelist edits may unlock a previously blocked video
        if (changes.whitelist) {
          allowedWatchVideoId = null;
        }
        checkWatchPage();
      } else {
        releaseMediaHold(null);
        removeWatchOverlay();
      }
      if (changes.whitelist && (window.location.pathname === '/' || window.location.pathname === '')) {
        renderMyChannelsHub();
      }
    });

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'getCurrentChannel') {
        const info = getCurrentPageChannel();
        sendResponse({ channel: info, isWhitelisted: isChannelWhitelisted(info) });
      }
      return true;
    });
  }

  function getCurrentPageChannel() {
    if (isWatchLikePage()) {
      return resolveWatchChannelInfo();
    }
    if (window.location.pathname.startsWith('/@')) {
      const handle = window.location.pathname.split('/')[1]?.split('?')[0];
      if (!handle || !handle.startsWith('@')) return null;
      const name = document.querySelector('#channel-header #text, #page-header h1, #channel-name')?.textContent?.trim() || handle;
      const meta = extractChannelFromPageMeta();
      return { handle, channelId: meta?.channelId || null, name };
    }
    if (window.location.pathname.startsWith('/channel/')) {
      const channelId = window.location.pathname.split('/')[2]?.split('?')[0];
      if (!channelId) return null;
      const name = document.querySelector('#channel-header #text, #page-header h1, #channel-name')?.textContent?.trim() || channelId;
      const meta = extractChannelFromPageMeta();
      return { handle: meta?.handle || null, channelId, name };
    }
    if (window.location.pathname.startsWith('/c/') || window.location.pathname.startsWith('/user/')) {
      return getChannelFromUrl();
    }
    // Vanity custom URL e.g. /TheRoyalInstitution/videos
    const vanity = getVanitySlugFromPath(window.location.pathname || '');
    if (vanity) {
      const meta = extractChannelFromPageMeta();
      return {
        handle: `@${vanity}`,
        channelId: meta?.channelId || null,
        name: meta?.name || vanity,
        vanity
      };
    }
    return null;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // MAIN bridges load via manifest; push config once settings are available after init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

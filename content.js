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
    showPageButtons: false,
    parentPassword: 'varna',
    bypassUntil: 0,
    whitelist: []
  };

  let isWatchBlocked = false;
  let currentBlockedVideoId = null;
  let debounceFilterTimer = null;
  let observer = null;

  function isBypassed() {
    return !!(settings.bypassUntil && settings.bypassUntil > Date.now());
  }

  // Intercept History API (client-side SPA navigation)
  try {
    const origPush = history.pushState;
    history.pushState = function (state, title, url) {
      if (!isBypassed() && url && String(url).includes('/shorts')) {
        window.location.replace('https://www.youtube.com/');
        return;
      }
      return origPush.apply(this, arguments);
    };

    const origReplace = history.replaceState;
    history.replaceState = function (state, title, url) {
      if (!isBypassed() && url && String(url).includes('/shorts')) {
        window.location.replace('https://www.youtube.com/');
        return;
      }
      return origReplace.apply(this, arguments);
    };
  } catch (e) {}

  // Intercept clicks on Shorts links
  window.addEventListener(
    'click',
    (e) => {
      if (isBypassed()) return;
      const a = e.target.closest && e.target.closest('a');
      if (a && a.href && a.href.includes('/shorts')) {
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

    if (!isBypassed() && window.location.pathname.startsWith('/shorts')) {
      try { window.stop(); } catch (e) {}
      window.location.replace('https://www.youtube.com/');
      return;
    }

    setupPreviewBlockerListeners();
    startObserver();
    filterAllVideos();
    handlePageChange();
    setupListeners();
  }

  function applyBypassState() {
    if (isBypassed()) {
      document.documentElement.classList.add('yt-wl-bypassed');
      removeWatchOverlay();
      unblockAllVideos();
      removeMyChannelsHub();
    } else {
      document.documentElement.classList.remove('yt-wl-bypassed');
      injectMyChannelsGuideLinks();
      if (window.location.pathname === '/' || window.location.hash === '#my-channels') {
        renderMyChannelsHub();
      }
    }
  }

  function unblockAllVideos() {
    document.querySelectorAll('.yt-wl-blocked, [data-yt-wl-status="blocked"]').forEach((el) => {
      el.classList.remove('yt-wl-blocked');
      el.removeAttribute('data-yt-wl-status');
    });
    document.querySelectorAll('.yt-wl-empty-shelf').forEach((el) => {
      el.classList.remove('yt-wl-empty-shelf');
    });
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
        if (window.location.pathname.startsWith('/shorts') || target.closest('ytd-shorts, #shorts-container')) {
          e.preventDefault();
          e.stopImmediatePropagation();
          target.pause();
          target.muted = true;
          target.removeAttribute('src');
          window.location.replace('https://www.youtube.com/');
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
    const normName = (channelInfo.name || '').toLowerCase().trim();
    const normId = (channelInfo.channelId || '').trim();

    return settings.whitelist.some((item) => {
      const itemHandle = (item.handle || '').toLowerCase().replace(/^@/, '').trim();
      const itemName = (item.name || '').toLowerCase().trim();
      const itemId = (item.channelId || '').trim();

      if (normHandle && itemHandle && normHandle === itemHandle) return true;
      if (normId && itemId && normId === itemId) return true;
      if (normName && itemName && normName === itemName) return true;
      return false;
    });
  }

  // Extract Channel Details from Video Cards
  function extractChannelFromElement(el) {
    if (!el) return null;

    let handle = null;
    let channelId = null;
    let name = null;

    // 1. Look for @handle anchor tags
    const handleLink = el.querySelector(
      'a[href*="/@"], ytd-channel-name a[href*="/@"], #channel-name a[href*="/@"], a.yt-simple-endpoint[href*="/@"]'
    );
    if (handleLink) {
      const href = handleLink.getAttribute('href') || '';
      const match = href.match(/\/(@[a-zA-Z0-9_.-]+)/);
      if (match) {
        handle = match[1];
      }
      name = handleLink.textContent?.trim() || handle;
    }

    // 2. Look for /channel/UC... anchor tags
    if (!handle && !channelId) {
      const channelLink = el.querySelector(
        'a[href*="/channel/"], ytd-channel-name a[href*="/channel/"], #channel-name a[href*="/channel/"]'
      );
      if (channelLink) {
        const href = channelLink.getAttribute('href') || '';
        const match = href.match(/\/channel\/([a-zA-Z0-9_-]+)/);
        if (match) {
          channelId = match[1];
        }
        name = channelLink.textContent?.trim() || channelId;
      }
    }

    // 3. Fallback: custom /c/ or /user/
    if (!handle && !channelId) {
      const customLink = el.querySelector('a[href*="/c/"], a[href*="/user/"]');
      if (customLink) {
        const href = customLink.getAttribute('href') || '';
        const match = href.match(/\/(c|user)\/([a-zA-Z0-9_.-]+)/);
        if (match) {
          handle = `@${match[2]}`;
        }
        name = customLink.textContent?.trim() || handle;
      }
    }

    // 4. Modern YouTube Lockup view models
    if (!handle && !channelId) {
      const metaLinks = el.querySelectorAll('a[href]');
      for (const a of metaLinks) {
        const href = a.getAttribute('href') || '';
        if (href.startsWith('/@')) {
          handle = href.split('/')[1]?.split('?')[0];
          name = a.textContent?.trim() || handle;
          break;
        } else if (href.startsWith('/channel/')) {
          channelId = href.split('/')[2]?.split('?')[0];
          name = a.textContent?.trim() || channelId;
          break;
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

    if (card.querySelector('a[href*="/shorts/"]')) {
      card.setAttribute('data-yt-wl-status', 'blocked');
      card.classList.add('yt-wl-blocked');
      return;
    }

    const channelInfo = extractChannelFromElement(card);
    if (!channelInfo) return;

    const whitelisted = isChannelWhitelisted(channelInfo);

    if (whitelisted) {
      card.setAttribute('data-yt-wl-status', 'allowed');
      card.classList.remove('yt-wl-blocked');
    } else {
      if (settings.hideNonWhitelisted) {
        card.setAttribute('data-yt-wl-status', 'blocked');
        card.classList.add('yt-wl-blocked');
      } else {
        card.removeAttribute('data-yt-wl-status');
        card.classList.remove('yt-wl-blocked');
      }
    }
  }

  function checkEmptyShelves() {
    if (isBypassed()) {
      document.querySelectorAll('.yt-wl-empty-shelf').forEach((s) => s.classList.remove('yt-wl-empty-shelf'));
      return;
    }

    const shelves = document.querySelectorAll(
      'ytd-rich-section-renderer, ytd-rich-shelf-renderer, ytd-reel-shelf-renderer'
    );
    shelves.forEach((shelf) => {
      if (
        shelf.matches('ytd-reel-shelf-renderer, [is-shorts]') ||
        shelf.querySelector('a[href*="/shorts/"], [is-shorts]')
      ) {
        shelf.classList.add('yt-wl-empty-shelf');
        return;
      }

      const items = shelf.querySelectorAll('ytd-rich-item-renderer, ytd-reel-item-renderer, yt-lockup-view-model');
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
      return;
    }
    const cards = document.querySelectorAll(VIDEO_SELECTORS);
    cards.forEach(processVideoCard);
    checkEmptyShelves();
  }

  function scheduleFilter() {
    if (debounceFilterTimer) clearTimeout(debounceFilterTimer);
    debounceFilterTimer = setTimeout(() => {
      filterAllVideos();
      if (window.location.pathname.startsWith('/watch')) {
        checkWatchPage();
      } else if (!isBypassed() && window.location.pathname.startsWith('/shorts')) {
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
      return params.get('v');
    } catch (e) {
      return null;
    }
  }

  // ================= WATCH PAGE PROTECTION =================
  function checkWatchPage() {
    if (isBypassed() || !settings.enabled || !settings.blockWatchPlayback) {
      removeWatchOverlay();
      return;
    }

    if (!window.location.pathname.startsWith('/watch')) {
      removeWatchOverlay();
      return;
    }

    const currentVid = getVideoId();

    let channelInfo = null;
    const ownerEl = document.querySelector('#owner, ytd-video-owner-renderer, #upload-info #channel-name');
    if (ownerEl) {
      channelInfo = extractChannelFromElement(ownerEl);
    }

    if (!channelInfo) {
      const channelIdMeta = document.querySelector('meta[itemprop="channelId"]');
      const authorMeta = document.querySelector(
        'span[itemprop="author"] link[itemprop="url"], link[itemprop="name"]'
      );
      if (channelIdMeta) {
        channelInfo = {
          channelId: channelIdMeta.getAttribute('content'),
          name: authorMeta?.getAttribute('content') || 'Channel'
        };
      }
    }

    if (!channelInfo || (!channelInfo.handle && !channelInfo.channelId && !channelInfo.name)) {
      return;
    }

    const isWhitelisted = isChannelWhitelisted(channelInfo);

    if (!isWhitelisted) {
      enforceWatchBlock(channelInfo, currentVid);
    } else {
      removeWatchOverlay();
    }
  }

  function enforceWatchBlock(channelInfo, videoId) {
    if (isBypassed()) {
      removeWatchOverlay();
      return;
    }

    isWatchBlocked = true;

    const video = document.querySelector('video.html5-main-video');
    if (video) {
      if (!video.paused) video.pause();
      video.muted = true;
      video.currentTime = 0;
    }

    const playerContainer = document.querySelector(
      '#movie_player, #player-container-outer, #player-container, #player'
    );
    if (playerContainer) {
      playerContainer.classList.add('yt-wl-player-blocked');
      playerContainer.style.position = 'relative';
    }

    let existingOverlay = document.getElementById('yt-wl-watch-blocker');
    if (existingOverlay && currentBlockedVideoId === videoId) {
      return;
    }

    currentBlockedVideoId = videoId;

    if (!existingOverlay) {
      if (!playerContainer) return;
      existingOverlay = document.createElement('div');
      existingOverlay.className = 'yt-wl-watch-overlay';
      existingOverlay.id = 'yt-wl-watch-blocker';
      playerContainer.appendChild(existingOverlay);
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
    isWatchBlocked = false;
    currentBlockedVideoId = null;

    const overlay = document.getElementById('yt-wl-watch-blocker');
    if (overlay) {
      overlay.remove();
    }

    const playerContainer = document.querySelector(
      '#movie_player, #player-container-outer, #player-container, #player'
    );
    if (playerContainer) {
      playerContainer.classList.remove('yt-wl-player-blocked');
    }
  }

  // ================= "MY CHANNELS" SIDEBAR & HUB =================
  function injectMyChannelsGuideLinks() {
    if (isBypassed()) {
      document.querySelectorAll('#yt-wl-guide-link, #yt-wl-mini-guide-link').forEach(el => el.remove());
      return;
    }

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
        window.location.hash = '#my-channels';
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
        window.location.hash = '#my-channels';
        renderMyChannelsHub();
      };
      miniGuideItems.prepend(miniLink);
    }
  }

  function renderMyChannelsHub() {
    if (isBypassed()) return;
    if (window.location.pathname !== '/' && window.location.hash !== '#my-channels') return;

    // Find main browse area on home page
    const browseContainer = document.querySelector('ytd-browse[page-subtype="home"] #primary, ytd-browse #primary');
    if (!browseContainer) return;

    let hub = document.getElementById('yt-wl-channels-hub');
    if (!hub) {
      hub = document.createElement('div');
      hub.id = 'yt-wl-channels-hub';
      hub.className = 'yt-wl-channels-hub';
      browseContainer.prepend(hub);
    }

    // Hide the default rich grid contents on home so My Channels takes center stage
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

    let cardsHtml = '';
    list.forEach(ch => {
      const initial = (ch.name || ch.handle || '?').replace(/^@/, '').charAt(0).toUpperCase();
      const channelUrl = ch.handle ? `https://www.youtube.com/${ch.handle}/videos` : (ch.channelId ? `https://www.youtube.com/channel/${ch.channelId}/videos` : `https://www.youtube.com/results?search_query=${encodeURIComponent(ch.name)}`);

      cardsHtml += `
        <a class="yt-wl-hub-card" href="${channelUrl}">
          <div class="yt-wl-hub-avatar">${escapeHtml(initial)}</div>
          <div class="yt-wl-hub-name" title="${escapeHtml(ch.name || ch.handle)}">${escapeHtml(ch.name || ch.handle)}</div>
          <div class="yt-wl-hub-handle">${escapeHtml(ch.handle || '')}</div>
          <div class="yt-wl-hub-action-btn">Watch Channel Videos ➔</div>
        </a>
      `;
    });

    hub.innerHTML = `
      <div class="yt-wl-hub-header">
        <div class="yt-wl-hub-title">📺 My Channels</div>
        <div class="yt-wl-hub-subtitle">Your approved channels. Click any channel to watch their videos:</div>
      </div>
      <div class="yt-wl-hub-grid">
        ${cardsHtml}
      </div>
    `;
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

      if (isWatchBlocked) {
        const video = document.querySelector('video.html5-main-video');
        if (video && !video.paused) {
          video.pause();
          video.muted = true;
        }
      }
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function handlePageChange() {
    applyBypassState();

    if (!isBypassed() && window.location.pathname.startsWith('/shorts')) {
      window.location.replace('https://www.youtube.com/');
      return;
    }

    scheduleFilter();
    if (window.location.pathname.startsWith('/watch')) {
      checkWatchPage();
    } else {
      removeWatchOverlay();
    }
  }

  // ================= EVENT LISTENERS =================
  function setupListeners() {
    window.addEventListener(
      'play',
      (e) => {
        if (isBypassed()) return;
        if (isWatchBlocked) {
          const video = e.target;
          if (video && video.tagName === 'VIDEO' && video.classList.contains('html5-main-video')) {
            e.preventDefault();
            e.stopPropagation();
            video.pause();
            video.muted = true;
          }
        }
      },
      true
    );

    window.addEventListener('yt-navigate-start', () => {
      if (!isBypassed() && window.location.pathname.startsWith('/shorts')) {
        try { window.stop(); } catch (err) {}
        window.location.replace('https://www.youtube.com/');
        return;
      }
      if (window.location.pathname !== '/watch') {
        removeWatchOverlay();
      }
    });

    window.addEventListener('yt-navigate-finish', () => {
      handlePageChange();
    });

    window.addEventListener('popstate', () => {
      handlePageChange();
    });

    // Listen to changes in chrome.storage (e.g. Adult clicks 1h / 2h / 3h bypass or adds channel)
    chrome.storage.onChanged.addListener((changes) => {
      for (const [key, change] of Object.entries(changes)) {
        settings[key] = change.newValue;
      }
      applyBypassState();
      filterAllVideos();
      if (window.location.pathname.startsWith('/watch')) {
        checkWatchPage();
      } else {
        removeWatchOverlay();
      }
    });

    // Handle messages from popup (e.g. asking for current channel on active tab)
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'getCurrentChannel') {
        const info = getCurrentPageChannel();
        sendResponse({ channel: info, isWhitelisted: isChannelWhitelisted(info) });
      }
      return true;
    });
  }

  function getCurrentPageChannel() {
    if (window.location.pathname.startsWith('/watch')) {
      const ownerEl = document.querySelector('#owner, ytd-video-owner-renderer, #upload-info #channel-name');
      return extractChannelFromElement(ownerEl);
    }
    if (window.location.pathname.startsWith('/@')) {
      const handle = window.location.pathname.split('/')[1]?.split('?')[0];
      const name = document.querySelector('#channel-header #text, #page-header h1, #channel-name')?.textContent?.trim() || handle;
      return { handle, name };
    }
    if (window.location.pathname.startsWith('/channel/')) {
      const channelId = window.location.pathname.split('/')[2]?.split('?')[0];
      const name = document.querySelector('#channel-header #text, #page-header h1, #channel-name')?.textContent?.trim() || channelId;
      return { channelId, name };
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

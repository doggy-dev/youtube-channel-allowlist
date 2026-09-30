// Runs in YouTube page MAIN world. Posts stable channel identity from player data.
(function () {
  'use strict';
  if (window.__ytWlPlayerBridge) return;
  window.__ytWlPlayerBridge = true;

  function pickHandle(url) {
    if (!url) return null;
    const m = String(url).match(/\/(@[a-zA-Z0-9_.-]+)/);
    return m ? m[1] : null;
  }

  function extractFromPlayerResponse(pr) {
    if (!pr || typeof pr !== 'object') return null;
    const vd = pr.videoDetails || {};
    const mf = pr.microformat && pr.microformat.playerMicroformatRenderer;
    let channelId = vd.channelId || null;
    let name = vd.author || null;
    let handle = null;
    let videoId = vd.videoId || null;

    if (mf) {
      channelId = channelId || mf.externalChannelId || null;
      name = name || mf.ownerChannelName || null;
      handle = pickHandle(mf.ownerProfileUrl) || handle;
      videoId = videoId || mf.videoId || null;
    }

    // Sometimes owner lives under endpoint payloads
    try {
      const ends = pr.endscreen && pr.endscreen.endscreenRenderer && pr.endscreen.endscreenRenderer.elements;
      // ignore — not reliable for owner
    } catch (e) {}

    if (!channelId && !handle && !name) return null;
    return { channelId, handle, name, videoId, source: 'ytInitialPlayerResponse' };
  }

  function extractFromPlayerApi() {
    try {
      const player = document.getElementById('movie_player');
      if (!player || typeof player.getVideoData !== 'function') return null;
      const d = player.getVideoData() || {};
      const videoId = d.video_id || null;
      // getVideoData rarely includes channelId on all builds; still useful for videoId
      if (!videoId && !d.author) return null;
      return {
        channelId: d.channelId || d.ucid || null,
        handle: null,
        name: d.author || null,
        videoId,
        source: 'movie_player'
      };
    } catch (e) {
      return null;
    }
  }

  function extractFromYtInitialData() {
    try {
      const data = window.ytInitialData;
      if (!data) return null;
      const tabs = data.contents && data.contents.twoColumnWatchNextResults;
      const results = tabs && tabs.results && tabs.results.results && tabs.results.results.contents;
      if (!Array.isArray(results)) return null;

      for (const block of results) {
        const owner =
          block.videoSecondaryInfoRenderer &&
          block.videoSecondaryInfoRenderer.owner &&
          block.videoSecondaryInfoRenderer.owner.videoOwnerRenderer;
        if (!owner) continue;
        const browse = owner.navigationEndpoint && owner.navigationEndpoint.browseEndpoint;
        const channelId = (browse && browse.browseId) || null;
        const handle = pickHandle(browse && browse.canonicalBaseUrl) ||
          pickHandle(owner.navigationEndpoint && owner.navigationEndpoint.commandMetadata &&
            owner.navigationEndpoint.commandMetadata.webCommandMetadata &&
            owner.navigationEndpoint.commandMetadata.webCommandMetadata.url);
        let name = null;
        if (owner.title && owner.title.runs && owner.title.runs[0]) name = owner.title.runs[0].text;
        else if (owner.title && owner.title.simpleText) name = owner.title.simpleText;
        return { channelId, handle, name, videoId: null, source: 'ytInitialData' };
      }
    } catch (e) {}
    return null;
  }

  function publish(meta) {
    if (!meta) return;
    try {
      window.postMessage(
        {
          type: 'YT_WL_PLAYER_META',
          channelId: meta.channelId || null,
          handle: meta.handle || null,
          name: meta.name || null,
          videoId: meta.videoId || null,
          source: meta.source || 'unknown'
        },
        location.origin
      );
    } catch (e) {}
  }

  function extractAndPublish() {
    const fromPr = extractFromPlayerResponse(window.ytInitialPlayerResponse);
    if (fromPr && (fromPr.channelId || fromPr.handle)) {
      publish(fromPr);
      return;
    }
    const fromData = extractFromYtInitialData();
    if (fromData && (fromData.channelId || fromData.handle)) {
      publish(fromData);
      return;
    }
    const fromApi = extractFromPlayerApi();
    if (fromApi) publish(fromApi);
  }

  // Capture assignment of ytInitialPlayerResponse as YouTube boots / navigates
  try {
    let stored = window.ytInitialPlayerResponse;
    Object.defineProperty(window, 'ytInitialPlayerResponse', {
      configurable: true,
      enumerable: true,
      get: function () {
        return stored;
      },
      set: function (value) {
        stored = value;
        extractAndPublish();
      }
    });
    if (stored) extractAndPublish();
  } catch (e) {
    // defineProperty may fail if already locked — still poll/listen
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== 'YT_WL_REQUEST_META') return;
    extractAndPublish();
  });

  document.addEventListener('yt-navigate-finish', extractAndPublish);
  // Early attempts while player boots
  setTimeout(extractAndPublish, 0);
  setTimeout(extractAndPublish, 250);
  setTimeout(extractAndPublish, 800);
})();

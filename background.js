// Background Service Worker for Smart Popup Blocker Pro
const DEFAULT_SETTINGS = {
  enabled: true,
  hideNonWhitelisted: true,
  blockHoverPreview: true,
  blockWatchPlayback: true,
  hideShorts: true,
  showPageButtons: false,
  parentPassword: "varna",
  whitelist: [
    {
      id: "wl_sample_1",
      handle: "@veritasium",
      name: "Veritasium",
      channelId: "UCHnyfMqiRRG1u-2MsSQLbXA",
      avatarUrl: "https://yt3.googleusercontent.com/7vCbvtCqtjQ3YLgsJt7Y952MQV1sBvhllSCSxHP8_sVZdcPCBrITfhkN2RdyCuwPnsByq-1GoA=s900-c-k-c0x00ffffff-no-rj",
      addedAt: Date.now()
    },
    {
      id: "wl_sample_2",
      handle: "@3blue1brown",
      name: "3Blue1Brown",
      channelId: "UCYO_jab_esuFRV4b17AJtAw",
      avatarUrl: "",
      addedAt: Date.now()
    },
    {
      id: "wl_sample_3",
      handle: "@kurzgesagt",
      name: "Kurzgesagt – In a Nutshell",
      channelId: "UCsXVk37bltHxD1rDPwtNM8Q",
      avatarUrl: "",
      addedAt: Date.now()
    }
  ],
  stats: {
    hiddenCount: 0,
    blockedWatchCount: 0
  }
};

// Initialize settings on install or update
chrome.runtime.onInstalled.addListener(async (details) => {
  const data = await chrome.storage.local.get(null);
  const updates = {};

  for (const [key, val] of Object.entries(DEFAULT_SETTINGS)) {
    if (data[key] === undefined) {
      updates[key] = val;
    }
  }

  updates.hideShorts = true;
  updates.showPageButtons = false;
  if (!data.parentPassword) {
    updates.parentPassword = "varna";
  }

  await chrome.storage.local.set(updates);
  updateBadge();
  syncMissingAvatars();
});

async function resolveChannelAvatar(handle) {
  if (!handle) return null;
  try {
    const cleanHandle = handle.startsWith('@') ? handle : `@${handle}`;
    const resp = await fetch(`https://www.youtube.com/${cleanHandle}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    if (!resp.ok) return null;
    const html = await resp.text();

    const mOg = html.match(/property="og:image"\s+content="([^"]+)"/);
    if (mOg && mOg[1]) return mOg[1];

    const mImg = html.match(/itemprop="image"\s+content="([^"]+)"/);
    if (mImg && mImg[1]) return mImg[1];

    const mAv = html.match(/"avatar":\{"thumbnails":\[\{"url":"([^"]+)"/);
    if (mAv && mAv[1]) return mAv[1];
  } catch (e) {
    console.warn('[Avatar Fetch Error]', handle, e);
  }
  return null;
}

async function syncMissingAvatars() {
  const { whitelist = [] } = await chrome.storage.local.get('whitelist');
  let changed = false;

  for (const item of whitelist) {
    if (!item.avatarUrl && (item.handle || item.channelId)) {
      const url = await resolveChannelAvatar(item.handle || `channel/${item.channelId}`);
      if (url) {
        item.avatarUrl = url;
        changed = true;
      }
    }
  }

  if (changed) {
    await chrome.storage.local.set({ whitelist });
  }
}

// Listen for messages from popup or content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'resolveAvatar' && request.handle) {
    resolveChannelAvatar(request.handle).then(avatarUrl => {
      sendResponse({ avatarUrl });
    });
    return true; // Keep channel open for async response
  }
  if (request.action === 'syncAvatars') {
    syncMissingAvatars().then(() => {
      sendResponse({ done: true });
    });
    return true;
  }
});

async function updateBadge() {
  const { enabled = true, whitelist = [] } = await chrome.storage.local.get(["enabled", "whitelist"]);
  if (!enabled) {
    chrome.action.setBadgeText({ text: "OFF" });
    chrome.action.setBadgeBackgroundColor({ color: "#777777" });
    return;
  }

  const count = whitelist.length;
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#2563eb" }); // Blue badge matching popup blocker
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.whitelist || changes.enabled) {
    updateBadge();
  }
});

// Update badge on startup and sync avatars
updateBadge();
syncMissingAvatars();

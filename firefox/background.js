// Background Service Worker for Smart Popup Blocker Pro
const DEFAULT_WHITELIST = [
  {
    id: "wl_sample_1",
    handle: "@veritasium",
    name: "Veritasium",
    channelId: "UCHnyfMqiRRG1u-2MsSQLbXA",
    avatarUrl: "https://yt3.googleusercontent.com/7vCbvtCqtjQ3YLgsJt7Y952MQV1sBvhllSCSxHP8_sVZdcPCBrITfhkN2RdyCuwPnsByq-1GoA=s900-c-k-c0x00ffffff-no-rj",
    addedAt: 1790797896543
  },
  {
    id: "wl_sample_2",
    handle: "@3blue1brown",
    name: "3Blue1Brown",
    channelId: "UCYO_jab_esuFRV4b17AJtAw",
    avatarUrl: "https://yt3.googleusercontent.com/ytc/AIdro_nFzZFPLxPZRHcE3SSwzdrbuWqfoWYwLAu0_2iO6blQYAU=s900-c-k-c0x00ffffff-no-rj",
    addedAt: 1790797896543
  },
  {
    id: "wl_sample_3",
    handle: "@kurzgesagt",
    name: "Kurzgesagt – In a Nutshell",
    channelId: "UCsXVk37bltHxD1rDPwtNM8Q",
    avatarUrl: "https://yt3.googleusercontent.com/ytc/AIdro_n1Ribd7LwdP_qKtqWL3ZDfIgv9M1d6g78VwpHGXVR2Ir4=s900-c-k-c0x00ffffff-no-rj",
    addedAt: 1790797896543
  },
  {
    id: "wl_1790797930271_uab5n",
    handle: "@smartereveryday",
    name: "Smarter Every Day",
    channelId: "UC6107grRI4m032EDlSrVnQw",
    avatarUrl: "https://yt3.googleusercontent.com/ytc/AIdro_l59Ewmp0DHZBRWbY9dVqjd2_mWwvrn8ad0bJfmdbMRYcA=s900-c-k-c0x00ffffff-no-rj",
    addedAt: 1790797930271
  },
  {
    id: "wl_1790797930271_utspx",
    handle: "@standupmaths",
    name: "Stand-up Maths",
    channelId: "",
    avatarUrl: "https://yt3.googleusercontent.com/ytc/AIdro_kH1XY27N-S65HtyJ97eLeiYGSqanZuuVP2NgTzBt081h4=s900-c-k-c0x00ffffff-no-rj",
    addedAt: 1790797930271
  },
  {
    id: "wl_1790797930271_gry6l",
    handle: "@johnnyharris",
    name: "Johnny Harris",
    channelId: "",
    avatarUrl: "https://yt3.googleusercontent.com/ytc/AIdro_kswBDn49WW5IneVE-5RlKyud5GvdzyQQ5SJQyVvJ4S3pk=s900-c-k-c0x00ffffff-no-rj",
    addedAt: 1790797930271
  },
  {
    id: "wl_1790797930271_5xhgg",
    handle: "@TED",
    name: "TED",
    channelId: "",
    avatarUrl: "https://yt3.googleusercontent.com/ytc/AIdro_koIFcCOrvh0KThLNOiazAIDu6hcs8bjkGNwe1f6A_OYm8=s900-c-k-c0x00ffffff-no-rj",
    addedAt: 1790797930271
  },
  {
    id: "wl_1790797930271_igkss",
    handle: "@TheRoyalInstitution",
    name: "The Royal Institution",
    channelId: "",
    avatarUrl: "https://yt3.googleusercontent.com/MLoJXco9yJtL6yyTzJND1kQzj1xQkIivfnGgmerfxFgxP-43uAgJbMLfgVFdrHkMRSISr7-E=s900-c-k-c0x00ffffff-no-rj",
    addedAt: 1790797930271
  },
  {
    id: "wl_1790797930271_bsdmf",
    handle: "@TEDx",
    name: "TEDx Talks",
    channelId: "",
    avatarUrl: "https://yt3.googleusercontent.com/1gDPO-4YPWFErfn3yQBnv0yxpkmiud1m5CrorApkOqUYdNd9FrZQ9xB9C9VmDt4EsgArnlwqAQc=s900-c-k-c0x00ffffff-no-rj",
    addedAt: 1790797930271
  },
  {
    id: "wl_1790797930271_nzct1",
    handle: "@SciShow",
    name: "SciShow",
    channelId: "",
    avatarUrl: "https://yt3.googleusercontent.com/PeTBgposs2PwFQ9w75vPgEzKGZqHQb6slgisyh3dcF61uLD3y-tczPRhaH0s_AOSovMjtiBy1A=s900-c-k-c0x00ffffff-no-rj",
    addedAt: 1790797930271
  },
  {
    id: "wl_1790797930271_qrkuc",
    handle: "@bigthink",
    name: "bigthink",
    channelId: "",
    avatarUrl: "https://yt3.googleusercontent.com/QWMOoT-7-bivHzD5AvaxHtC2aDl6tUjzAlsKsMo98EmOYfUUFpZGkKaDbA555fNqjqklJHeSjGc=s900-c-k-c0x00ffffff-no-rj",
    addedAt: 1790797930271
  },
  {
    id: "wl_1790939677915_59t0c",
    handle: "@coldfusion",
    name: "coldfusion",
    channelId: "",
    avatarUrl: "https://yt3.googleusercontent.com/ytc/AIdro_kJwvwnCgY68LsHj4YSaut8tOgK_RzFsiwaOhN13FWrwb8=s900-c-k-c0x00ffffff-no-rj",
    addedAt: 1790939677915
  },
  {
    id: "wl_1790939767505_stfkj",
    handle: "@fryrsquared",
    name: "@fryrsquared",
    channelId: "",
    avatarUrl: "https://yt3.googleusercontent.com/9q5IZCTDsJLxY_Ppgr-sW7UmRBz91D8Ym_UxPaIHvV2yPN9nFkV8kFo0fVCt-hef0U0TXMr8Og=s900-c-k-c0x00ffffff-no-rj",
    addedAt: 1790939767505
  },
  {
    id: "wl_1790939807414_g2he8",
    handle: "@CGPGrey",
    name: "@CGPGrey",
    channelId: "",
    avatarUrl: "https://yt3.googleusercontent.com/ytc/AIdro_nxrDGcxMGo8yKf2_Dw0eaGEWj39IAIdZQjAuz-_mBHjUI=s900-c-k-c0x00ffffff-no-rj",
    addedAt: 1790939807415
  },
  {
    id: "wl_1790939861778_tj6r6",
    handle: "@AppliedScience",
    name: "@AppliedScience",
    channelId: "",
    avatarUrl: "https://yt3.googleusercontent.com/ytc/AIdro_n0HEYF8o6yxXaIs-UhPQIEEuHIP72m7TQYA5uSY3z0cQ=s900-c-k-c0x00ffffff-no-rj",
    addedAt: 1790939861778
  },
  {
    id: "wl_1790939892776_qbdme",
    handle: "@SteveMould",
    name: "@SteveMould",
    channelId: "",
    avatarUrl: "https://yt3.googleusercontent.com/iX-akiHlJYuPDq4YVBO83cfjWW0aQefdewmI326XVhZkzxnS3MrqNVi49J33jLBw5LR_ZVyKFA=s900-c-k-c0x00ffffff-no-rj",
    addedAt: 1790939892776
  },
  {
    id: "wl_1790939919414_w2riz",
    handle: "@DrBenMiles",
    name: "@DrBenMiles",
    channelId: "",
    avatarUrl: "https://yt3.googleusercontent.com/EcaoLNkQpE-smU-jZVXPOmw6UnF_uOdsQIuXNvMaBHVpnxONnD0N2Aql6qzGoLauG3IqPMtlCpY=s900-c-k-c0x00ffffff-no-rj",
    addedAt: 1790939919414
  }
];

const DEFAULT_SETTINGS = {
  enabled: true,
  hideNonWhitelisted: true,
  blockHoverPreview: true,
  blockWatchPlayback: true,
  hideShorts: true,
  hideAds: true,
  feedDataFilter: true,
  showPageButtons: false,
  parentPassword: "varna",
  bypassUntil: 0,
  whitelist: DEFAULT_WHITELIST,
  stats: {
    hiddenCount: 0,
    blockedWatchCount: 0
  }
};

const RULE_KEYS = [
  'enabled',
  'hideNonWhitelisted',
  'blockHoverPreview',
  'blockWatchPlayback',
  'hideShorts',
  'hideAds',
  'feedDataFilter',
  'showPageButtons'
];

// Serialize whitelist mutations through one chain to avoid lost updates
let whitelistQueue = Promise.resolve();

function enqueueWhitelistOp(fn) {
  const run = whitelistQueue.then(fn, fn);
  whitelistQueue = run.catch(() => {});
  return run;
}

function normHandle(h) {
  return (h || '').toLowerCase().replace(/^@/, '').trim();
}

function channelExists(list, entry) {
  const h = normHandle(entry.handle);
  const id = (entry.channelId || '').trim();
  return list.some((item) => {
    const ih = normHandle(item.handle);
    const iid = (item.channelId || '').trim();
    return (h && ih && h === ih) || (id && iid && id === iid);
  });
}

function makeEntry(itemData) {
  return {
    id: 'wl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    handle: itemData.handle || '',
    name: itemData.name || itemData.handle || itemData.channelId || '',
    channelId: itemData.channelId || '',
    avatarUrl: itemData.avatarUrl || '',
    addedAt: Date.now()
  };
}

async function addChannelsAtomic(entries) {
  return enqueueWhitelistOp(async () => {
    const { whitelist = [] } = await chrome.storage.local.get('whitelist');
    const list = [...whitelist];
    let added = 0;

    for (const raw of entries) {
      if (!raw || (!raw.handle && !raw.channelId)) continue;
      if (channelExists(list, raw)) continue;
      list.push(makeEntry(raw));
      added++;
    }

    await chrome.storage.local.set({ whitelist: list });
    return { added, whitelist: list };
  });
}

async function removeChannelAtomic(id) {
  return enqueueWhitelistOp(async () => {
    const { whitelist = [] } = await chrome.storage.local.get('whitelist');
    const list = whitelist.filter((item) => item.id !== id);
    await chrome.storage.local.set({ whitelist: list });
    return { whitelist: list };
  });
}

async function replaceWhitelistAtomic(entries) {
  return enqueueWhitelistOp(async () => {
    const list = [];
    for (const raw of entries || []) {
      if (!raw || (!raw.handle && !raw.channelId)) continue;
      if (channelExists(list, raw)) continue;
      list.push({
        id: raw.id || makeEntry(raw).id,
        handle: raw.handle || '',
        name: raw.name || raw.handle || raw.channelId || '',
        channelId: raw.channelId || '',
        avatarUrl: raw.avatarUrl || '',
        addedAt: raw.addedAt || Date.now()
      });
    }
    await chrome.storage.local.set({ whitelist: list });
    return { whitelist: list };
  });
}

async function reorderWhitelistAtomic(fromIndex, toIndex) {
  return enqueueWhitelistOp(async () => {
    const { whitelist = [] } = await chrome.storage.local.get('whitelist');
    const list = [...whitelist];
    const from = Number(fromIndex);
    const to = Number(toIndex);
    if (!Number.isInteger(from) || !Number.isInteger(to)) {
      return { whitelist: list };
    }
    if (from < 0 || to < 0 || from >= list.length || to >= list.length || from === to) {
      return { whitelist: list };
    }
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    await chrome.storage.local.set({ whitelist: list });
    return { whitelist: list };
  });
}

async function seedMissingDefaultChannels() {
  return enqueueWhitelistOp(async () => {
    const { whitelist = [] } = await chrome.storage.local.get('whitelist');
    const list = [...whitelist];
    let added = 0;
    for (const raw of DEFAULT_WHITELIST) {
      if (channelExists(list, raw)) continue;
      list.push({ ...raw });
      added++;
    }
    if (added > 0) {
      await chrome.storage.local.set({ whitelist: list });
    }
    return { added, whitelist: list };
  });
}

// Initialize settings on install or update — only fill missing keys
chrome.runtime.onInstalled.addListener(async (details) => {
  const data = await chrome.storage.local.get(null);
  const updates = {};

  for (const [key, val] of Object.entries(DEFAULT_SETTINGS)) {
    if (data[key] === undefined) {
      updates[key] = val;
    }
  }

  // Do not overwrite parent preferences on update
  if (!data.parentPassword) {
    updates.parentPassword = "varna";
  }

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }

  await seedMissingDefaultChannels();
  updateBadge();
  syncMissingAvatars();
});

async function resolveChannelAvatar(handleOrPath) {
  if (!handleOrPath) return null;
  try {
    let path = String(handleOrPath).trim();
    if (path.startsWith('channel/')) {
      // keep as-is
    } else if (path.startsWith('UC') && !path.includes('/')) {
      path = `channel/${path}`;
    } else if (!path.startsWith('@') && !path.startsWith('channel/')) {
      path = `@${path.replace(/^@/, '')}`;
    }

    const resp = await fetch(`https://www.youtube.com/${path}`, {
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
    console.warn('[Avatar Fetch Error]', handleOrPath, e);
  }
  return null;
}

function extractChannelIdFromHtml(html) {
  if (!html) return '';
  const patterns = [
    /itemprop="channelId"\s+content="(UC[a-zA-Z0-9_-]{20,})"/,
    /"externalId"\s*:\s*"(UC[a-zA-Z0-9_-]{20,})"/,
    /"channelId"\s*:\s*"(UC[a-zA-Z0-9_-]{20,})"/,
    /"browseId"\s*:\s*"(UC[a-zA-Z0-9_-]{20,})"/
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return m[1];
  }
  return '';
}

async function fetchChannelHtml(handleOrPath) {
  let path = String(handleOrPath || '').trim();
  if (!path) return '';
  if (path.startsWith('http')) {
    try {
      path = new URL(path).pathname.replace(/^\//, '');
    } catch (e) {
      return '';
    }
  }
  if (path.startsWith('UC') && !path.includes('/')) {
    path = `channel/${path}`;
  } else if (!path.startsWith('@') && !path.startsWith('channel/')) {
    path = `@${path.replace(/^@/, '')}`;
  }
  const resp = await fetch(`https://www.youtube.com/${path}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  });
  if (!resp.ok) return '';
  return await resp.text();
}

async function syncMissingAvatars() {
  return enqueueWhitelistOp(async () => {
    const { whitelist = [] } = await chrome.storage.local.get('whitelist');
    let changed = false;

    for (const item of whitelist) {
      const needsAvatar = !item.avatarUrl && (item.handle || item.channelId);
      const needsId = !item.channelId && item.handle;
      if (!needsAvatar && !needsId) continue;

      const lookup = item.handle ? item.handle : `channel/${item.channelId}`;
      try {
        const html = await fetchChannelHtml(lookup);
        if (!html) continue;
        if (needsAvatar) {
          const url =
            (html.match(/property="og:image"\s+content="([^"]+)"/) || [])[1] ||
            (html.match(/itemprop="image"\s+content="([^"]+)"/) || [])[1] ||
            (html.match(/"avatar":\{"thumbnails":\[\{"url":"([^"]+)"/) || [])[1] ||
            '';
          if (url) {
            item.avatarUrl = url;
            changed = true;
          }
        }
        if (needsId) {
          const cid = extractChannelIdFromHtml(html);
          if (cid) {
            item.channelId = cid;
            changed = true;
          }
        }
      } catch (e) {
        console.warn('[Channel meta fetch]', lookup, e);
      }
    }

    if (changed) {
      await chrome.storage.local.set({ whitelist });
    }
    return { changed };
  });
}

async function learnWhitelistIdentity(info) {
  return enqueueWhitelistOp(async () => {
    const handle = normHandle(info && info.handle);
    const channelId = String((info && info.channelId) || '').trim();
    if (!handle && !channelId) return { whitelist: null, changed: false };

    const { whitelist = [] } = await chrome.storage.local.get('whitelist');
    let changed = false;
    const list = whitelist.map((item) => {
      const ih = normHandle(item.handle);
      const iid = (item.channelId || '').trim();
      const same =
        (handle && ih && handle === ih) ||
        (channelId && iid && channelId === iid);
      if (!same) return item;
      const next = { ...item };
      if (channelId && !iid) {
        next.channelId = channelId;
        changed = true;
      }
      if (info.handle && !next.handle) {
        next.handle = info.handle.startsWith('@') ? info.handle : '@' + handle;
        changed = true;
      }
      return next;
    });
    if (changed) {
      await chrome.storage.local.set({ whitelist: list });
    }
    return { whitelist: changed ? list : whitelist, changed };
  });
}

// Clear expired bypass even when popup is closed
async function clearExpiredBypass() {
  const { bypassUntil = 0 } = await chrome.storage.local.get('bypassUntil');
  if (bypassUntil && bypassUntil <= Date.now()) {
    await chrome.storage.local.set({ bypassUntil: 0 });
  }
}

chrome.alarms?.create?.('yt-wl-bypass-tick', { periodInMinutes: 1 });
chrome.alarms?.onAlarm?.addListener((alarm) => {
  if (alarm.name === 'yt-wl-bypass-tick') {
    clearExpiredBypass();
  }
});

// Listen for messages from popup or content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'resolveAvatar' && request.handle) {
    resolveChannelAvatar(request.handle).then(avatarUrl => {
      sendResponse({ avatarUrl });
    });
    return true;
  }
  if (request.action === 'syncAvatars') {
    syncMissingAvatars().then(() => {
      sendResponse({ done: true });
    });
    return true;
  }
  if (request.action === 'whitelistAdd') {
    const entries = Array.isArray(request.entries) ? request.entries : [request.entry];
    addChannelsAtomic(entries.filter(Boolean)).then((result) => {
      syncMissingAvatars();
      sendResponse(result);
    });
    return true;
  }
  if (request.action === 'whitelistRemove') {
    removeChannelAtomic(request.id).then(sendResponse);
    return true;
  }
  if (request.action === 'whitelistReplace') {
    replaceWhitelistAtomic(request.whitelist || []).then((result) => {
      syncMissingAvatars();
      sendResponse(result);
    });
    return true;
  }
  if (request.action === 'whitelistMerge') {
    addChannelsAtomic(request.entries || []).then((result) => {
      syncMissingAvatars();
      sendResponse(result);
    });
    return true;
  }
  if (request.action === 'whitelistReorder') {
    reorderWhitelistAtomic(request.fromIndex, request.toIndex).then(sendResponse);
    return true;
  }
  if (request.action === 'whitelistLearnIdentity') {
    learnWhitelistIdentity(request).then(sendResponse);
    return true;
  }
  if (request.action === 'applyBackup') {
    (async () => {
      const updates = {};
      if (Array.isArray(request.whitelist)) {
        const replaced = await replaceWhitelistAtomic(request.whitelist);
        updates.whitelist = replaced.whitelist;
      }
      if (request.rules && typeof request.rules === 'object') {
        for (const key of RULE_KEYS) {
          if (request.rules[key] !== undefined) {
            updates[key] = request.rules[key];
          }
        }
      }
      if (request.includePassword && request.parentPassword) {
        updates.parentPassword = String(request.parentPassword);
      }
      if (Object.keys(updates).length > 0) {
        await chrome.storage.local.set(updates);
      }
      syncMissingAvatars();
      sendResponse({ ok: true, updates });
    })();
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
  chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.whitelist || changes.enabled) {
    updateBadge();
  }
});

// Update badge on startup and sync avatars
updateBadge();
clearExpiredBypass();
syncMissingAvatars();

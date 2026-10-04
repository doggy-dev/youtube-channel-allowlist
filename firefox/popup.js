// Smart Popup Blocker Pro - Popup Script (Camouflaged Edition)
document.addEventListener('DOMContentLoaded', async () => {
  // Views
  const decoyView = document.getElementById('decoy-view');
  const secretModal = document.getElementById('secret-password-modal');
  const adminPanel = document.getElementById('admin-panel');

  // Decoy elements
  const decoyToggle = document.getElementById('decoy-master-toggle');
  const decoyToggleStatus = document.getElementById('decoy-toggle-status');
  const secretTrigger = document.getElementById('secret-trigger-letter');

  // Secret modal elements
  const secretForm = document.getElementById('secret-password-form');
  const secretInput = document.getElementById('secret-password-input');
  const secretError = document.getElementById('secret-error');
  const btnCancelSecret = document.getElementById('btn-cancel-secret');

  // Admin panel elements
  const btnExitToDecoy = document.getElementById('btn-exit-to-decoy');
  const bypassStatusBadge = document.getElementById('bypass-status-badge');
  const bypassActiveCard = document.getElementById('bypass-active-card');
  const bypassCountdownEl = document.getElementById('bypass-countdown');
  const btnCancelBypass = document.getElementById('btn-cancel-bypass');
  const bypassBtnGrid = document.getElementById('bypass-btn-grid');
  const bypassButtons = document.querySelectorAll('.btn-bypass');

  // Active YouTube Channel Quick Add Card
  const adminCurrentCard = document.getElementById('admin-current-channel-card');
  const adminCurrentName = document.getElementById('admin-current-channel-name');
  const adminCurrentHandle = document.getElementById('admin-current-channel-handle');
  const adminCurrentBtn = document.getElementById('admin-current-action-btn');

  // Whitelist elements
  const wlCountBadge = document.getElementById('wl-count-badge');
  const adminAddForm = document.getElementById('admin-add-form');
  const adminChannelInput = document.getElementById('admin-channel-input');
  const adminWlList = document.getElementById('admin-whitelist-list');
  const adminEmptyWl = document.getElementById('admin-empty-wl');

  // Admin footer
  const btnChangePass = document.getElementById('btn-change-pass');
  const btnImportChannels = document.getElementById('btn-import-channels');
  const btnBackupChannels = document.getElementById('btn-backup-channels');
  const importChannelsFile = document.getElementById('import-channels-file');

  // State
  let settings = {
    enabled: true,
    hideNonWhitelisted: true,
    blockHoverPreview: true,
    blockWatchPlayback: true,
    hideShorts: true,
    hideAds: true,
    parentPassword: 'varna',
    bypassUntil: 0,
    whitelist: []
  };

  let detectedChannel = null;
  let countdownInterval = null;

  // Load storage
  const stored = await chrome.storage.local.get(null);
  if (stored) {
    settings = { ...settings, ...stored };
  }

  chrome.storage.onChanged.addListener((changes) => {
    for (const [key, change] of Object.entries(changes)) {
      settings[key] = change.newValue;
    }
    if (changes.whitelist && !adminPanel.classList.contains('hidden')) {
      renderWhitelist();
    }
    if (changes.bypassUntil && !adminPanel.classList.contains('hidden')) {
      updateBypassUI();
    }
  });

  // ================= 1. DECOY LOGIC =================
  decoyToggle.addEventListener('change', () => {
    if (decoyToggle.checked) {
      decoyToggleStatus.textContent = 'Protection Active';
      decoyToggleStatus.style.color = '#ffffff';
    } else {
      decoyToggleStatus.textContent = 'Protection Paused';
      decoyToggleStatus.style.color = '#94a3b8';
    }
  });

  // THE SECRET TRIGGER: Click the letter 'k' in 'Blocks'
  secretTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    secretModal.classList.remove('hidden');
    secretInput.value = '';
    secretError.classList.add('hidden');
    secretInput.focus();
  });

  btnCancelSecret.addEventListener('click', () => {
    secretModal.classList.add('hidden');
  });

  // Secret Password Submission
  secretForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const entered = secretInput.value.trim();
    const expected = settings.parentPassword || 'varna';

    if (entered === expected) {
      secretModal.classList.add('hidden');
      decoyView.classList.add('hidden');
      adminPanel.classList.remove('hidden');
      initAdminPanel();
    } else {
      secretError.classList.remove('hidden');
      secretInput.style.borderColor = '#ef4444';
      secretInput.value = '';
      secretInput.focus();
    }
  });

  // Exit back to decoy
  btnExitToDecoy.addEventListener('click', () => {
    adminPanel.classList.add('hidden');
    decoyView.classList.remove('hidden');
    if (countdownInterval) clearInterval(countdownInterval);
  });

  // ================= 2. ADMIN & BYPASS LOGIC =================
  function initAdminPanel() {
    updateBypassUI();
    renderWhitelist();
    checkCurrentTab();
  }

  // Adult Temporary Bypass buttons (1, 2, 3 hours)
  bypassButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const hours = parseInt(btn.getAttribute('data-hours'), 10) || 1;
      const bypassTime = Date.now() + (hours * 3600 * 1000);
      settings.bypassUntil = bypassTime;
      await chrome.storage.local.set({ bypassUntil: bypassTime });
      updateBypassUI();
    });
  });

  btnCancelBypass.addEventListener('click', async () => {
    settings.bypassUntil = 0;
    await chrome.storage.local.set({ bypassUntil: 0 });
    updateBypassUI();
  });

  function updateBypassUI() {
    if (countdownInterval) clearInterval(countdownInterval);

    const now = Date.now();
    const isBypassed = settings.bypassUntil && settings.bypassUntil > now;

    if (isBypassed) {
      bypassStatusBadge.classList.remove('hidden');
      bypassActiveCard.classList.remove('hidden');
      bypassBtnGrid.classList.add('hidden');

      const tick = () => {
        const remainingMs = settings.bypassUntil - Date.now();
        if (remainingMs <= 0) {
          clearInterval(countdownInterval);
          settings.bypassUntil = 0;
          chrome.storage.local.set({ bypassUntil: 0 });
          updateBypassUI();
          return;
        }

        const totalSec = Math.floor(remainingMs / 1000);
        const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
        const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
        const s = String(totalSec % 60).padStart(2, '0');
        bypassCountdownEl.textContent = `${h}:${m}:${s}`;
      };

      tick();
      countdownInterval = setInterval(tick, 1000);
    } else {
      bypassStatusBadge.classList.add('hidden');
      bypassActiveCard.classList.add('hidden');
      bypassBtnGrid.classList.remove('hidden');
    }
  }

  // ================= 3. ACTIVE TAB CHANNEL DETECTION =================
  async function checkCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url || !tab.url.includes('youtube.com')) {
        adminCurrentCard.classList.add('hidden');
        return;
      }

      chrome.tabs.sendMessage(tab.id, { action: 'getCurrentChannel' }, (response) => {
        if (chrome.runtime.lastError || !response || !response.channel) {
          fallbackTabCheck(tab.url);
        } else {
          displayDetectedChannel(response.channel);
        }
      });
    } catch (e) {
      console.warn('Tab check error', e);
    }
  }

  function fallbackTabCheck(tabUrl) {
    const parsed = parseChannelInput(tabUrl, { strictUrl: true });
    if (parsed && (parsed.handle || parsed.channelId)) {
      displayDetectedChannel(parsed);
    } else {
      adminCurrentCard.classList.add('hidden');
    }
  }

  function displayDetectedChannel(channel) {
    if (!channel || (!channel.handle && !channel.channelId)) {
      adminCurrentCard.classList.add('hidden');
      return;
    }

    detectedChannel = channel;
    adminCurrentCard.classList.remove('hidden');
    adminCurrentName.textContent = channel.name || channel.handle || channel.channelId;
    adminCurrentHandle.textContent = channel.handle || channel.channelId || '';

    updateDetectedButtonState();
  }

  function isChannelWhitelisted(channel) {
    if (!channel) return false;
    const list = settings.whitelist || [];
    const normHandle = (channel.handle || '').toLowerCase().replace(/^@/, '');
    const normId = channel.channelId || '';

    return list.some(item => {
      const iHandle = (item.handle || '').toLowerCase().replace(/^@/, '');
      const iId = item.channelId || '';
      return (normHandle && iHandle === normHandle) || (normId && iId === normId);
    });
  }

  function updateDetectedButtonState() {
    if (!detectedChannel) return;
    const alreadyIn = isChannelWhitelisted(detectedChannel);

    if (alreadyIn) {
      adminCurrentBtn.textContent = '✓ Added';
      adminCurrentBtn.className = 'btn btn-sm btn-secondary';
      adminCurrentBtn.title = 'Channel is already in your whitelist';
      adminCurrentBtn.onclick = null;
    } else {
      adminCurrentBtn.textContent = '+ Add to Whitelist';
      adminCurrentBtn.className = 'btn btn-sm btn-primary';
      adminCurrentBtn.title = 'Click to add this channel without typing';
      adminCurrentBtn.onclick = async () => {
        await addChannel(detectedChannel);
        updateDetectedButtonState();
      };
    }
  }

  // Whitelist Rendering
  async function moveChannel(fromIndex, toIndex) {
    const result = await chrome.runtime.sendMessage({
      action: 'whitelistReorder',
      fromIndex,
      toIndex
    });
    if (result?.whitelist) {
      settings.whitelist = result.whitelist;
    }
    renderWhitelist();
    updateDetectedButtonState();
  }

  function renderWhitelist() {
    const list = settings.whitelist || [];
    wlCountBadge.textContent = list.length;
    adminWlList.innerHTML = '';

    if (list.length === 0) {
      adminEmptyWl.classList.remove('hidden');
      updateDetectedButtonState();
      return;
    }

    adminEmptyWl.classList.add('hidden');

    list.forEach((item, index) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'admin-wl-item';

      const info = document.createElement('div');
      info.className = 'wl-item-info-row';

      const initial = (item.name || item.handle || '?').replace(/^@/, '').charAt(0).toUpperCase();
      if (item.avatarUrl) {
        const img = document.createElement('img');
        img.className = 'wl-avatar-img';
        img.src = item.avatarUrl;
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.onerror = () => {
          const fb = document.createElement('div');
          fb.className = 'wl-avatar-fallback';
          fb.textContent = initial;
          img.replaceWith(fb);
        };
        info.appendChild(img);
      } else {
        const fb = document.createElement('div');
        fb.className = 'wl-avatar-fallback';
        fb.textContent = initial;
        info.appendChild(fb);
      }

      const text = document.createElement('div');
      text.className = 'wl-item-info';
      text.innerHTML = `
        <span class="wl-name">${escapeHtml(item.name || item.handle)}</span>
        <span class="wl-handle">${escapeHtml(item.handle || item.channelId || '')}</span>
      `;
      info.appendChild(text);

      const actions = document.createElement('div');
      actions.className = 'wl-item-actions';

      const upBtn = document.createElement('button');
      upBtn.className = 'btn-order-item';
      upBtn.title = 'Move up';
      upBtn.textContent = '↑';
      upBtn.disabled = index === 0;
      upBtn.addEventListener('click', async () => {
        await moveChannel(index, index - 1);
      });

      const downBtn = document.createElement('button');
      downBtn.className = 'btn-order-item';
      downBtn.title = 'Move down';
      downBtn.textContent = '↓';
      downBtn.disabled = index === list.length - 1;
      downBtn.addEventListener('click', async () => {
        await moveChannel(index, index + 1);
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'btn-delete-item';
      delBtn.title = 'Remove';
      delBtn.textContent = '🗑️';
      delBtn.addEventListener('click', async () => {
        const result = await chrome.runtime.sendMessage({ action: 'whitelistRemove', id: item.id });
        if (result?.whitelist) {
          settings.whitelist = result.whitelist;
        }
        renderWhitelist();
        updateDetectedButtonState();
      });

      actions.appendChild(upBtn);
      actions.appendChild(downBtn);
      actions.appendChild(delBtn);

      itemEl.appendChild(info);
      itemEl.appendChild(actions);
      adminWlList.appendChild(itemEl);
    });

    updateDetectedButtonState();

    if (list.some((ch) => !ch.avatarUrl && (ch.handle || ch.channelId))) {
      chrome.runtime.sendMessage({ action: 'syncAvatars' }).catch(() => {});
    }
  }

  // Add channel handler
  adminAddForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const raw = adminChannelInput.value.trim();
    if (!raw) return;

    const parsed = parseChannelInput(raw);
    if (!parsed || (!parsed.handle && !parsed.channelId)) {
      alert('Could not recognize a channel handle, URL, or Channel ID.');
      return;
    }

    await addChannel(parsed);
    adminChannelInput.value = '';
  });

  async function addChannel(channelData) {
    if (!channelData || (!channelData.handle && !channelData.channelId)) {
      alert('No valid channel to add.');
      return;
    }

    if (isChannelWhitelisted(channelData)) {
      alert(`${channelData.name || channelData.handle} is already in the whitelist.`);
      return;
    }

    const result = await chrome.runtime.sendMessage({
      action: 'whitelistAdd',
      entry: {
        handle: channelData.handle || '',
        name: channelData.name || channelData.handle || channelData.channelId,
        channelId: channelData.channelId || ''
      }
    });

    if (result?.whitelist) {
      settings.whitelist = result.whitelist;
    }
    renderWhitelist();
  }

  function parseChannelInput(raw, opts = {}) {
    let input = (raw || '').trim();
    if (!input) return null;

    let handle = null;
    let channelId = null;
    let name = null;

    if (input.includes('youtube.com') || input.includes('youtu.be')) {
      try {
        const url = new URL(input.startsWith('http') ? input : `https://${input}`);
        const handleMatch = url.pathname.match(/^\/(@[a-zA-Z0-9_.-]+)/);
        if (handleMatch) {
          handle = handleMatch[1];
          name = handle;
        } else {
          const idMatch = url.pathname.match(/^\/channel\/([a-zA-Z0-9_-]+)/);
          if (idMatch) {
            channelId = idMatch[1];
            name = channelId;
          } else {
            const customMatch = url.pathname.match(/^\/(c|user)\/([a-zA-Z0-9_.-]+)/);
            if (customMatch) {
              handle = `@${customMatch[2]}`;
              name = customMatch[2];
            } else {
              // Vanity custom URL: /TheRoyalInstitution[/videos]
              const reserved = new Set([
                'watch', 'shorts', 'feed', 'results', 'playlist', 'playlists', 'channel', 'c', 'user',
                'gaming', 'music', 'podcasts', 'sports', 'premium', 'account', 'reporthistory',
                'creators', 'creator', 'live', 'embed', 'hashtag', 'kids', 'about', 'ads', 't', 'new'
              ]);
              const parts = url.pathname.split('/').filter(Boolean);
              const root = parts[0];
              if (root && !reserved.has(root.toLowerCase()) && /^[A-Za-z0-9_-]{2,100}$/.test(root)) {
                handle = `@${root}`;
                name = root;
              }
            }
          }
        }
      } catch (e) {}

      // Strict URL mode (tab fallback): never invent a handle from homepage / watch URLs
      if (opts.strictUrl && !handle && !channelId) {
        return null;
      }
    }

    if (!handle && !channelId) {
      if (opts.strictUrl) return null;

      if (input.startsWith('UC') && input.length >= 20 && !/\s/.test(input)) {
        channelId = input;
        name = input;
      } else if (/^@[a-zA-Z0-9_.-]+$/.test(input) || /^[a-zA-Z0-9_.-]+$/.test(input)) {
        // Reject obvious non-handles (URLs mistaken for handles)
        if (input.includes('://') || input.includes('/')) return null;
        handle = input.startsWith('@') ? input : `@${input}`;
        name = input.replace(/^@/, '');
      } else {
        return null;
      }
    }

    return { handle, channelId, name };
  }

  // Change Password
  btnChangePass.addEventListener('click', async () => {
    const currentPass = prompt('Enter CURRENT password:');
    if (currentPass === null) return;

    const expected = settings.parentPassword || 'varna';
    if (currentPass !== expected) {
      alert('Incorrect current password.');
      return;
    }

    const newPass = prompt('Enter NEW password:');
    if (!newPass || !newPass.trim()) return;

    settings.parentPassword = newPass.trim();
    await chrome.storage.local.set({ parentPassword: settings.parentPassword });
    alert('Password updated successfully!');
  });

  // Backup Channels (whitelist only — no password)
  btnBackupChannels.addEventListener('click', () => {
    const backup = {
      version: 2,
      exportedAt: new Date().toISOString(),
      whitelist: settings.whitelist || []
    };
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backup, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `youtube_channels_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  // Import Channels
  btnImportChannels.addEventListener('click', () => {
    importChannelsFile.click();
  });

  importChannelsFile.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      let entries = [];

      if (file.name.toLowerCase().endsWith('.json') || file.type === 'application/json') {
        const parsed = JSON.parse(text);
        const list = Array.isArray(parsed)
          ? parsed
          : (Array.isArray(parsed.whitelist) ? parsed.whitelist : (Array.isArray(parsed.channels) ? parsed.channels : null));

        if (!list) {
          alert('Invalid JSON. Expected a channel array or { "whitelist": [...] }.');
          e.target.value = '';
          return;
        }

        for (const item of list) {
          if (typeof item === 'string') {
            const p = parseChannelInput(item);
            if (p && (p.handle || p.channelId)) entries.push(p);
          } else if (item && (item.handle || item.channelId)) {
            entries.push({
              handle: item.handle || '',
              channelId: item.channelId || '',
              name: item.name || item.handle || item.channelId || ''
            });
          } else if (item?.url) {
            const p = parseChannelInput(item.url);
            if (p && (p.handle || p.channelId)) {
              entries.push({ ...p, name: item.name || p.name });
            }
          }
        }
      } else {
        const lines = text.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
        for (const line of lines) {
          const firstCol = line.split(',')[0].trim().replace(/^"|"$/g, '');
          const p = parseChannelInput(firstCol);
          if (p && (p.handle || p.channelId)) entries.push(p);
        }
      }

      if (entries.length === 0) {
        alert('No valid channels found in that file.');
        e.target.value = '';
        return;
      }

      if (!confirm(`Import ${entries.length} channel(s)? Duplicates will be skipped.`)) {
        e.target.value = '';
        return;
      }

      const result = await chrome.runtime.sendMessage({
        action: 'whitelistMerge',
        entries
      });
      if (result?.whitelist) {
        settings.whitelist = result.whitelist;
      }
      renderWhitelist();
      alert(`Imported ${result?.added || 0} new channel(s).`);
    } catch (err) {
      alert('Failed to read or parse the file.');
    }

    e.target.value = '';
  });

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});

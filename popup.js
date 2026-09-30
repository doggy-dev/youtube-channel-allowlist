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
  const btnLoadStem = document.getElementById('btn-load-stem');

  // State
  let settings = {
    enabled: true,
    hideNonWhitelisted: true,
    blockHoverPreview: true,
    blockWatchPlayback: true,
    hideShorts: true,
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
    const parsed = parseChannelInput(tabUrl);
    if (parsed && (parsed.handle || parsed.channelId)) {
      displayDetectedChannel(parsed);
    } else {
      adminCurrentCard.classList.add('hidden');
    }
  }

  function displayDetectedChannel(channel) {
    if (!channel || (!channel.handle && !channel.channelId && !channel.name)) {
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

    list.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'admin-wl-item';
      itemEl.innerHTML = `
        <div class="wl-item-info">
          <span class="wl-name">${escapeHtml(item.name || item.handle)}</span>
          <span class="wl-handle">${escapeHtml(item.handle || item.channelId || '')}</span>
        </div>
        <button class="btn-delete-item" title="Remove" data-id="${item.id}">🗑️</button>
      `;

      itemEl.querySelector('.btn-delete-item').addEventListener('click', async () => {
        settings.whitelist = settings.whitelist.filter(w => w.id !== item.id);
        await chrome.storage.local.set({ whitelist: settings.whitelist });
        renderWhitelist();
        updateDetectedButtonState();
      });

      adminWlList.appendChild(itemEl);
    });

    updateDetectedButtonState();
  }

  // Add channel handler
  adminAddForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const raw = adminChannelInput.value.trim();
    if (!raw) return;

    const parsed = parseChannelInput(raw);
    if (!parsed) return;

    await addChannel(parsed);
    adminChannelInput.value = '';
  });

  async function addChannel(channelData) {
    const list = settings.whitelist || [];
    const normHandle = (channelData.handle || '').toLowerCase().replace(/^@/, '');
    const normId = (channelData.channelId || '');

    const exists = list.some(item => {
      const iHandle = (item.handle || '').toLowerCase().replace(/^@/, '');
      const iId = (item.channelId || '');
      return (normHandle && iHandle === normHandle) || (normId && iId === normId);
    });

    if (exists) {
      alert(`${channelData.name || channelData.handle} is already in the whitelist.`);
      return;
    }

    const newEntry = {
      id: 'wl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      handle: channelData.handle || '',
      name: channelData.name || channelData.handle || channelData.channelId,
      channelId: channelData.channelId || '',
      addedAt: Date.now()
    };

    settings.whitelist = [...list, newEntry];
    await chrome.storage.local.set({ whitelist: settings.whitelist });
    renderWhitelist();
  }

  function parseChannelInput(raw) {
    let input = raw.trim();
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
          }
        }
      } catch (e) {}
    }

    if (!handle && !channelId) {
      if (input.startsWith('UC') && input.length >= 20) {
        channelId = input;
        name = input;
      } else {
        handle = input.startsWith('@') ? input : `@${input}`;
        name = input.replace(/^@/, '');
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

  // Load STEM Preset
  const STEM_PRESETS = [
    { handle: '@veritasium', name: 'Veritasium', channelId: 'UCHnyfMqiRRG1u-2MsSQLbXA' },
    { handle: '@3blue1brown', name: '3Blue1Brown', channelId: 'UCYO_jab_esuFRV4b17AJtAw' },
    { handle: '@kurzgesagt', name: 'Kurzgesagt – In a Nutshell', channelId: 'UCsXVk37bltHxD1rDPwtNM8Q' },
    { handle: '@smartereveryday', name: 'Smarter Every Day', channelId: 'UC6107grRI4m032EDlSrVnQw' },
    { handle: '@markrober', name: 'Mark Rober', channelId: 'UCY1kMZp36IQSyNx_9h4mpCg' }
  ];

  btnLoadStem.addEventListener('click', async () => {
    if (!confirm('Load curated educational STEM channels into whitelist?')) return;
    const existing = settings.whitelist || [];
    const merged = [...existing];

    for (const item of STEM_PRESETS) {
      const h = item.handle.toLowerCase().replace(/^@/, '');
      if (!merged.some(m => (m.handle || '').toLowerCase().replace(/^@/, '') === h)) {
        merged.push({
          id: 'wl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          ...item,
          addedAt: Date.now()
        });
      }
    }

    settings.whitelist = merged;
    await chrome.storage.local.set({ whitelist: merged });
    renderWhitelist();
    alert('STEM pack added!');
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

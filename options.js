// YouTube Whitelist Guard - Options Page Script (Parental Control Edition)
document.addEventListener('DOMContentLoaded', async () => {
  // Lock elements
  const lockOverlay = document.getElementById('options-lock-overlay');
  const lockForm = document.getElementById('options-lock-form');
  const passInput = document.getElementById('options-pass-input');
  const lockError = document.getElementById('options-lock-error');
  const optionsApp = document.getElementById('options-app');
  const btnOptionsLock = document.getElementById('btn-options-lock');

  // Navigation
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.content-section');

  // Elements
  const totalCountPill = document.getElementById('total-count-pill');
  const shieldStatusBadge = document.getElementById('shield-status-badge');
  const optAddForm = document.getElementById('options-add-form');
  const optChannelInput = document.getElementById('opt-channel-input');
  const optSearchInput = document.getElementById('opt-search-input');
  const tableBody = document.getElementById('channels-table-body');
  const emptyTable = document.getElementById('opt-empty-table');

  const bulkTextarea = document.getElementById('bulk-textarea');
  const btnProcessBulk = document.getElementById('btn-process-bulk');

  const ruleHideNonWl = document.getElementById('rule-hide-non-wl');
  const ruleBlockHover = document.getElementById('rule-block-hover');
  const ruleBlockWatch = document.getElementById('rule-block-watch');
  const ruleHideShorts = document.getElementById('rule-hide-shorts');
  const btnOptionsChangePass = document.getElementById('btn-options-change-pass');

  const btnExportBackup = document.getElementById('btn-export-backup');
  const restoreFileInput = document.getElementById('restore-file-input');

  // State
  let settings = {
    enabled: true,
    hideNonWhitelisted: true,
    blockHoverPreview: true,
    blockWatchPlayback: true,
    hideShorts: true,
    showPageButtons: false,
    parentPassword: 'varna',
    whitelist: []
  };

  // Load storage
  const stored = await chrome.storage.local.get(null);
  if (stored) {
    settings = { ...settings, ...stored };
  }

  // 1. Password Verification
  lockForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const entered = passInput.value.trim();
    const expected = settings.parentPassword || 'varna';

    if (entered === expected) {
      lockOverlay.classList.add('hidden');
      optionsApp.classList.remove('hidden');
      lockError.classList.add('hidden');
      passInput.value = '';
      initDashboard();
    } else {
      lockError.classList.remove('hidden');
      passInput.style.borderColor = '#ef4444';
      passInput.value = '';
      passInput.focus();
    }
  });

  // Re-lock button
  btnOptionsLock.addEventListener('click', () => {
    optionsApp.classList.add('hidden');
    lockOverlay.classList.remove('hidden');
    passInput.value = '';
    passInput.focus();
  });

  function initDashboard() {
    // Nav handlers
    navItems.forEach(item => {
      item.onclick = (e) => {
        e.preventDefault();
        navItems.forEach(n => n.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));

        item.classList.add('active');
        const targetId = item.getAttribute('href').replace('#', '');
        document.getElementById(targetId)?.classList.add('active');
      };
    });

    // Update Settings UI
    ruleHideNonWl.checked = !!settings.hideNonWhitelisted;
    ruleBlockHover.checked = !!settings.blockHoverPreview;
    ruleBlockWatch.checked = !!settings.blockWatchPlayback;
    ruleHideShorts.checked = !!settings.hideShorts;

    if (settings.enabled) {
      shieldStatusBadge.textContent = '● Shield Active';
      shieldStatusBadge.style.color = '#22c55e';
    } else {
      shieldStatusBadge.textContent = '○ Shield Disabled';
      shieldStatusBadge.style.color = '#a1a1aa';
    }

    renderTable();
  }

  // Settings change handlers
  ruleHideNonWl.addEventListener('change', () => {
    saveSetting('hideNonWhitelisted', ruleHideNonWl.checked);
  });
  ruleBlockHover.addEventListener('change', () => {
    saveSetting('blockHoverPreview', ruleBlockHover.checked);
  });
  ruleBlockWatch.addEventListener('change', () => {
    saveSetting('blockWatchPlayback', ruleBlockWatch.checked);
  });
  ruleHideShorts.addEventListener('change', () => {
    saveSetting('hideShorts', ruleHideShorts.checked);
  });

  async function saveSetting(key, val) {
    settings[key] = val;
    await chrome.storage.local.set({ [key]: val });
  }

  // Change Password
  btnOptionsChangePass.addEventListener('click', async () => {
    const currentPass = prompt('Enter CURRENT parent password:');
    if (currentPass === null) return;

    const expected = settings.parentPassword || 'varna';
    if (currentPass !== expected) {
      alert('Incorrect current password.');
      return;
    }

    const newPass = prompt('Enter NEW parent password:');
    if (!newPass || !newPass.trim()) {
      alert('Password cannot be empty.');
      return;
    }

    const confirmPass = prompt('Confirm NEW parent password:');
    if (newPass !== confirmPass) {
      alert('Passwords do not match.');
      return;
    }

    settings.parentPassword = newPass.trim();
    await chrome.storage.local.set({ parentPassword: settings.parentPassword });
    alert('Parent password successfully updated!');
  });

  // Render Channels Table
  function renderTable(filterTerm = '') {
    const list = settings.whitelist || [];
    totalCountPill.textContent = `${list.length} Channels`;
    tableBody.innerHTML = '';

    const term = filterTerm.toLowerCase().trim();
    const filtered = list.filter(item => {
      const name = (item.name || '').toLowerCase();
      const handle = (item.handle || '').toLowerCase();
      const id = (item.channelId || '').toLowerCase();
      return name.includes(term) || handle.includes(term) || id.includes(term);
    });

    if (filtered.length === 0) {
      emptyTable.classList.remove('hidden');
    } else {
      emptyTable.classList.add('hidden');
    }

    filtered.forEach(item => {
      const tr = document.createElement('tr');
      const initial = (item.name || item.handle || '?').replace(/^@/, '').charAt(0).toUpperCase();
      const dateStr = item.addedAt ? new Date(item.addedAt).toLocaleDateString() : 'Initial';

      tr.innerHTML = `
        <td>
          <div class="channel-cell">
            <div class="table-avatar">${escapeHtml(initial)}</div>
            <div>
              <div class="channel-title">${escapeHtml(item.name || item.handle)}</div>
            </div>
          </div>
        </td>
        <td>
          <code style="background: rgba(255,255,255,0.06); padding: 3px 8px; border-radius: 4px; font-size: 12px;">
            ${escapeHtml(item.handle || item.channelId || '--')}
          </code>
        </td>
        <td style="color: var(--text-muted); font-size: 12px;">
          ${escapeHtml(dateStr)}
        </td>
        <td style="text-align: right;">
          <button class="btn-icon-danger" title="Remove channel" data-id="${item.id}">
            🗑️
          </button>
        </td>
      `;

      tr.querySelector('.btn-icon-danger').addEventListener('click', () => {
        removeChannel(item.id);
      });

      tableBody.appendChild(tr);
    });
  }

  optSearchInput.addEventListener('input', () => {
    renderTable(optSearchInput.value);
  });

  // Single Add Form
  optAddForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const raw = optChannelInput.value.trim();
    if (!raw) return;

    const parsed = parseInput(raw);
    if (!parsed) return;

    await addChannel(parsed);
    optChannelInput.value = '';
    renderTable(optSearchInput.value);
  });

  // Bulk Add
  btnProcessBulk.addEventListener('click', async () => {
    const text = bulkTextarea.value.trim();
    if (!text) return;

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    let addedCount = 0;

    for (const line of lines) {
      const parsed = parseInput(line);
      if (parsed) {
        const success = await addChannel(parsed, false);
        if (success) addedCount++;
      }
    }

    await chrome.storage.local.set({ whitelist: settings.whitelist });
    renderTable(optSearchInput.value);
    bulkTextarea.value = '';
    alert(`Successfully added ${addedCount} new channels to whitelist!`);
  });

  function parseInput(raw) {
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
          } else {
            const customMatch = url.pathname.match(/^\/(c|user)\/([a-zA-Z0-9_.-]+)/);
            if (customMatch) {
              handle = `@${customMatch[2]}`;
              name = customMatch[2];
            }
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

  async function addChannel(itemData, autoSave = true) {
    const list = settings.whitelist || [];
    const normHandle = (itemData.handle || '').toLowerCase().replace(/^@/, '');
    const normId = (itemData.channelId || '');

    const exists = list.some(item => {
      const iHandle = (item.handle || '').toLowerCase().replace(/^@/, '');
      const iId = (item.channelId || '');
      if (normHandle && iHandle && normHandle === iHandle) return true;
      if (normId && iId && normId === iId) return true;
      return false;
    });

    if (exists) return false;

    const newEntry = {
      id: 'wl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      handle: itemData.handle || '',
      name: itemData.name || itemData.handle || itemData.channelId,
      channelId: itemData.channelId || '',
      addedAt: Date.now()
    };

    settings.whitelist = [...list, newEntry];
    if (autoSave) {
      await chrome.storage.local.set({ whitelist: settings.whitelist });
    }
    return true;
  }

  async function removeChannel(id) {
    settings.whitelist = (settings.whitelist || []).filter(item => item.id !== id);
    await chrome.storage.local.set({ whitelist: settings.whitelist });
    renderTable(optSearchInput.value);
  }

  // Backup & Restore
  btnExportBackup.addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(settings, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `youtube_whitelist_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  });

  restoreFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        if (parsed.whitelist && Array.isArray(parsed.whitelist)) {
          if (confirm(`Restore ${parsed.whitelist.length} channels from backup? This will merge with current list.`)) {
            const current = settings.whitelist || [];
            const merged = [...current];

            for (const item of parsed.whitelist) {
              const h = (item.handle || '').toLowerCase().replace(/^@/, '');
              const id = item.channelId || '';
              const exists = merged.some(m => {
                const mh = (m.handle || '').toLowerCase().replace(/^@/, '');
                const mid = m.channelId || '';
                return (h && mh === h) || (id && mid === id);
              });

              if (!exists) {
                merged.push({
                  id: 'wl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
                  handle: item.handle || '',
                  name: item.name || item.handle || item.channelId,
                  channelId: item.channelId || '',
                  addedAt: Date.now()
                });
              }
            }

            settings.whitelist = merged;
            await chrome.storage.local.set({ whitelist: merged });
            renderTable();
            alert('Backup restored successfully!');
          }
        } else {
          alert('Invalid backup JSON format.');
        }
      } catch (err) {
        alert('Failed to parse backup JSON file.');
      }
    };
    reader.readAsText(file);
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

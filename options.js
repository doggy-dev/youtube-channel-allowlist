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
  const bulkFileInput = document.getElementById('bulk-file-input');
  const bulkFileStatus = document.getElementById('bulk-file-status');

  const ruleHideNonWl = document.getElementById('rule-hide-non-wl');
  const ruleBlockHover = document.getElementById('rule-block-hover');
  const ruleBlockWatch = document.getElementById('rule-block-watch');
  const ruleHideShorts = document.getElementById('rule-hide-shorts');
  const ruleFeedDataFilter = document.getElementById('rule-feed-data-filter');
  const btnOptionsChangePass = document.getElementById('btn-options-change-pass');

  const btnExportBackup = document.getElementById('btn-export-backup');
  const restoreFileInput = document.getElementById('restore-file-input');
  const exportIncludePassword = document.getElementById('export-include-password');
  const restoreIncludePassword = document.getElementById('restore-include-password');

  // State
  let settings = {
    enabled: true,
    hideNonWhitelisted: true,
    blockHoverPreview: true,
    blockWatchPlayback: true,
    hideShorts: true,
    feedDataFilter: true,
    showPageButtons: false,
    parentPassword: 'varna',
    whitelist: []
  };

  // Load storage
  const stored = await chrome.storage.local.get(null);
  if (stored) {
    settings = { ...settings, ...stored };
  }

  chrome.storage.onChanged.addListener((changes) => {
    for (const [key, change] of Object.entries(changes)) {
      settings[key] = change.newValue;
    }
    if (changes.whitelist && !optionsApp.classList.contains('hidden')) {
      renderTable(optSearchInput.value);
    }
    if ((changes.enabled || changes.hideNonWhitelisted || changes.blockHoverPreview ||
         changes.blockWatchPlayback || changes.hideShorts || changes.feedDataFilter) && !optionsApp.classList.contains('hidden')) {
      syncRulesUI();
    }
  });

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

  function syncRulesUI() {
    ruleHideNonWl.checked = !!settings.hideNonWhitelisted;
    ruleBlockHover.checked = !!settings.blockHoverPreview;
    ruleBlockWatch.checked = !!settings.blockWatchPlayback;
    ruleHideShorts.checked = !!settings.hideShorts;
    if (ruleFeedDataFilter) {
      ruleFeedDataFilter.checked = settings.feedDataFilter !== false;
    }

    if (settings.enabled) {
      shieldStatusBadge.textContent = '● Shield Active';
      shieldStatusBadge.style.color = '#22c55e';
    } else {
      shieldStatusBadge.textContent = '○ Shield Disabled';
      shieldStatusBadge.style.color = '#a1a1aa';
    }
  }

  function initDashboard() {
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

    syncRulesUI();
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
  if (ruleFeedDataFilter) {
    ruleFeedDataFilter.addEventListener('change', () => {
      saveSetting('feedDataFilter', ruleFeedDataFilter.checked);
    });
  }

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
      const identifier = [item.handle, item.channelId].filter(Boolean).join(' · ') || '--';

      const cell = document.createElement('td');
      const channelCell = document.createElement('div');
      channelCell.className = 'channel-cell';

      if (item.avatarUrl) {
        const img = document.createElement('img');
        img.className = 'table-avatar-img';
        img.src = item.avatarUrl;
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.onerror = () => {
          const fb = document.createElement('div');
          fb.className = 'table-avatar';
          fb.textContent = initial;
          img.replaceWith(fb);
        };
        channelCell.appendChild(img);
      } else {
        const fb = document.createElement('div');
        fb.className = 'table-avatar';
        fb.textContent = initial;
        channelCell.appendChild(fb);
      }

      const titleWrap = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'channel-title';
      title.textContent = item.name || item.handle || '';
      titleWrap.appendChild(title);
      channelCell.appendChild(titleWrap);
      cell.appendChild(channelCell);

      tr.appendChild(cell);

      const idTd = document.createElement('td');
      idTd.innerHTML = `<code style="background: rgba(255,255,255,0.06); padding: 3px 8px; border-radius: 4px; font-size: 12px;">${escapeHtml(identifier)}</code>`;
      tr.appendChild(idTd);

      const dateTd = document.createElement('td');
      dateTd.style.color = 'var(--text-muted)';
      dateTd.style.fontSize = '12px';
      dateTd.textContent = dateStr;
      tr.appendChild(dateTd);

      const actionTd = document.createElement('td');
      actionTd.style.textAlign = 'right';
      const btn = document.createElement('button');
      btn.className = 'btn-icon-danger';
      btn.title = 'Remove channel';
      btn.textContent = '🗑️';
      btn.addEventListener('click', () => removeChannel(item.id));
      actionTd.appendChild(btn);
      tr.appendChild(actionTd);

      tableBody.appendChild(tr);
    });

    // Backfill missing avatars
    if (list.some((ch) => !ch.avatarUrl && (ch.handle || ch.channelId))) {
      chrome.runtime.sendMessage({ action: 'syncAvatars' }).catch(() => {});
    }
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
    if (!parsed || (!parsed.handle && !parsed.channelId)) {
      alert('Could not recognize a channel handle, URL, or Channel ID.');
      return;
    }

    await addChannels([parsed]);
    optChannelInput.value = '';
    renderTable(optSearchInput.value);
  });

  // Bulk Add (pasted lines)
  btnProcessBulk.addEventListener('click', async () => {
    const text = bulkTextarea.value.trim();
    if (!text) return;

    const entries = parseBulkText(text);
    if (entries.length === 0) {
      alert('No valid channels found in the pasted text.');
      return;
    }

    const result = await addChannels(entries);
    bulkTextarea.value = '';
    renderTable(optSearchInput.value);
    alert(`Added ${result.added} new channel(s). Skipped ${entries.length - result.added} duplicate/invalid.`);
  });

  // Bulk file upload
  bulkFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    bulkFileStatus.textContent = `Reading ${file.name}…`;

    try {
      const text = await file.text();
      let entries = [];

      if (file.name.toLowerCase().endsWith('.json') || file.type === 'application/json') {
        entries = parseBulkJson(text);
      } else {
        entries = parseBulkText(text);
      }

      if (entries.length === 0) {
        bulkFileStatus.textContent = 'No valid channels found in file.';
        alert('No valid channels found in that file.');
        e.target.value = '';
        return;
      }

      const result = await addChannels(entries);
      bulkFileStatus.textContent = `Imported ${result.added} from ${file.name}`;
      renderTable(optSearchInput.value);
      alert(`File import complete: added ${result.added} new channel(s) from ${entries.length} parsed.`);
    } catch (err) {
      bulkFileStatus.textContent = 'Import failed.';
      alert('Failed to read or parse the file.');
    }

    e.target.value = '';
  });

  function parseBulkText(text) {
    const lines = text.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
    const entries = [];
    for (const line of lines) {
      // CSV: take first column if comma-separated
      const firstCol = line.split(',')[0].trim().replace(/^"|"$/g, '');
      const parsed = parseInput(firstCol);
      if (parsed && (parsed.handle || parsed.channelId)) {
        entries.push(parsed);
      }
    }
    return entries;
  }

  function parseBulkJson(text) {
    const parsed = JSON.parse(text);
    let list = [];

    if (Array.isArray(parsed)) {
      list = parsed;
    } else if (parsed && Array.isArray(parsed.whitelist)) {
      list = parsed.whitelist;
    } else if (parsed && Array.isArray(parsed.channels)) {
      list = parsed.channels;
    } else {
      return [];
    }

    const entries = [];
    for (const item of list) {
      if (typeof item === 'string') {
        const p = parseInput(item);
        if (p && (p.handle || p.channelId)) entries.push(p);
        continue;
      }
      if (!item || typeof item !== 'object') continue;

      if (item.handle || item.channelId) {
        entries.push({
          handle: item.handle || '',
          channelId: item.channelId || '',
          name: item.name || item.handle || item.channelId || ''
        });
        continue;
      }

      if (item.url) {
        const p = parseInput(item.url);
        if (p && (p.handle || p.channelId)) {
          entries.push({ ...p, name: item.name || p.name });
        }
      }
    }
    return entries;
  }

  function parseInput(raw) {
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

      if (!handle && !channelId) return null;
    }

    if (!handle && !channelId) {
      if (input.startsWith('UC') && input.length >= 20 && !/\s/.test(input)) {
        channelId = input;
        name = input;
      } else if (/^@[a-zA-Z0-9_.-]+$/.test(input) || /^[a-zA-Z0-9_.-]+$/.test(input)) {
        if (input.includes('://') || input.includes('/')) return null;
        handle = input.startsWith('@') ? input : `@${input}`;
        name = input.replace(/^@/, '');
      } else {
        return null;
      }
    }

    return { handle, channelId, name };
  }

  async function addChannels(entries) {
    const result = await chrome.runtime.sendMessage({
      action: 'whitelistAdd',
      entries
    });
    if (result?.whitelist) {
      settings.whitelist = result.whitelist;
    }
    return { added: result?.added || 0, whitelist: settings.whitelist };
  }

  async function removeChannel(id) {
    const result = await chrome.runtime.sendMessage({ action: 'whitelistRemove', id });
    if (result?.whitelist) {
      settings.whitelist = result.whitelist;
    }
    renderTable(optSearchInput.value);
  }

  // Backup & Restore
  btnExportBackup.addEventListener('click', () => {
    const backup = {
      version: 2,
      exportedAt: new Date().toISOString(),
      whitelist: settings.whitelist || [],
      rules: {
        enabled: !!settings.enabled,
        hideNonWhitelisted: !!settings.hideNonWhitelisted,
        blockHoverPreview: !!settings.blockHoverPreview,
        blockWatchPlayback: !!settings.blockWatchPlayback,
        hideShorts: !!settings.hideShorts,
        feedDataFilter: settings.feedDataFilter !== false,
        showPageButtons: !!settings.showPageButtons
      }
    };

    if (exportIncludePassword.checked) {
      backup.parentPassword = settings.parentPassword || '';
    }

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backup, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `youtube_whitelist_backup_${new Date().toISOString().slice(0, 10)}.json`);
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
        const list = Array.isArray(parsed.whitelist)
          ? parsed.whitelist
          : (Array.isArray(parsed) ? parsed : null);

        if (!list) {
          alert('Invalid backup JSON format.');
          return;
        }

        const mode = document.querySelector('input[name="restore-mode"]:checked')?.value || 'merge';
        const rules = parsed.rules || {
          enabled: parsed.enabled,
          hideNonWhitelisted: parsed.hideNonWhitelisted,
          blockHoverPreview: parsed.blockHoverPreview,
          blockWatchPlayback: parsed.blockWatchPlayback,
          hideShorts: parsed.hideShorts,
          feedDataFilter: parsed.feedDataFilter,
          showPageButtons: parsed.showPageButtons
        };

        const hasRules = rules && Object.values(rules).some(v => v !== undefined);
        const includePass = restoreIncludePassword.checked && !!parsed.parentPassword;

        const confirmMsg = mode === 'replace'
          ? `Replace whitelist with ${list.length} channel(s) from backup${hasRules ? ' and restore filter rules' : ''}?`
          : `Merge ${list.length} channel(s) from backup${hasRules ? ' and restore filter rules' : ''}?`;

        if (!confirm(confirmMsg)) return;

        if (mode === 'replace') {
          await chrome.runtime.sendMessage({
            action: 'applyBackup',
            whitelist: list,
            rules: hasRules ? rules : null,
            includePassword: includePass,
            parentPassword: parsed.parentPassword
          });
        } else {
          await chrome.runtime.sendMessage({
            action: 'whitelistMerge',
            entries: list
          });
          if (hasRules || includePass) {
            await chrome.runtime.sendMessage({
              action: 'applyBackup',
              rules: hasRules ? rules : null,
              includePassword: includePass,
              parentPassword: parsed.parentPassword
            });
          }
        }

        const fresh = await chrome.storage.local.get(null);
        settings = { ...settings, ...fresh };
        syncRulesUI();
        renderTable();
        alert('Backup restored successfully!');
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

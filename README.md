# 🛡️ Smart Popup Blocker Pro (Stealth Parental Control)

A stealth extension designed to look and behave like a standard **Popup Blocker** in Brave, while silently enforcing a strict YouTube channel whitelist, blocking Shorts, and preventing children from discovering or tampering with the filter.

---

## 🎭 The Disguise & Decoy Interface

- **Extension Name**: `Smart Popup Blocker Pro`
- **Icon**: Blue Web Shield icon with popup block symbol.
- **Decoy UI**: Clicking the extension icon displays a convincing popup blocker dashboard:
  - Toggle switch: *"Protection Active / Protection Paused"* (clicks work visually to fool the child, but do **nothing** to the underlying YouTube rules).
  - Fake counters: *"Popups Blocked: 247"*, *"Overlays Prevented: 89"*, *"Trackers: 1,412"*.
  - Description: *"Blocks intrusive popups, unwanted overlays, and background redirect banners across all visited websites."*
- **Disguised YouTube Block Screen**: If an unapproved video is opened on YouTube, it appears as a security/network content restriction:
  - `⚠️ Content Unavailable: Playback from this channel is restricted under current security policy.`
  - Button: `[ 🏠 Return to YouTube Home ]`
  - It does **not** mention "Parental Control" or "Whitelist", so the child won't know an extension is responsible.

---

## 🔑 The Secret Easter Egg Trigger

To open the real Parent / Admin Control Panel:

1. Click the **Smart Popup Blocker Pro** icon in Brave's toolbar.
2. In the description sentence:
   > *"Bloc**k**s intrusive popups, unwanted overlays, and background redirect banners across all visited websites."*
3. Click on the letter **`k`** in the word **`Blocks`**!
   - *(The letter looks like completely normal, unclickable text).*
4. A security prompt will slide open:
   - Enter your password: **`varna`**
   - Click **Unlock**.

---

## 🔓 Adult Temporary Bypass Mode

When you want to use YouTube yourself as an adult without any restrictions:

1. Unlock the secret panel (click the letter **`k`** in `Blocks` and enter `varna`).
2. At the top of the panel, click one of the bypass buttons:
   - **`⏸️ 1 Hour`**
   - **`⏸️ 2 Hours`**
   - **`⏸️ 3 Hours`**
3. While the bypass is active:
   - All YouTube restrictions are **completely lifted**.
   - You can watch any channel, browse recommendations, and watch Shorts.
   - A live countdown timer shows the remaining time.
4. When you finish or walk away:
   - Click **`🛑 Re-enable Child Blocking Now`** to immediately re-lock YouTube.
   - Or, once the countdown timer expires, blocking automatically re-engages!

---

## 🩳 YouTube Shorts & Whitelist Protection

- When child protection is active:
  - YouTube Shorts links, buttons, and carousels are completely hidden.
  - Direct Shorts URLs are instantly aborted and redirected to YouTube Home.
  - Watch / embed / live pages are **fail-closed**: playback is paused until the channel is confirmed whitelisted.
  - Feed cards without resolvable channel identity are hidden until verified.
  - Matching uses handle and channel ID only (display names are not trusted).
  - Only whitelisted channels appear on YouTube.

---

## 📦 Bulk Upload & Backup

Open the extension **Options** page (after unlocking with the parent password):

### Bulk Add
1. Go to **Bulk Add Channels**.
2. Paste one handle/URL/Channel ID per line, **or** upload a `.txt` / `.csv` / `.json` file.
3. JSON may be a bare array, `{ "whitelist": [...] }`, or `{ "channels": [...] }`.

### Backup & Restore
1. Go to **Backup & Restore**.
2. **Export** downloads channels + filter rules (password excluded unless you opt in).
3. **Restore** can **merge** or **replace** channels, and restores filter rules from the backup when present.

---

## 🔄 How to Reload in Brave

1. Open Brave and go to:
   ```text
   brave://extensions
   ```
2. Find **Smart Popup Blocker Pro** (or the previous Whitelist Guard card).
3. Click the **🔄 Reload** button on the card.
4. Test clicking the extension icon and clicking the letter **`k`** in **`Blocks`**!

---

## Notes

- **Firefox:** a separate Manifest V3 build lives in [`firefox/`](firefox/) (Firefox 128+). Load via `about:debugging` → **Load Temporary Add-on…** → select `firefox/manifest.json`.
- Adult bypass expiry is enforced by the YouTube page and a background alarm — it no longer depends on the popup staying open.
- Extension-level filtering is not tamper-proof if the child can disable extensions; use browser managed policies for stronger locks.
- Change the default password (`varna`) after install.
# Smart Popup Blocker Pro — Firefox

Firefox (Manifest V3) build of the same YouTube channel allowlist extension as the Chromium/Brave copy at the repo root.

## Requirements

- **Firefox 128+** (needed for MAIN-world content scripts used by `player-bridge.js` / `feed-bridge.js`)

## Install (temporary / development)

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select [`manifest.json`](manifest.json) inside this `firefox/` folder
4. Open YouTube and confirm filtering works

Temporary add-ons are removed when Firefox restarts. For persistence, use a signed/self-distributed XPI or Firefox ESR policies as appropriate for your setup.

## Differences from Chromium build

| Item | Chromium (repo root) | Firefox (`firefox/`) |
|------|----------------------|----------------------|
| Background | `service_worker` | `scripts` (event page) |
| Browser id | n/a | `browser_specific_settings.gecko` |
| Min version | any MV3 Chromium | Firefox 128+ |

Logic files (`content.js`, bridges, popup/options) are the same; Firefox exposes the `chrome.*` extension APIs used by those scripts.

## Parent unlock

Same as Chromium: open the toolbar popup, click the letter **k** in “Blocks” in the decoy description, password default **`varna`**.

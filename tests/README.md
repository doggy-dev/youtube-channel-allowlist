# Filtering regression tests

Requires Node.js 22 or newer. The DOM tests also require installed Google Chrome with the CDP `Extensions.loadUnpacked` / `Extensions.getExtensions` APIs (verified with Chrome 154) and Playwright 1.62.1.

Run the dependency-free feed tests:

```sh
node --test tests/feed-bridge.test.cjs
```

To run the full suite without adding dependencies to the extension directory, install Playwright into a temporary tools directory (macOS/Linux):

```sh
tools=$(mktemp -d)
npm install --prefix "$tools" --no-audit --no-fund playwright@1.62.1
NODE_PATH="$tools/node_modules" node --test tests/*.test.cjs
```

The DOM tests load the actual unpacked extension into a disposable Chrome profile, verify that it is installed and enabled, and serve controlled fixtures at the YouTube search URL. They never use or modify your normal Chrome profile. The disposable profile is removed after the tests. Set `HEADFUL=1` to show the test browser.

Coverage includes search whitelist filtering (allowed and blocked videos, channel/playlist and unknown cards, search controls, messages, continuations, late insertion, page scope, disabled protection, and adult bypass), modern and legacy Shorts, sponsored renderers, mixed and empty shelves, late insertion, SPA navigation, and bypass restoration. Ordinary video titles mentioning sponsorship are not classified as advertising.

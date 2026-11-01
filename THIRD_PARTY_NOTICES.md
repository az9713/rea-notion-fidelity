# References and development dependencies

The application and synthetic fixtures were implemented independently. Notion's official block/rich-text/reference documentation informs the interchange shape; sources and baseline comparisons are in `docs/sources.json`. Notion is a referenced product, not an affiliation. No proprietary client, user export or private data is bundled.

The established MIT-licensed notion-to-md project (https://github.com/souvikinator/notion-to-md) is a conversion baseline only; no code from that converter is bundled.

Development dependencies are pinned in package-lock.json: esbuild0.28.2 (MIT), Playwright1.58.2 (Apache-2.0), Electron45.2.1 (MIT plus bundled Chromium/third-party notices). The web renderer has no external runtime dependency. The optional Windows distribution includes the pinned Electron runtime with its LICENSE / LICENSES.chromium.html and accompanying required files.

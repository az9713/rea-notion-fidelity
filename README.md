# Research Block Fidelity

**Edit a known part of a structured document. Keep the unfamiliar parts intact. See exactly what a readable export loses.**

[Live editor](https://az9713.github.io/rea-notion-fidelity/app.html) · [Feature showcase](https://az9713.github.io/rea-notion-fidelity/) · [Windows / web / source downloads](https://github.com/az9713/rea-notion-fidelity/releases/tag/v0.1.0)

![Actual Chromium application screenshot using synthetic notes](https://az9713.github.io/rea-notion-fidelity/editor-desktop.png)

## What it does

- Imports public Notion API-shaped block objects, arrays, list responses, or this app's saved native project.
- Edits paragraph, heading1–3, quote, bulleted/numbered list and equation blocks. Rich-text changes apply to one text/equation run, retaining surrounding runs, existing annotations, links and unknown fields.
- Preserves unsupported blocks and mention/unknown rich-text objects as opaque, noneditable data. Nested children in supported blocks remain selectable.
- Keeps the original imported baseline and shows semantic JSON Pointer differences for each edit. Undo retains20 in-memory states.
- Produces escaped HTML and conservative CommonMark previews, with field-level omission/transform/structure/incomplete findings. Acknowledgement is required before downloading a lossy projection.
- Saves native `.fidelity.json`, archival API-shaped JSON, a readable projection and a separate full loss report.

This is an **original independent application built against documented public shapes**, not a recovered Notion client, an official Notion integration or a demonstrated REA run. Notion already has [official Markdown APIs and Notion-flavored Markdown v2](https://developers.notion.com/guides/data-apis/working-with-markdown-content); [notion-to-md](https://github.com/souvikinator/notion-to-md) is an established converter. The useful addition here is the narrow, inspectable preservation/edit/loss contract, not a claim that conversion is new.

## Try the contract

1. Open the live editor or run the packaged Windows executable. Synthetic notes appear immediately.
2. Select the second paragraph; change its first text run and an annotation. Apply the run.
3. Inspect the semantic differential. Unknown fields and the opaque callout remain untouched.
4. Save a native project, import it again, and inspect the same edited content and original baseline.
5. Compare HTML and CommonMark findings; save the loss report before downloading a projection.

The web app is client-side, without credentials, API requests, uploads, analytics or automatic storage. Save before closing. The Windows app hosts only its bundled assets on an ephemeral loopback port; its renderer has no Node integration or privileged IPC. Normal file selection and downloads are user actions.

## Run the releases

**Windows x64:** extract `NotionFidelity-0.1.0-win-x64.zip` and run `NotionFidelity.exe` inside the extracted folder. Keep its accompanying runtime/resources together. The portable app writes its browser profile beside the executable unless `REA_PROFILE_DIR` is set. No installation into Notion is required.

**Web:** extract `notion-fidelity-web-0.1.0.zip` and open `app.html` in a modern browser. The bundled external JavaScript does not require a package manager or network connection. Use the hosted showcase if your browser applies restrictive local-file policies.

**Source:** Node22+ and Python3 are used for build/release checks.

```sh
npm ci --ignore-scripts
npm run build
npm test
npm run test:browser
npm run release
```

Browser tests use Playwright; set `BROWSER_EXECUTABLE_PATH` to an installed Chromium executable or install its browser first. Profiles, cache and downloads are placed in `.test-build`. The source distribution includes the native fixture and tests.

Desktop packaging uses Electron45.2.1. After the installation above, run `npm rebuild electron` to download its pinned runtime, then `python scripts/package-desktop.py`. The helper refuses to overwrite an existing unpacked package directory. An existing project-local build can be checked with `NotionFidelity.exe --self-test` and an explicit project-local `REA_PROFILE_DIR`; this smoke test checks renderer load/control/Node isolation, separately from application behavior tests. Project MIT terms, `LICENSE.electron` and `LICENSES.chromium.html` are all retained in the Windows distribution.

## Precise boundaries

Native preservation means accepted **JSON values**, including unknown fields and object/array structure. Source whitespace, numeric lexemes and key order are not byte-preserved. Numbers use finite IEEE-754 values. Duplicate keys, prototype-pollution keys, unpaired Unicode surrogates, unsafe integers, negative zero and nonfinite numbers are rejected. The envelope contains both baseline and current document; compact serialization reserves room for both so accepted projects can be reimported.

Limits:5 MiB JSON input;2 MiB compact JSON per current/baseline document;36 document nesting levels (40 for the project envelope);45,000 JSON nodes per document (100,000 per envelope);2,000 traversed blocks;100,000 UTF-16 code units per string;1,000 rich-text runs interpreted per block. Saved envelope limits also apply to the combined data. Edits enforce2,000 code units per text run and1,000 per equation; no silent splitting. Native serialization is compact deliberately. JSON field presence/defaults, run boundaries and metadata cannot be reconstructed from portable projections; the report names those fields.

Notion child responses need recursive fetching and pagination. This app accepts inline children under either `block.children` or the type payload's `children`, rejects both together, and flags missing child content / `has_more`. It does not complete partial input. Unknown block descendants remain opaque.

No live API synchronization, page/database-property import, Markdown import, collaboration, media fetching or mathematical rendering is implemented. API-shaped JSON is an archive of current data, **not a validated Notion create/update payload**: imported metadata may be read-only on the server. Existing IDs/timestamps are retained rather than forged. No real Notion client or workspace compatibility test has been performed.

HTML is escaped, previewed in a sandbox, and permits only HTTP/HTTPS/mailto links; unsafe imported URLs remain in native JSON but are never activated. CommonMark is a deliberately conservative textual projection: underline/code/strike styles, colors, opaque blocks and exact native nesting are reported as lost. LaTeX is shown as source, not parsed or rendered. Preview fidelity is not Notion rendering fidelity.

## Verification and attribution

See [core report](https://az9713.github.io/rea-notion-fidelity/verification.json), [browser report](https://az9713.github.io/rea-notion-fidelity/browser-verification.json), [tests](https://github.com/az9713/rea-notion-fidelity/tree/main/tests) and [primary sources](https://az9713.github.io/rea-notion-fidelity/sources.json). Fixtures are invented locally from documented shapes; no private workspace or installed client content is included. Browser screenshots show this app with those fixtures.

MIT. See `THIRD_PARTY_NOTICES.md`. No proprietary application binary or converter implementation is copied into the app.


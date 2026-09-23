# Writing documentation

Put reader-facing guides in `docs/`. Use `docs/development/addons/` for addon authors and `docs/development/core/` for app contributors. Internal agent instructions and investigation notes belong in `docs/ai-agents/`, which is excluded from the published site.

Write complete sentences. Explain what someone needs to do, and omit details that do not help them use or develop the feature. If one sentence is enough, stop there. Use short labels for controls and lists for steps or choices. Keep implementation details in the development guides.

## Update the API reference

The reference generator reads TypeScript declarations and their documentation comments. Update the declaration or its comment, then run:

```sh
npm run docs
npm run docs:check
```

Do not edit generated symbol pages directly. Add descriptions beside the relevant declaration, parameter, or member. The generator also writes links from the older reference locations so existing guide links keep working.

## Preview the site

```sh
npm run export:docs
```

Open `out/docs/index.html` in a browser. Check navigation, links, code samples, and narrow layouts. Markdown files under `docs/` are included automatically, except `ai-agents/`.

For the experimental static-folder export with pre-rendered pages and clean URLs, choose a new output directory and pass the published site URL:

```sh
node scripts/export-docs.mjs docs out/docs-site --static --url https://example.com/docs/
```

Serve the output with a static web server. The single-file export remains the default. The exporter refuses to reuse a static output directory so removed pages cannot remain published by accident.

Use relative links between guides. Put images within `docs/` and reference them with relative paths. The docs synchronization workflow runs when changes under `docs/` reach `main`. To publish manually, open **Actions → sync documentation → Run workflow** on GitHub.

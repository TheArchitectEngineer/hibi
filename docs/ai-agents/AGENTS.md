# Development instructions

- Keep core code, the renderer, shared UI, and addons separate. Never run workspace content as addon code.
- Put user help in `docs/` and contributor guides in `docs/development/`. Keep internal agent instructions and investigation notes in `docs/ai-agents/`. Every addon needs a user-facing `README.md`.
- Update documentation when behavior changes. After a public API change, run `npm run docs` and `npm run docs:check`.
- Write user-facing explanations in complete sentences and paragraphs. Include only what helps someone use the feature; keep implementation details in technical documentation. Labels and buttons can be short. Terse working-chat styles do not apply to product copy or documentation.
- Keep technical explanations direct. If one sentence answers the question, stop there; do not add detail just to sound thorough.
- Preserve API compatibility. Breaking SDK changes need an API version bump and addon migrations.
- Reuse the shared sidebar for settings, workspace navigation, and exported sites.
- Keep IPC requests limited to their purpose, and validate paths in the main process. Preserve unsaved edits and checks for external file changes.
- Run `npm run check`. Commit complete changes as you go. Keep user notes and private addons out of commits.

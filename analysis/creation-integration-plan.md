# Creation integration implementation plan

Baseline: 2026-11-15, branch `main`, HEAD `f262abacf0b15ac04ed581fb26c0dd195811bded`, clean worktree. No checkout/reset, commits, pushes or PRs. `node --test tests/*.test.js`: 507 tests, 501 pass, 6 fail (capture in temp/refactor-baseline.txt). npm.ps1 has a local permission issue; invoke Node directly.

## Architecture findings

- features/creation.js owns the session and QC handoff; GenerationTask owns requests, abort, retries and results independently of mounted pages. Both currently survive SPA navigation only.
- generate.js uses five presentation panels. Template presence currently suppresses Copilot and Creative Brief and routes settings through a template form.
- creative-copilot.js and creative-brief.js share frontend/backend validation. OpenAI translates optional fields to required nullable fields; recommended is optional and the adapter explicitly encourages null. Require an explicit nullable recommendation contract without fabricating a value.
- GenerationTask's template branch forces structure.length shots, overwrites timing/camera by array index, and bypasses plan confirmation. FreeformStoryboard already supplies duration ranges, typed schemas, validation and a repair attempt.
- Prisma Template contains identity/catalog columns plus JSON content. /api/get-templates currently transfers full content; templates.js filters in memory and retains browse state. Detail/back navigation is router-owned.
- QC and AppShell already own morph, pointer gestures, bottom navigation and header effects. Extend their existing controls, not their animation engines.
- page-host and app-shell load shared feature modules; spa-router loads page assets and owns mount/unmount and history.

## Stages, dependencies, acceptance and risks

1. **Recommendation contract** — lib/ai/copilot.js, creative-brief.js, creative-copilot.js, generate.js, tests. Explicit valid value only; optional/null/invalid recommendation must never choose an option. Preserve both providers' instructions. Validate adapter/schema and frontend parity.
2. **Session and logical stages** (depends 1) — creation.js, generate.js, QC. Add mode, discussion stage, entry/return context and template browser state to the authoritative session; centralized template changes invalidate dependent work safely. Bounded sessionStorage checkpoint excludes full templates, images and tasks. Reload resumes discussion/settings after loading selected template by ID; interrupted generation cannot be represented as a running restored job. Test new/resume/reset/cancel/mount behavior.
3. **Shared template discussion** (depends 2) — Copilot, brief contract, backend template context. Server loads selected template by ID, sends trusted stored summary/structure/variables, never claims URL viewing. Story then variable discussion uses one conversation and structured suggestions/confirmed values. Collapsible manual edits update generation input. Risks: stale replies, variable overwrites, excessive context. Test revisions, template switching, answers and provider null normalization.
4. **Shared storyboard planning** (depends 2–3) — FreeformStoryboard, GenerationTask, AI route schema, generate.js. Template nodes receive deterministic unique IDs, each shot references exactly one valid node; multiple shots per node allowed, no cross-node ambiguity. Reuse duration/shot limits, repair, plan editor and image confirmation. Never overwrite generated camera/duration by template index. Validate 4→8, 6→different count, target duration changes, invalid mapping and retry.
5. **Catalog and recommendations** (depends 2–3) — shared template-presentation filtering, server catalog/detail/recommendation APIs, generate browser, template page. Lightweight summaries, bounded candidates and AI ranking with validated IDs; cache/deduplicate and paginate. Full data only for selected template. Nonblocking manual fallback. Row layout with preview/check, shared search/category/tag/sort. Preserve filters/scroll and session when preview/back; no repeated Copilot call or task. Risk: history loops and old API compatibility; retain legacy catalog endpoint.
6. **QC and mobile navigation** (depends 2–5) — quick-compose.js, quick-create.css, template apply entry, generate header. Shared mode controls and compact template summary, preserve unsent draft across apply/reset, mobile apply opens QC. Existing text flight and animation cancellation stay in place. Separate previous creation step from workspace exit. Test route and lifecycle guards.
7. **Regression and visual validation** (after each stage and final) — behavioral Node tests plus actual browser interaction at 375, 390, 768, 1024, 1440, 1920. Observe QC, text flight, rows, preview/back, reduced motion and remount. Real provider/physical keyboard checks require working services/device; report mocked versus live tests separately and never infer visual success from DOM tests.

## Delivery

Record changed files, completed and incomplete stages, tests and baseline failures, provider mock/live distinction, viewport interaction evidence, limitations and remaining risks. Do not declare unexecuted validation passed.

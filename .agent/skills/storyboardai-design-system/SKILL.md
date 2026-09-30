---
name: storyboardai-design-system
description: Apply and protect the StoryboardAI UI/UX design system when reviewing, designing, refactoring, or implementing StoryboardAI interfaces. Use for dashboard, projects, generate flow, project detail, template library, landing/auth, responsive/mobile work, component extraction, design-token cleanup, alignment audits, visual-style audits, or any request that must preserve StoryboardAI's existing SPA, Quick Create, option morph, and mobile navigation interactions while keeping the product visually consistent.
---

# StoryboardAI Design System

Use this skill as the design and implementation guardrail for StoryboardAI. Preserve the product's established visual DNA while preventing page-specific style drift, duplicated components, responsive regressions, and accidental rewrites of protected interactions.

## Core principle

Maintain this design DNA:

**Cold Editorial × Film Language × Matte Acrylic**

Treat the following as golden references:
- Dashboard: overall airiness, neutral surfaces, hierarchy, spacing, and page rhythm.
- Quick Create (QC): signature creation interaction, matte acrylic, diffuse light, and morph behavior.
- Project/film card: film-strip language for storyboard/video content.
- Mobile bottom navigation: floating tactile mobile material and interaction language.

Do not make every page identical. Make every page feel unmistakably part of the same product.

## Workflow

1. **Inspect before changing.** For implementation work, inspect the current StoryboardAI repository and relevant page/component files before proposing or editing code. Treat the live repository as implementation truth and this skill as design-intent truth.
2. **Classify the task.** Determine whether it is primarily: visual review, component change, page migration, responsive fix, alignment fix, or design-system refactor.
3. **Load only the needed references.**
   - Read `references/design-dna.md` for visual direction and effect permissions.
   - Read `references/foundations.md` for tokens, typography, spacing, radius, shadow, layout, and motion.
   - Read `references/components.md` for shared-component rules.
   - Read `references/responsive-alignment.md` for responsive composition, page grid, and alignment.
   - Read `references/protected-interactions.md` before touching QC, SPA routing, option morph, or mobile navigation.
   - Read `references/page-patterns.md` when changing a specific page family.
   - Read `references/review-checklist.md` before finalizing a visual or code change.
4. **Reuse before creating.** Search for an existing token, shared component, or variant before introducing a new one.
5. **Prefer migration over rewrite.** Extract, normalize, and reuse existing working UI. Avoid replacing mature behavior with a fresh implementation unless explicitly requested.
6. **Preserve protected interactions.** If the requested visual change can be completed without changing protected motion/JS behavior, do not touch that behavior.
7. **Validate desktop and mobile independently.** Mobile is a recomposition of information hierarchy, not a shrunken desktop layout.
8. **Run a consistency audit.** Check layout, alignment, spacing, visual DNA, component family, effect permissions, and responsive behavior before calling the task complete.

## Repository-aware behavior

For code changes, verify the current implementation rather than assuming file names or selectors are unchanged. Common areas include:
- `public/css/tokens.css` and `public/css/tokens/`
- `public/css/components/` when present
- shared shell/layout CSS
- page CSS such as dashboard, projects, generate, project-detail, template, landing, auth
- `public/js/spa-router.js` and page-specific JS

If the repository and this skill disagree, preserve the user's explicit request and protected interactions, then identify the mismatch. Do not silently overwrite newer project decisions with stale guidance.

## Non-negotiable rules

- Use StoryboardAI Blue for system primary interaction. Keep category/status colors semantic and local.
- Keep rainbow/diffuse creation glow exclusive to QC/Create Trigger states unless the user explicitly expands its role.
- Use matte acrylic mainly for floating interactive surfaces, not ordinary page cards.
- Use film-strip motifs only when content semantics involve storyboard, shots, video, or timeline.
- Keep page CSS responsible for composition; keep shared component visuals in shared component styles.
- Keep one primary vertical scroll owner per route where practical.
- Use design tokens instead of inventing page-local colors, radii, shadows, or spacing values.
- Align page titles, section headers, grids, and actions to shared page gutters and anchors.
- Do not solve mobile overflow by shrinking text until it fits.
- Do not introduce a second product-wide visual language for Template, Generate, Project Detail, or any new page.
- Do not use Emoji as permanent system icons.

## Output behavior

For **UI review**, organize findings by severity when useful: Critical, Major, Minor, Polish. Explain the design-system rule violated and the concrete correction.

For **implementation plans**, provide ordered migration steps, affected files/components, protected areas, responsive requirements, and acceptance criteria. Prefer small safe phases over one large rewrite.

For **code changes**, make the smallest coherent change that achieves the requested visual result while increasing reuse and consistency. Do not opportunistically refactor unrelated behavior.

For **new components**, state which existing component family and tokens they inherit. If a new visual primitive is genuinely required, explain why an existing primitive cannot cover the use case.

## Completion test

A change is not complete until it passes both questions:
1. Does it work correctly at the intended desktop and mobile sizes?
2. If the StoryboardAI logo were hidden, would the screen still feel like the same product?

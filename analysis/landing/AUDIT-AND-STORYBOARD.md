# Landing page redesign audit and storyboard

Date: 2026-11-10 (Asia/Taipei)

## Audit

- `public/html/index.html`: the original opening, film and concept video established a useful film-making vocabulary. The 900px empty spacer, unfinished feature paragraph, unsupported template counts, pricing quotas, user count and enterprise/offline claims were removed under the requested content rewrite scope.
- `public/css/landing.css`: fixed viewport film overlay, viewport-sized hero, 1400px slogan, hidden workflow/pricing, global class names and 100vw layouts made the experience fragile on small screens. These are replaced by landing-prefixed layouts, intrinsic media ratios, capped containers and mobile recomposition.
- `public/js/landing-animation.js`: overlapping ScrollTriggers independently animated the same hero and film properties, including layout dimensions, top, blur and clip-path. Cleanup killed every page's ScrollTrigger. Anchor handlers accumulated. The replacement owns three scene timelines in one matchMedia scope and reverts only that scope.
- `public/js/landing.js`: observer reset video playback on re-entry, registered redundant resize/reset handlers and chained cleanup through a global function later overwritten by the animation module. The replacement has one abortable logic session, native video controls and explicit teardown.
- SPA contract: `PageHost.captureLanding()` caches original main markup before animation setup; `PageHost.mount()` clones it on return. Router caches scripts, invokes `initLandingPage` and calls `_landingKill` on route change. This contract and route files are retained. Nav and app transition layers stay outside main.
- Design system: existing `public/css/tokens/` supplies semantic colors, Noto Sans TC, Syne, spacing, motion and continuous radii. Shared CSS and protected interactions are not redesigned.
- Material: existing desktop/mobile workspace screenshots, concept MP4, style images and logo. Screenshot assets are existing repository captures, not a new authenticated product capture. The shot sheet and story input explicitly say they are examples.
- Verified capabilities: `features/creative-copilot.js` lists narrative/audience/tone/style/ratio/duration fields; `features/freeform-storyboard.js` produces story/camera/duration/dialogue/visual-prompt shot data; `pages/project-detail.js` implements editing and table/film views. No new quota, customer, speed, price or offline claim was added.

## Storyboard

| Scene | Content and composition | Motion and handoff |
| --- | --- | --- |
| Opening | Original headline, one product sentence, login CTA, diagonal film using existing style images, pale blue squircle | Film moves as one object; text stays readable and interactive. Mobile film becomes an in-flow landscape rail. |
| Product | Large real repository workspace screenshot, mobile-specific capture; native concept video in an optional disclosure | Screenshot gently aligns and grows into its final frame on approach; no pin or empty runway. Video is visitor-controlled. |
| Workflow | Story input → AI creative discussion → editable shots; editorial numbered sequence beside an anchored heading | Natural document scroll; desktop heading uses CSS sticky while the actual content supplies the height. Mobile is one column. |
| Editing | Clearly marked example shot sheet beside three concrete editing capabilities | Sheet aligns as one object, with mobile rotation removed. Prose stays still. |
| Start | Blue production-slate ending with registration and login routes | Static, clear CTA. No automatic looping effects. |

## Animation ownership

- Fixed, locally served GSAP 3.14.2 and ScrollTrigger from the installed dependency (`public/js/vendor/`). Upstream copyright/license headers retained.
- `initLandingPage` destroys the previous session and initializes the current main's landing root. `_landingKill` aborts listeners/timers, reverts matchMedia and tears down logic. Other ScrollTriggers survive.
- Three timelines: `landing-opening`, `landing-product`, `landing-sheet`. Each has a named sequence label and one ScrollTrigger. Transform only; no pin, forced scroll, global kill, blur or mask animation.
- Desktop/mobile/reduced-motion conditions are explicit. Reduced motion restores base CSS and creates no landing ScrollTriggers. No animation hides text, controls or media.
- Font readiness, media load/error, video disclosure toggle, pageshow and visibility restore request a guarded/debounced refresh. ScrollTrigger handles its own debounced resize; matchMedia reverts and reconstructs at breakpoints.
- Delegated anchor handling excludes `data-navigate`, ignores empty/nonexistent targets and focuses destination sections. Native anchors and real route URLs remain available without landing JS.

## References actually read

- Local Hallmark SKILL.md and redesign, brand-truth, direction, layout, anatomy, imagery, craft, patterns, gates and scroll-choreography references. Brand-first route; retained project tokens instead of running a scaffold that would replace the existing token aggregator.
- Official GSAP skills, fetched read-only from `https://github.com/greensock/gsap-skills/tree/main/skills`: gsap-scrolltrigger, gsap-timeline, gsap-performance. No additional skills installed.
- GSAP matchMedia documentation: https://gsap.com/docs/v3/GSAP/gsap.matchMedia()/
- Astryx homepage: https://astryx.atmeta.com/
- Astryx repository README: https://github.com/meta/astryx (read through raw.githubusercontent.com).
- Astryx-inspired choices: semantic CSS custom properties, predictable control states, composable sections, explicit focus and motion preferences. No React, StyleX or Astryx runtime dependency added.

## QA record

See `qa-results.json`, `motion-*.json`, scene screenshots and the final report. The actual root URL was tested through its production iframe shell, not only the child document.

Hallmark scans follow every imported shared stylesheet. The complete import graph has pre-existing findings in project-card, quick-create, shell, typography and other shared styles. Landing-only CSS scan: 0 FAIL / 0 REFLEX / 0 WARN. Shared styles were kept within task scope. Hallmark's built-in render initially timed out; actual Chrome screenshots and interaction assertions were performed separately with Puppeteer.

## Deliberate content changes

- Original `靈感，一鍵轉換` retained; added one factual sentence explaining the product.
- Replaced `巴拉巴拉…` test paragraph with editing capabilities verified in code.
- Removed `超過百種` template count, `一秒生成`, monthly quota/prices, unlimited/offline/enterprise promises and `數百位創作者`; repository implementation did not establish these as current product facts.
- Replaced the original generic feature cards, obsolete workflow and pricing block with creative-discussion workflow and editable-shot explanation.
- `#videos`, `#how`, `#features`, `#cta`, `#heroSection`, `#intro_video`, nav, page-main, app scripts and transition layers retained. `#pricing` removed because unverified plans were retired, with no remaining links to it. Login/register behavior remains owned by the router, including redirecting signed-in users to dashboard.


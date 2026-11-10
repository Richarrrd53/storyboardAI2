# Landing redesign validation

2026-11-10, local Chrome headless on Windows, through the real root URL's iframe shell unless noted.

| Check | Result |
| --- | --- |
| 1440, 1024, 768, 390, 375px | Passed: section screenshots, no horizontal overflow or overflowing headings |
| Scene start / middle / end / reverse | Passed for all three scene timelines at every required width; values in motion-*.json |
| Fast scroll | Passed, no drift after return to scene start |
| First entry and reload | Passed |
| Hero login CTA | Passed; leaves landing and tears down its three triggers |
| Browser Back | Passed after router history commit; returns through parent-owned history |
| Login / landing repeat | Passed, three full round trips |
| Register CTA | Passed |
| Repeated init / destroy | Passed, five initializations keep three landing triggers; teardown preserves an independent test trigger |
| prefers-reduced-motion | Passed live changes: 3 → 0 → 3 triggers; readable static composition |
| Actual resize without reload | Passed 1440 → 768; breakpoint rebuild retains three triggers |
| Mobile touch | Passed native touchStart / touchMove / touchEnd; 375px vertical scroll recorded |
| Page restore event | Passed pageshow persisted-event refresh; real OS browser BFCache eviction/restoration not reproduced |
| Anchors / focus | Passed; destination section receives focus |
| Concept video | Passed actual MP4 playback, native controls and readyState 4; disclosure refresh moved the next trigger 1924 → 2345 → 1924 |
| Listener stability | Eight initializations: window stays 13, document stays 17 listeners |
| GSAP request failure | Passed readable content and links |
| Scripts disabled | Passed directly served /html/index.html; the existing root iframe shell still requires JS |
| Browser runtime / console | No errors on the normal test flows; deliberate vendor request failure is isolated |
| Repository test suite | 379 passed, 0 failed (`node --test tests/*.test.js`) |
| JS syntax / diff whitespace | Passed |
| Hallmark independent review | ship, after requested full-page/fold recaptures |
| Hallmark landing-only CSS | 0 FAIL / 0 REFLEX / 0 WARN |

Full-page screenshots: full-1440.png and full-375.png.
Additional folds: 1280x800, 1440x900, 1920x1080 and 375x844.
Required-width section captures: hero, product, workflow, editing and cta PNGs.
Raw results: qa-results.json and extra-results.json.

The built-in Hallmark renderer timed out against the full import graph; separate
Puppeteer Chrome captures provided the actual visual evidence. The full graph's
static scan still reports pre-existing shared-style findings outside landing
scope. They were not treated as landing defects or claimed fixed.

## Limits

- Chrome device emulation is not physical iOS/Safari/Android device verification.
- No low-end-device FPS, memory profiling or real Safari video test was performed.
- Existing repository desktop/mobile workspace captures are used; no new signed-in
  workspace capture or live AI-generation session was performed.
- Form submission/authentication and paid/backend operations were not exercised.
- Actual BFCache navigation was not guaranteed; pageshow handling was exercised by event.
- No new metrics, pricing, user counts, quotas, speed promises or offline claims.

## Reproduce

Start the app with `node server.js`. Browser QA scripts are stored here; they use
an isolated Puppeteer Core installation under temp/landing-qa, outside project
dependencies. Set PUPPETEER_MODULE to its absolute JS entry and CHROME_PATH to a
Chrome executable when using a different setup. Run from the repository root.

`node analysis/landing/verify-browser.cjs`

`node analysis/landing/verify-extra.cjs`

The first script captures all required widths and tests route/lifecycle/fallback
behavior. `--routes-only` reuses previous viewport results and reruns regression.
The extra script checks resize, listener stability, anchors and video playback.

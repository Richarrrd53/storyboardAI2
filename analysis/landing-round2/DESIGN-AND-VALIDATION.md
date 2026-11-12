# Landing round two — film into workspace

## What stays and what returns

The current editorial hierarchy, Chinese copy, brand blue/type/tokens, responsive grids, native video controls, links, router entrypoints, AbortController listeners and scoped matchMedia lifetime remain. Existing package.json/package-lock.json changes were left untouched.

Historical source reviewed: `de5659ce:public/js/landing-animation.js`, `public/css/landing.css`, and `public/html/index.html`. The old design expanded its hero background, flattened film perspective, enlarged the film towards the lens, changed the background and revealed video. Its fixed 900px spacer, width/height/top/filter animation and global ScrollTrigger killing are not restored.

## Choreography

- **A / Film:** expand the independent background plane; fade copy; resolve -38° film perspective, translate in depth from -120 to 720, and enlarge through the camera. A single perspective projection avoids the double-projection singularity found in the first visual pass. The film remains visible as the product starts appearing.
- **B / Workspace:** continue the same pinned timeline, reveal the actual current workspace through a cropped window at 0.38 scale with a 24° tilt, then open the window and resolve the workspace. Title and matte floating label settle afterwards. Product navigation targets the timeline's end, rather than the absolute section's DOM offset. A short owned GSAP scroll tween survives image-triggered pin refreshes; wheel/touch/scroll keys, resizing, motion preference changes and unmount cancel it. Native smooth scrolling proved interruptible in the first regression runs.
- **C / Creative workflow:** a separate pinned composition progresses through story input → illustrative discussion/brief → shot arrangement → per-shot camera/duration editing. Labels identify example content and existing style images. Cards rotate into order within their own space; the final toolbar uses the product's matte acrylic recipe.

Scroll space is created by ScrollTrigger pin spacing, calculated from viewport height: A+B 2.8 desktop / 1.65 mobile viewports; C 2.5 / 1.85. There is no fixed empty spacer. Mobile uses planar scaling, shorter camera moves and a separate short-height hero composition. Blur and shadow are static; scroll animates transforms/opacity and the bounded product clip mask.

## Materials and source truth

The page reuses semantic colors, fonts, radii, elevations, `--glass-nav-*`, `.matte-acrylic`, and `--surface-floating-*`. Ordinary content remains opaque. Product source examined includes dashboard/projects/generate HTML, Dashboard module, creative-brief validation, acrylic/mobile-nav/blur/motion tokens, QC and shell.

`public/screenshot/current/` contains six browser captures of the **current local product source**, using isolated browser-only QA identity and empty project/template API responses. These are not a production login, real customer data, a successful AI generation or a changed product UI. Dashboard and Generate captures replace the old landing assets; Projects captures document the inspected empty state. Provenance and the repeatable capture command are beside the assets. A genuine signed-in populated workspace/AI session remains a possible future replacement, not a claim of this work.

## Reproduction and evidence

Start `node server.js`, then:

```
node analysis/landing-round2/capture-product.cjs
node analysis/landing-round2/verify.cjs
node --test tests/app-shell.test.js
node .agents/skills/hallmark/scripts/sloplint.mjs public/css/landing.css
```

The browser scripts use the existing Puppeteer installation in `temp/landing-qa` and local Chrome. External requests are blocked in QA; no API charge or production write is needed. Screenshots therefore use locally available font fallbacks when external Google Fonts cannot load.

- `hero-{width}.png`: initial states, including 1280×800 and 375×667.
- `film-start`, `film-cross`, `product-reveal`, `product`: camera states at desktop/phone sizes.
- `story`, `discussion`, `shots`, `editing`: meaningful workflow states.
- `full-1440.png`, `full-390.png`: complete **reduced-motion composition**, with every state readable in one still. A full still cannot depict all pinned animated states; the separate captures cover those.
- `no-js.png`: complete direct HTML fallback. The parent app shell itself needs JS to create its iframe, as before.
- `results.json`: final browser assertions and any runtime errors. A test failure must be resolved before claiming a pass.
- `shell-tests.txt`: 22 existing app-shell/mobile-navigation tests.
- `hallmark-static.txt`: stylesheet lint. Hallmark's separate render runner was attempted but timed out launching Chrome; the dedicated browser verifier supplies actual rendered evidence instead.

Independent Hallmark finish review identified short-phone action overlap, invisible focus targets and entering-card caption collision. All three were corrected before final recapture. No performance claim about physical phones is made; touch input and rendering are checked through Chrome mobile emulation.

## Final result

Final `verify.cjs` run exited 0: six widths (1440, 1280, 1024, 768, 390, 375), no horizontal overflow/broken assets/runtime exceptions; forward/reverse and rapid scroll; live reduced motion; product navigation; three SPA route round trips; five repeated initializations with an unrelated trigger preserved; no leftover pins on exit; viewport resize, touch swipe and pageshow; direct no-JS fallback. Existing shell tests: 22/22 passed. Final CSS static check: 0 FAIL / 0 REFLEX / 0 WARN. JavaScript syntax and `git diff --check` passed. Independent visual recapture review reported no remaining actionable findings in the reviewed states.

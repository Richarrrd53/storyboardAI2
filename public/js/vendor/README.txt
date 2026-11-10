GSAP browser distributions

Version: 3.14.2, matching the installed gsap dependency at implementation time.
Source: node_modules/gsap/dist/gsap.min.js and ScrollTrigger.min.js.
Upstream: https://gsap.com/
License: https://gsap.com/standard-license/

The upstream license/copyright headers are preserved in each file. These scripts
are loaded once by the SPA shell document before page scripts. Landing scenes
use these shared globals but own and revert only their own matchMedia context.
When upgrading the gsap dependency, copy both matching distribution files and
rerun the landing browser regression checks. No ScrollToPlugin is required.

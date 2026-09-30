# Responsive and Alignment Rules

## Mobile is recomposition, not scaling

For each page, identify:
1. primary task
2. primary content
3. secondary information
4. secondary actions
5. desktop-only density

Then choose stack, collapse, bottom sheet, horizontal reel, progressive disclosure, hide, or a deliberately horizontal professional workspace.

Do not fix mobile by merely reducing font sizes or forcing desktop controls into a narrower row.

## Breakpoint intent

Prefer the project-wide breakpoint system. A useful conceptual model is:
- small mobile: up to ~480px
- large mobile: ~481–768px
- tablet: ~769–1024px
- desktop: ~1025–1439px
- wide desktop: 1440px+

Do not invent many near-duplicate page breakpoints unless a component has a documented need.

## Global alignment anchors

Use shared outer gutters and align:
- page title
- page subtitle
- hero
- section header
- grid/reel start
- empty state
- right-side page actions

Dashboard, Projects, Template, Generate, and Project Detail should not drift horizontally by arbitrary offsets.

## Logo and greeting

When aligning the expanded-sidebar brand lockup with Dashboard greeting/header, use the wordmark/text baseline or visual center as the anchor rather than the logo image bounding box. Small optical offsets are allowed when documented at the component level.

## Vertical rhythm

Use spacing tokens between page header, primary content, section headers, cards, and subsequent sections. Repeated hierarchy should produce repeated rhythm.

## Horizontal reels

On mobile, a horizontal reel may bleed to the viewport edge, but the first card should visually align with the page's normal content gutter. Show part of the next card when it helps communicate scrollability.

## Bottom navigation and safe area

Keep floating bottom navigation centered and account for `env(safe-area-inset-bottom)` in scrollable page content. Ensure the final actionable content is never hidden behind the navigation.

The center Create Trigger must remain visually centered on the viewport, not shifted by unequal left/right nav-item widths.

## Alignment audit

Check at minimum:
- logo/wordmark versus page-header visual baseline
- title left edge versus body/grid left edge
- page action right edge versus content right edge
- section title versus section content
- card grid start versus page header
- workspace header versus workspace body center axis
- repeated vertical gaps

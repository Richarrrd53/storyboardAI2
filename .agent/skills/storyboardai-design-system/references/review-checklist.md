# StoryboardAI UI Review Checklist

Use the relevant items after each meaningful UI change.

## Protected interactions
- SPA transition unchanged unless explicitly requested
- QC open/close/submit/transition behavior unchanged
- option morph unchanged
- mobile bottom navigation interaction unchanged

## Visual DNA
- system primary interaction remains StoryboardAI Blue
- neutrals remain consistent
- category colors stay local to content semantics
- QC glow has not leaked into ordinary CTA controls
- matte acrylic is limited mainly to floating surfaces
- film-strip motif appears only where storyboard/video semantics justify it
- icons are consistent and not replaced with Emoji

## Components
- reused an existing component or variant where possible
- no near-duplicate button/card implementation was introduced
- shared component styles are not redefined page-by-page
- values use tokens instead of arbitrary duplicates

## Alignment
- page title aligns with content grid
- section headers align with section content
- page actions align to the shared right edge
- Dashboard greeting/hero/recent-projects align
- Projects title/grid/action align
- Template header/category/search/grid share an outer grid
- Generate header/body/actions share a deliberate center axis
- Project Detail header/body share a consistent outer grid

## Responsive
Check at representative widths such as 375, 390, 430, 768, 1024, 1440, and 1920 when the scope warrants it.

Verify:
- no unintended horizontal overflow
- no text-label breakage caused by cramped desktop composition
- touch targets remain usable
- final content is not hidden behind bottom navigation
- mobile hierarchy was recomposed rather than merely shrunk
- wide desktop content does not stretch without limit

## Final recognition test

Hide the logo mentally. The page should still feel like StoryboardAI through its spacing, blue interaction language, card family, film semantics, matte floating surfaces, typography, and motion.

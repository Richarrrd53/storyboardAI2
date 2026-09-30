# Shared Component Rules

## General rule

Before adding a selector or markup pattern, determine whether the function already belongs to a shared component family. Prefer variants over separate near-duplicate components.

Page CSS controls placement and composition. Shared component CSS controls component appearance and interaction states.

## Button family

Use a small shared family:
- Primary
- Secondary
- Ghost
- Outline when genuinely needed
- Danger
- Icon

Do not create one-off page-local primary buttons. QC glow is not a button variant; it is a creation-trigger effect.

## Card family

Cards may differ by function but should feel related through shared surface, border, radius scale, shadow logic, typography hierarchy, spacing rhythm, and hover behavior.

Recommended families:
- Content Card
- Project Card
- Template Card
- Action Card
- Floating Card

## Project Card

Dashboard and Projects should share one ProjectCard family. Prefer variants such as compact/full rather than separate visual implementations.

Shared parts should include where applicable:
- film-strip treatment
- thumbnail and fallback
- aspect/shot badges
- title and metadata
- border/radius/shadow
- hover state

Use compact density for Dashboard and full controls for Projects, but do not make them look like unrelated cards unless explicitly requested.

When the user asks for the Dashboard card to “match Projects exactly,” prefer using the same full variant or the same markup/component with only layout placement differences, rather than duplicating Projects styles into Dashboard-specific selectors.

## Inputs

Use shared input surface, border, focus, typography, control height, and error states. Page-specific forms can change arrangement, not the global visual language.

## Floating surfaces

Popover, bottom sheet, floating menu, option menu, and QC may use matte acrylic. Share border, scrim, blur, shadow, and radius logic where possible.

## Iconography

Use a consistent system icon family. Typical standard icon size is 24px, with 20px or 16px for compact controls. Keep stroke weight and rounded linecap/linejoin visually consistent. Avoid Emoji as permanent interface icons.

## New component test

Before creating a new component, answer:
1. What existing family is closest?
2. Can a variant solve the difference?
3. Which existing tokens should it inherit?
4. Why would a new primitive be necessary?

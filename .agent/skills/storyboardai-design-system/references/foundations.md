# Foundations

## Source of truth

Prefer the repository's semantic tokens. Do not copy stale hard-coded values when the current token files already define them.

Common semantic roles include:
- `--color-brand-primary`
- `--color-text-primary`
- `--color-text-secondary`
- `--color-text-tertiary`
- `--color-text-muted`
- `--color-bg-page`
- `--color-surface-primary`
- `--color-surface-secondary`
- `--color-surface-elevated`
- `--color-border-default`
- `--color-border-subtle`
- `--color-border-focus`
- `--color-action-primary-default`
- `--color-action-danger-default`

Legacy aliases may remain for compatibility during migration, but do not introduce new CSS using legacy color-named tokens when semantic tokens exist.

## Brand and neutral direction

Typical system direction:
- Brand primary: blue-600 / approximately `#2563EB`
- Brand light: blue-400 / approximately `#60A5FA`
- Accent sky: approximately `#0EA5E9`
- Page: slate-50 / approximately `#F8FAFC`
- Primary surface: white
- Primary text: slate-900 / approximately `#0F172A`
- Secondary text: slate-600 / approximately `#475569`
- Border: slate-200 / approximately `#E2E8F0`
- Film surface: slate-900 / slate-800

Always check the current token files before coding.

## Spacing

Use the established 4/8-based spacing scale. Prefer tokenized values such as 8, 12, 16, 24, 32, 48, and 64 for layout rhythm. Avoid page-specific values like 27px or 41px without a clear optical reason.

## Radius

Use the shared scale rather than arbitrary radii. Common roles:
- micro/badge: 4–8px
- input/control: 8–16px
- standard card: about 16px
- large card/hero: about 24px
- modal/bottom sheet: 24–32px
- floating capsule: pill

## Shadows

Use elevation roles rather than custom page-local shadows:
- low: ordinary card
- medium: hover/raised content
- high: popover/floating UI
- modal: dialog/overlay

Treat glow separately from shadow.

## Typography

Preferred roles:
- Chinese UI: Noto Sans TC
- Latin/body: DM Sans where already used
- Brand display: Syne where appropriate
- Timecode/technical: DM Mono

Do not create a different type system for individual pages.

Typical hierarchy:
- page title desktop: 30–36px
- page title mobile: 26–30px
- section title desktop: 22–24px
- section title mobile: 20–22px
- card title: 15–18px
- body: 14–16px
- metadata: 12–13px

## Layout

Default outer content container is approximately 1440px maximum width with shared gutters:
- desktop: 32px
- tablet: 24px
- mobile: 16px

Use current repository tokens when available.

## Motion

Reuse repository motion tokens. General character:
- press/toggle: short and responsive
- hover/state: fast
- surface enter/exit: controlled deceleration
- major morph: slower, intentional, possibly spring-like

Do not standardize protected QC or option-morph motion by overwriting their mature timings. Protected motion wins over generic motion guidance.

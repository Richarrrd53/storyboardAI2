# Protected Interaction Contracts

Treat these interactions as protected unless the user explicitly asks to redesign their behavior.

## SPA route transition

Protect the existing route transition, including any route-motion, gradient-mask, blur/fade, or intermediate state used by the current implementation. Do not replace the router or simplify transitions during unrelated UI cleanup.

## Quick Create / QC

Protect:
- desktop and mobile Create Trigger behavior
- capsule/input expand and collapse
- quick-suggestion sequencing
- diffuse background/glow behavior
- synchronized QC-to-Generate transition
- reverse close morph
- mobile-specific interaction/keyboard handling where present

Visual refactors may extract CSS or map values to tokens only if computed behavior remains effectively unchanged.

## Project Option Morph

Protect the existing sequence concept:
button → compact point/state → spatial/parabolic movement → expanded menu surface, plus blur/stagger entrance and reverse disappearance/collapse.

Do not replace it with a conventional dropdown merely to simplify implementation.

## Mobile bottom navigation

Protect the floating-nav interaction model, center Create integration, active indicator/jelly behavior, and navigation semantics. Fix spacing, safe-area, token, or visual-consistency issues without replacing its interaction language.

## Regression rule

If an unrelated UI change alters a protected interaction, treat that as a regression. Restore the protected behavior instead of layering more patches on top.

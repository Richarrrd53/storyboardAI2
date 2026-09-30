# StoryboardAI Visual DNA

## Identity

**Cold Editorial × Film Language × Matte Acrylic**

StoryboardAI should feel professional, creative, cinematic, light, calm, and deliberate. It should not drift into generic enterprise dashboards, purple SaaS, rainbow-AI branding, cyberpunk, heavy glassmorphism, cute dopamine UI, or full dark NLE styling.

## Golden references

### Dashboard
Use as the reference for page atmosphere, neutral surfaces, whitespace, typography hierarchy, section spacing, and overall density.

### Quick Create / QC
Use as the reference for brand-signature motion, diffuse creation light, matte acrylic, floating interaction, and morph behavior.

### Project / film card
Use as the reference for film-strip language, thumbnail presentation, storyboard/video metadata, and dark cinematic accents.

### Mobile bottom navigation
Use as the reference for tactile floating mobile controls, rounded material, and touch feedback.

## Three-Tier Layering Model (Desktop Frame Architecture)

To prevent the interface from feeling washed out or floating on one flat layer, desktop StoryboardAI utilizes a 3-tier tactile canvas architecture:

1. **Tier 1: 🌑 Deep Navy App Shell (`--app-shell: #0c1324`)**
   - The outer structural envelope (`body.dashboard-layout`, `#BG`).
   - Outer frame margins expose 8–16px around the canvas on top, bottom, and right.
   - The left sidebar directly dissolves into this dark shell without an awkward intermediate grey container.
   - Sidebar icons default to soft slate line style (`#94a3b8`), brightening to white on hover (`#ffffff`).
   - Selected sidebar item uses a high-contrast white pill (`::before` with `#ffffff` and ambient drop-shadow) with an active deep navy fill icon (`#172554`).

2. **Tier 2: 🩶 Inset Cold Canvas (`--canvas: #f8fafc`)**
   - The primary application viewport (`#page-main`).
   - Features a generous 28px outer radius (`border-radius: 28px`), fine rim illumination (`border: 1px solid rgba(255, 255, 255, 0.08)`), and soft spatial drop-shadow (`box-shadow: 0 8px 32px rgba(0, 0, 0, 0.28)`).
   - Functions as an organized creative studio desk / drawing canvas.

3. **Tier 3: ⬜ Structured Cards & Content Blocks (`#ffffff`)**
   - Individual UI components inside the canvas: Hero banner, AI Script Parsing quick action, Filmstrip project cards, Template cards.
   - Crisp pure-white backgrounds with subtle borders (`1px solid var(--color-border-card)`) and elevation, standing out cleanly against the cold canvas without visual dilution.

## Color roles

System UI is balanced across the 3-tier architecture:
- **60–70% white/slate cold neutrals**: Inset canvas (`#f8fafc`) and internal cards (`#ffffff`).
- **15–25% navy/film-dark structural framing**: Outer shell (`#0c1324`), film-strip headers (`#1e293b`), and primary CTA anchors.
- **5–10% StoryboardAI Blue**: Brand accents, active links, primary action highlights (`#2563eb`).
- **under 5% semantic/category accents**: Status tags, timelines, and discrete feature indicators.

Use category colors only for content categories, tags, timelines, status, or semantic feedback. Do not let category purple/orange/green become page-wide system chrome.

## Effect permissions

### Rainbow / conic / diffuse creation glow
Use only for:
- desktop QC/Create Trigger
- mobile center Create Trigger
- QC transition states

Do not use on ordinary CTA buttons such as “新增分鏡”.

### Matte acrylic / glass-like material
Use mainly for:
- QC
- mobile bottom navigation
- popovers
- floating menus
- bottom sheets
- floating toolbars/controls
- option-morph surfaces

Use solid surfaces for ordinary content cards, forms, page containers, project cards, and template cards.

### Film-strip motif
Use only when it communicates storyboard/video/shot/timeline semantics. Avoid film decoration on generic settings, login inputs, account menus, search boxes, and ordinary dialogs.

## Recognition test

Hide the logo and ask: “Would this still look like StoryboardAI?”

Check blue usage, neutral palette, card family, border/shadow logic, typography, alignment, iconography, material, film semantics, and motion. If several elements feel borrowed from another product language, converge them before finalizing.

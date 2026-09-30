---
name: storyboardai-design-system
description: "StoryboardAI Design System guide and reference. Defines Cold Editorial × Film Language × Matte Acrylic visual DNA, tokens, layout shell, alignment anchors, protected interactions, and components."
---

# StoryboardAI Design System Reference Manual

## 1. Visual DNA & Philosophy
StoryboardAI is built on three core pillars:
1. **Cold Editorial**:
   - Primary: Deep Slate (`#0f172a`), Dark Charcoal (`#1e293b`), Off-White background (`#f8fafc`).
   - Accent: Brand Electric Blue (`#2563eb`), Subtle Cobalt (`#1d4ed8`), Soft Glows.
   - Clean typographical hierarchy, monospaced tech metadata (`DM Mono` / monospace), and restrained, purposeful color usage.
2. **Film Language**:
   - Cinematic Sprocket holes (3:2 ratio with rounded inner corners).
   - Minimalist Filmstrip headers (`#18181b` dark film strip with punched sprocket holes and uppercase scene/cut numbering `#SCENE_01`).
   - 16:9 thumbnail ratio for video/storyboard framing.
   - Director slate / clapper metadata anchors.
3. **Matte Acrylic**:
   - Thick, semi-translucent frosted glass surfaces (`backdrop-filter: blur(16px~24px)` with high saturation `saturate(180%)`).
   - Soft directional light border (`border: 1px solid rgba(255, 255, 255, 0.75)` on top/inner light reflection).
   - Multi-layered soft drop shadows (Elevation 0 through Elevation 4).

---

## 2. Protected Interaction Contracts
The following core interactions are hardened and MUST NOT be rewritten or degraded:
1. **SPA Route Transition & Dynamic Gradient Mask**:
   - Main container: `<main id="page-main" class="page-shell page-<route>">`.
   - Scroll container: `.content-body[data-dynamic-mask]` with vertical mask size 36px.
   - Motion: Easing curves `cubic-bezier(0.16, 1, 0.3, 1)` with staggered fade & upward slide.
2. **AI Quick Compose (QC)**:
   - Capsule trigger button with organic morph into creation surface.
   - **Rainbow Ambient Glow is strictly reserved for the QC Trigger only**. It must NEVER be applied to standard action buttons (e.g. `+ 新增分鏡`).
3. **Project Option Morph**:
   - `Button → Dot → Parabola → Surface` spring animation.
4. **Mobile Portrait Floating Bottom Navigation**:
   - 5 tabs: Home, Projects, Create (center trigger), Templates, Profile.
   - Dynamic jelly motion indicator SVG.
   - Safe area inset padding: `padding: 0 0 calc(var(--mobile-nav-height, 64px) + env(safe-area-inset-bottom, 16px) + 32px) 0;`.

---

## 3. Tokens & Grid Alignment Anchors

### Breakpoint Matrix
| Breakpoint | Viewport Range | Sidebar State | Header & Body Gutter | Grid Columns |
|---|---|---|---|---|
| Mobile Small | `<= 480px` | Hidden (Floating Nav) | 16px | 1 column / Horizontal reel |
| Mobile Medium | `481px – 768px` | Hidden (Floating Nav) | 16px | 1 column / Horizontal reel |
| Tablet Portrait | `769px – 1024px` | Docked (60px) | 24px | 2 columns |
| Desktop Regular | `1025px – 1439px` | Docked (60px / 260px) | 32px | 3 columns |
| Desktop Wide | `>= 1440px` | Docked (60px / 260px) | 32px | 4 columns |

### Spacing & Vertical Rhythm
- **Header Top Padding (Desktop)**: `28px var(--page-gutter, 32px) 16px;`
- **Header Top Padding (Mobile)**: `max(16px, env(safe-area-inset-top)) 16px 8px;`
- **Section-to-Section Gap**: `var(--section-gap, 32px)` (Desktop) / `24px` (Mobile)
- **Card-to-Card Grid Gap**: `var(--content-gap, 24px)` (Desktop) / `16px` (Mobile)
- **Scroll Container Safe Area Bottom Padding**: `calc(var(--mobile-nav-height, 64px) + env(safe-area-inset-bottom, 16px) + 32px)`

---

## 4. Component Rules

### Standard Button Styles (`components/button.css`)
```html
<!-- Primary Action -->
<button class="btn btn-primary">
  <svg>...</svg>
  <span>新增分鏡</span>
</button>

<!-- Secondary Ghost Action -->
<button class="btn btn-ghost">取消</button>
```

### Standard Project Card (`components/project-card.css`)
Generated via `window.renderProjectCard(project, { variant: 'compact' | 'full' })`:
- `compact`: Used on Dashboard (horizontal snap reel on mobile, 4-column grid on desktop).
- `full`: Used on Projects and History pages (includes tag badges, description, and status bar).
- Structure:
  ```html
  <div class="project-card variant-<compact|full>">
    <div class="filmstrip-header">
      <div class="sprocket-hole"></div>
      <div class="sprocket-hole"></div>
      <div class="sprocket-hole"></div>
      <span class="filmstrip-title">#PROJECT_01</span>
    </div>
    <div class="card-thumb-wrap">
      <img src="..." alt="Thumbnail" />
    </div>
    <div class="card-meta">
      <h3 class="card-title">...</h3>
      <p class="card-date">...</p>
    </div>
  </div>
  ```

---

## 5. Adding New Pages (Checklist)
1. Add route markup in HTML with standard mounting shell:
   ```html
   <main id="page-main" class="page-shell page-<new-route> dash-main">
     <header class="content-header <new-route>-header anim-fadeInUp">
       <h1>頁面標題</h1>
       <button class="btn btn-primary">+ 主要動作</button>
     </header>
     <div class="content-body <new-route>-body anim-fadeInUp anim-delay-1" data-dynamic-mask data-mask-direction="vertical" data-mask-size="36">
       <!-- Body Content -->
     </div>
   </main>
   ```
2. In CSS, always use standard variables:
   - Horizontal gutter: `var(--page-gutter, 32px)`
   - Section gap: `var(--section-gap, 32px)`
   - Content gap: `var(--content-gap, 24px)`
   - Mobile bottom padding: `calc(var(--mobile-nav-height, 64px) + env(safe-area-inset-bottom, 16px) + 32px)`
3. Test responsiveness at 375px, 768px, 1024px, and 1440px.

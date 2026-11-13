# VX — Paramount Metaverse Platform

A responsive marketing landing page for **VX**, a metaverse platform for virtual events. The page pitches the platform's three big ideas (tell stories, customize 3D environments, socialize) and ends with a demo-request form. It is a hand-built, dependency-free static site — no framework, no build step — focused on motion, interaction and polish.

**Live site:** https://vsenses55.github.io/paramount-vx/

---

## Highlights

- **Animated aurora hero** — a WebGL shader background (simplex-noise "aurora") that sits behind the hero and the nav, with a CSS-gradient fallback if WebGL isn't available.
- **Scroll-linked trailer** — the VX trailer plays inline on a loop and scales up as it reaches the middle of the screen, then back down as it leaves.
- **Interactive platform preview** — the Socialize section embeds a live, clickable prototype of the platform in an `<iframe>`. It grows toward full-screen as you scroll in, **pins in place** while you explore it, then releases and the page carries on.
- **Cursor fluid** — a real-time fluid simulation (WebGL2) that the mouse stirs: dye and velocity, curl and pressure, with a slight RGB split at the edges of the flow and a fast fade-out.
- **Lens-warp image hover** — a WebGL magnify/warp that follows the cursor over the hero and slider images.
- **Drag-to-scroll sliders with momentum** — custom mouse and touch dragging (transform-based, not native scrolling) with release easing, edge clamping, and a synced scrub bar. Direction-locked on touch so vertical page scrolling still works.
- **Scroll-reveal animations** — fade-and-rise on headings, copy and media via `IntersectionObserver`.
- **Full-screen menu overlay** — staggered entrance, arrow-slide + label-shift + sibling-dim hover, a Request a Demo button, and social icons.
- **Form details** — CSS-only floating labels, hairline field borders, autofill styling, and a gradient-stroke submit button whose outline spins on hover.
- **Three-tier responsive spacing** — desktop / tablet / mobile rhythm driven by CSS custom properties (matched to the Figma design) rather than a single fluid `clamp()`.

## Tech stack

| Area | What's used |
| --- | --- |
| Markup | HTML5, semantic sections, ARIA labels |
| Styling | Vanilla CSS3 — custom properties, `clamp()`, `position: sticky`, `mask-composite`, `@property` (animated `conic-gradient` borders), `mix-blend-mode`, media queries |
| Scripting | Vanilla JavaScript (ES5-style IIFE for page behaviour + ES modules for WebGL) — `IntersectionObserver`, Pointer Events, Touch Events, `requestAnimationFrame` |
| Graphics | **WebGL / WebGL2**: [OGL](https://github.com/oframe/ogl) (loaded from a CDN as an ES module) for the aurora and the image warp; hand-written WebGL2 + GLSL for the cursor fluid simulation |
| Fonts | Proxima Nova via Adobe Fonts (Typekit) |
| Media | MP4 trailer, PNG/SVG assets |
| Hosting | GitHub Pages (static) |
| Design | Figma |

## Project structure

```
paramount-vx/
├── index.html              # the whole page
└── assets/
    ├── css/
    │   └── styles.css      # all styles, incl. responsive tiers and animations
    ├── js/
    │   ├── main.js         # menu, sliders (+ momentum), scroll reveal, trailer scale,
    │   │                   # pinned platform preview, side nav, form behaviour
    │   ├── aurora.js       # WebGL aurora hero background (OGL)
    │   ├── lens-warp.js    # WebGL hover warp on images (OGL)
    │   └── cursor-trail.js # WebGL2 cursor fluid simulation
    ├── images/             # hero, slider and feature artwork
    ├── icons/              # logo and UI icons (SVG)
    └── videos/
        └── trailer.mp4
```

## Running locally

There is nothing to install or build. The page uses ES modules, which browsers block when a file is opened straight from disk (`file://`), so serve it over HTTP.

The platform preview in the Socialize section loads a sibling project (`paramount-vx-platform`) using a relative path (`../paramount-vx-platform/`). To see it locally, keep the two project folders side by side and serve from their **parent** folder:

```bash
cd path/to/parent-folder
python3 -m http.server 4173
```

Then open <http://localhost:4173/paramount-vx/>.

> If you only serve the `paramount-vx` folder, everything works except the embedded platform preview.

## Browser support & accessibility

- Developed and tested mainly in Chrome, with the sliders also checked on iOS Safari/Chrome. WebGL effects degrade gracefully: without WebGL the aurora falls back to a CSS gradient, and the image warp, cursor fluid and similar effects simply don't run.
- Effects honour `prefers-reduced-motion` (aurora canvas, lens warp, cursor fluid, slider momentum and reveal animations are turned off or simplified).
- The cursor fluid and image warp are for desktop pointers only; the pinned platform preview is desktop-only (tablet/mobile keep a static image).
- The sliders are drag/touch driven; horizontal trackpad scrolling isn't wired up.

## Notes

- **Companion project:** the embedded preview is a separate repository, [`paramount-vx-platform`](https://github.com/Vsenses55/paramount-vx-platform), loaded in an "embed mode" (`?embed`) that makes its background transparent and hides its screen switcher.
- **Form:** the demo request form is front-end only — it validates and shows a confirmation, but doesn't send data anywhere.
- **Fonts:** Proxima Nova is a commercial typeface served through an Adobe Fonts kit; it isn't included in this repository.
- **Brand assets:** Paramount, VX and related names, logos and imagery belong to their respective owners. This is a portfolio project.

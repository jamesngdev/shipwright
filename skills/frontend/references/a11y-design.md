# Accessibility & web interface guidelines (review lens + build rules)

Output when reviewing: terse `file:line  rule  fix`. Ordered by how often they bite.

## Semantics & keyboard
- Interactive = `<button>` (action) or `<a href>` (navigation). `div/span onClick` needs role, tabIndex, key handlers: just use the element. Navigation must be a real link (middle-click, open in new tab).
- One `<h1>`; heading levels don't skip; landmarks `header nav main footer`; "skip to content" link.
- Tab order follows visual order; no positive `tabIndex`. All functionality reachable by keyboard; Esc closes overlays; Enter/Space activate buttons.
- Focus: visible ring always (`:focus-visible`, never `outline: none` without replacement). Modal: move focus in, trap, restore on close (use `<dialog>`/Radix/Headless UI, don't hand-roll). Route change: move focus to the new page heading.
- Icon-only buttons need `aria-label`; decorative icons `aria-hidden="true"`.

## Forms
- `<label htmlFor>` for every control (placeholder is not a label). Correct `type`, `name`, `autocomplete`, `inputmode`.
- Errors adjacent to the field, linked with `aria-describedby`, `aria-invalid`; summary uses `role="alert"`/`aria-live="polite"`. Focus the first invalid field on submit.
- Don't disable paste; don't validate on every keystroke before first blur; required marked in text, not only color.
- Buttons: loading state keeps width and label; disabled only for truly unavailable actions; destructive actions confirmed or undoable.

## Content & color
- Contrast: text >= 4.5:1 (3:1 large/UI components). Never convey meaning by color alone (add icon/text).
- `alt` describes purpose; decorative `alt=""`. Video/audio: captions, no autoplay with sound.
- Touch targets >= 44x44 px (24x24 minimum on desktop); spacing between adjacent targets.
- Text resizable to 200% without breaking layout; use `rem`; no fixed heights on text containers; `text-wrap: balance` for headings; truncate with `min-w-0` + `truncate` and provide full text in `title`/tooltip.
- Use `Intl.DateTimeFormat`/`NumberFormat` for locale-aware dates/numbers; `lang` on `<html>`.

## Motion
- Honor `prefers-reduced-motion: reduce` (remove parallax/large motion, keep opacity fades).
- Animate `transform`/`opacity` only (compositor); never `transition: all`; list properties; durations 150-300 ms; animations interruptible.
- Set `transform-origin` correctly; SVG: animate a wrapper element.

## Layout & responsive
- Mobile-first; test 375px, 768px, 1280px; no horizontal scroll (`overflow-x` bugs mean a fixed width somewhere). Use `min-h-dvh` not `100vh` on mobile. `env(safe-area-inset-*)` for notched devices.
- Layout with flex/grid; avoid `calc`-heavy absolute positioning and JS measurement for layout.
- Reserve space for async content (skeletons with fixed dimensions) to avoid CLS.
- Z-index scale defined once (tokens), not 9999 races.

## Images & perf (UI side)
- Explicit `width/height` or `aspect-ratio`; `loading="lazy"` below fold; `fetchpriority="high"`/`priority` for LCP only; modern formats (AVIF/WebP) and `srcset/sizes`.
- Virtualize long lists; `content-visibility: auto`; preconnect critical origins; subset fonts.

## UX states & content
- Every view: loading, empty (with next action), error (with retry), partial/offline. Skeletons mirror final layout.
- Buttons/labels are verbs ("Save changes", not "Submit"); errors say what happened and how to fix, in plain words.
- Don't block the UI on non-critical requests; show optimistic feedback within 100 ms. URL reflects state (filters, tabs, pagination) so back/refresh/share work.
- Theme: `color-scheme` meta and CSS so form controls match dark mode; `<meta name="theme-color">`.
- Prevent double-tap zoom issues with `touch-action: manipulation`; don't disable viewport zoom (`user-scalable=no` is a violation).

## Styling system
- Design tokens (CSS variables / Tailwind theme) for color, spacing, radius, type scale; no magic hex/px sprinkled in components.
- Reuse existing components/primitives before creating new; variants via `cva`/props, not copy-paste.
- Tailwind: no dynamic class names (`bg-${c}-500` is purged); extract repeated utility sets into components, not `@apply` sprawl.

## Automated checks
```bash
npx eslint . --ext .tsx   # with eslint-plugin-jsx-a11y: fails on div onClick, missing alt/labels
npx playwright test       # @axe-core/playwright: new AxeBuilder({ page }).analyze() -> expect(violations).toEqual([])
```
axe catches ~30-40% of issues; still do a keyboard-only pass and check focus order manually.

## Checklist
- [ ] semantic elements, keyboard-operable, visible focus
- [ ] labels + errors linked; contrast ok; alt text
- [ ] reduced-motion; no `transition: all`
- [ ] 375px no horizontal scroll; CLS-safe skeletons
- [ ] axe clean in Playwright

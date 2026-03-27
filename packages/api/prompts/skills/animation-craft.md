# Animation Craft

Source: emilkowalski/skill (Emil Kowalski's design engineering philosophy)

## The Animation Decision Framework

### Should this animate at all?

| Frequency | Decision |
|-----------|----------|
| Seen 100+/day (keyboard shortcuts, toggles) | No animation. Ever. |
| Seen tens of times/day (hover, list navigation) | Remove or drastically reduce |
| Occasional (modals, drawers, toasts) | Standard animation |
| Rare/first-time (onboarding, celebrations) | Can add delight |

If the purpose is just "it looks cool" and the user will see it often, don't animate.

### Duration Table

| Element | Duration |
|---------|----------|
| Button press feedback | 100-160ms |
| Tooltips, small popovers | 125-200ms |
| Dropdowns, selects | 150-250ms |
| Modals, drawers | 200-500ms |

**Rule: UI animations stay under 300ms.** Exit animations use ~75% of enter duration.

### Easing

**Never use ease-in for UI animations.** It starts slow, making the interface feel sluggish.

```css
/* Strong ease-out for UI interactions (recommended default) */
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);

/* Strong ease-in-out for on-screen movement */
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);

/* Quart out - smooth, refined */
--ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);

/* Expo out - snappy, confident */
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
```

**Avoid bounce and elastic curves.** They feel dated and tacky.

## CSS Techniques

### Never animate from scale(0)

Nothing in the real world disappears completely. Start from `scale(0.95)` with `opacity: 0`.

### Stagger animations

When multiple elements enter together, stagger with 30-80ms delay between items. Keep total stagger time capped.

```css
.item {
  opacity: 0;
  transform: translateY(8px);
  animation: fadeIn 300ms ease-out forwards;
  animation-delay: calc(var(--i, 0) * 50ms);
}
```

### Entry animations with @starting-style

```css
.element {
  opacity: 1;
  transform: translateY(0);
  transition: opacity 400ms ease, transform 400ms ease;

  @starting-style {
    opacity: 0;
    transform: translateY(100%);
  }
}
```

### Asymmetric timing

Slow where the user is deciding, fast where the system responds. Press = slow and deliberate. Release = snappy (200ms ease-out).

### Use blur to mask imperfect transitions

When a crossfade feels off, add subtle `filter: blur(2px)` during transition. Keep under 20px.

## Performance

- **Only animate transform and opacity** — everything else triggers layout recalculation
- Never animate `width`, `height`, `padding`, `margin`, `top`, `left`
- Never animate large `blur()` or `backdrop-filter` surfaces
- CSS animations run off main thread; prefer them for predetermined motion

## Review Checklist

| Issue | Fix |
|-------|-----|
| `transition: all` | Specify exact properties |
| `scale(0)` entry | Start from `scale(0.95)` + `opacity: 0` |
| `ease-in` on UI element | Switch to `ease-out` or custom curve |
| Duration > 300ms on UI | Reduce to 150-250ms |
| Elements all appear at once | Add stagger delay (30-80ms) |
| No `:active` state on button | Add `transform: scale(0.97)` |

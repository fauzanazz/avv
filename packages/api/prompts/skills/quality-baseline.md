# Quality Baseline

Source: ibelick/ui-skills (baseline-ui), pbakaus/impeccable

## Hard Constraints

### Animation
- NEVER add animation unless it serves a clear purpose
- Only animate compositor props (`transform`, `opacity`)
- NEVER animate layout properties (`width`, `height`, `top`, `left`, `margin`, `padding`)
- NEVER exceed 200ms for interaction feedback
- Respect `prefers-reduced-motion`
- NEVER animate large `blur()` or `backdrop-filter` surfaces

### Typography
- Use `text-wrap: balance` for headings, `text-wrap: pretty` for body
- Use `font-variant-numeric: tabular-nums` for data/numbers
- Use `truncate` or `line-clamp` for dense UI
- NEVER modify letter-spacing unless the design intent requires it

### Layout
- Use a fixed z-index scale (no arbitrary values)
- Use `100dvh` instead of `100vh` for full-height layouts
- NEVER nest cards inside cards — flatten the hierarchy

### Color & Design
- NEVER use gradients unless they serve a clear purpose
- NEVER use purple or multicolor gradients (AI slop signal)
- NEVER use glow effects as primary affordances
- NEVER use pure black (#000) or pure white (#fff) — always tint
- Limit accent color usage to one per view
- NEVER use gray text on colored backgrounds — use a shade of the background instead

### Accessibility
- No text below 12px
- No low-contrast text (< 4.5:1 ratio)
- Icon-only buttons must have `aria-label`
- Give empty states one clear next action
- Gate hover animations behind `@media (hover: hover) and (pointer: fine)`

### Surface & Depth
- Choose ONE depth strategy and commit (borders-only, subtle shadows, layered shadows, or surface color shifts)
- Don't mix depth approaches
- Borders should disappear when you're not looking for them — use low opacity `rgba`
- Sidebar: same background as canvas with subtle border, not different color

### Interactive States
- Every interactive element needs: default, hover, active, focus, disabled
- Buttons must have `:active` feedback (`transform: scale(0.97)`)
- Add `transition: all 150ms ease-out` on hover states (but specify exact properties)

# Color System & Typography

Source: pbakaus/impeccable reference files

## Color Spaces: Use OKLCH

Stop using HSL. OKLCH is perceptually uniform — equal steps in lightness look equal.

```css
/* OKLCH: lightness (0-100%), chroma (0-0.4+), hue (0-360) */
--color-primary: oklch(60% 0.15 250);
--color-primary-light: oklch(85% 0.08 250);
--color-primary-dark: oklch(35% 0.12 250);
```

As you move toward white or black, reduce chroma. High chroma at extreme lightness looks garish.

## Tinted Neutrals

Pure gray is dead. Add a subtle hint of brand hue:

```css
/* Warm-tinted grays */
--gray-100: oklch(95% 0.01 60);
--gray-900: oklch(15% 0.01 60);

/* Cool-tinted grays */
--gray-100: oklch(95% 0.01 250);
--gray-900: oklch(15% 0.01 250);
```

Chroma of 0.01 is barely perceptible but creates subconscious cohesion.

## Palette Structure

| Role | Purpose |
|------|---------|
| **Primary** | Brand, CTAs, key actions — 1 color, 3-5 shades |
| **Neutral** | Text, backgrounds, borders — 9-11 shade scale |
| **Semantic** | Success, error, warning, info — 4 colors, 2-3 shades each |
| **Surface** | Cards, modals, overlays — 2-3 elevation levels |

Skip secondary/tertiary unless needed. One accent color with intention beats five without thought.

## The 60-30-10 Rule

About visual weight, not pixel count:
- **60%**: Neutral backgrounds, white space, base surfaces
- **30%**: Secondary — text, borders, inactive states
- **10%**: Accent — CTAs, highlights, focus states

Accent colors work because they're rare. Overuse kills their power.

## Dark Mode Is Not Inverted Light Mode

| Light Mode | Dark Mode |
|------------|-----------|
| Shadows for depth | Lighter surfaces for depth (no shadows) |
| Dark text on light | Light text on dark (reduce font weight) |
| Vibrant accents | Desaturate accents slightly |
| White backgrounds | Never pure black — use dark gray (oklch 12-18%) |

## Typography System

### Build Distinct Levels

- **Display/Hero**: Distinctive, tight tracking, bold weight. This IS the personality.
- **Headings**: Clear weight progression. Don't rely on size alone — combine size, weight, letter-spacing.
- **Body**: Comfortable weight (350-400 in dark mode, 400 in light). Line-height 1.5-1.7.
- **Labels/Captions**: Medium weight at smaller sizes. Never below 12px.
- **Data**: `font-variant-numeric: tabular-nums` for aligned numbers.

### Fluid Type Scale

```css
--text-sm: clamp(0.8rem, 0.17vw + 0.76rem, 0.89rem);
--text-base: clamp(1rem, 0.34vw + 0.91rem, 1.19rem);
--text-lg: clamp(1.25rem, 0.61vw + 1.1rem, 1.58rem);
--text-xl: clamp(1.56rem, 1.03vw + 1.31rem, 2.11rem);
--text-2xl: clamp(1.95rem, 1.66vw + 1.55rem, 2.81rem);
```

### Text Wrapping

```css
h1, h2, h3 { text-wrap: balance; }
p, li { text-wrap: pretty; }
```

### OpenType Features

Use `font-feature-settings` or individual properties:
- `font-variant-numeric: tabular-nums` for data tables
- `font-variant-numeric: oldstyle-nums` for body text (if the font supports it)
- `font-variant-ligatures: common-ligatures` for body text

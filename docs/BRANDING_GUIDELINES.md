# Verigence Brand Guidelines

**Status:** Web implementation baseline  
**Scope:** `verigence/verigence-web`  
**Brand source:** User-approved Verigence PNG artwork supplied on 2026-08-15.

## 1. Brand idea

Verigence brings together **Audit • Governance • Intelligence**.

The mark combines three visual ideas:

- **Shield:** trust, assurance, governance and controlled execution.
- **Intelligence waveform:** analytics, AI and evidence-driven insight.
- **Rising check / arrow:** validated outcomes, improvement and forward progress.

Use the mark and wordmark as a single system. Do not redraw individual elements in product UI.

## 2. Primary logo system

Preferred order:

1. `public/brand/svg/verigence-logo.svg` — default horizontal logo.
2. `public/brand/svg/verigence-logo-tagline.svg` — use when the descriptor is helpful.
3. `public/brand/svg/verigence-mark.svg` — compact navigation, avatar and product-mark usage.
4. `public/brand/svg/verigence-logo-mono.svg` / `verigence-mark-mono.svg` — monochrome fallback.
5. `public/brand/icons/favicon.svg` — browser/favicon use.

The original user-approved PNG artwork is retained as the visual reference for fidelity. The SVG files are clean web implementation reconstructions of that approved system.

## 3. Color palette

| Token | Hex | Use |
|---|---:|---|
| Verigence Deep Blue | `#003A82` | Primary wordmark, headings, trusted/controlled states |
| Verigence Electric Blue | `#0057B8` | Gradient, links, active states |
| Verigence Teal | `#00AFA8` | Intelligence and analytics accent |
| Verigence Mint | `#00D3A7` | Improvement accent, gradient endpoint |
| Verigence Slate | `#31506E` | Secondary text and descriptor |
| Verigence Mist | `#F4F8FB` | Light surfaces/backgrounds |
| White | `#FFFFFF` | Primary light surface |

### Primary brand gradient

```css
linear-gradient(135deg, #003A82 0%, #0057B8 42%, #00AFA8 72%, #00D3A7 100%)
```

Use the gradient inside the mark and selected brand accents. Do not use it as a large decorative background behind dense application content.

## 4. Typography

Primary UI and brand-support typeface: **Inter**.

Fallback stack:

```css
font-family: Inter, Arial, Helvetica, sans-serif;
```

Recommended UI weights:

- 800 — logo-support / major display only
- 700 — page titles
- 600 — section headings, navigation, buttons
- 500 — labels
- 400 — body text

Product UI should prioritize readability over decorative typography.

## 5. Clear space and sizing

Use a minimum clear space around the logo equal to roughly **25% of the mark width**.

Recommended digital minimums:

- Horizontal logo: **160 px** wide
- Mark: **24 px** square-equivalent
- Favicon: **16 px**
- App icon: use the provided 192 / 512 PNG assets

Do not stretch the logo. Preserve aspect ratio.

## 6. Background usage

### Light surfaces
Use the default full-color logo on white or Mist.

### Dark surfaces
Prefer the supplied dark hero artwork or place the default mark on a sufficiently dark navy surface with adequate contrast.

### Monochrome
Use the monochrome SVG only where printing, accessibility, technical constraints or low-color environments require it.

## 7. Logo misuse

Do **not**:

- change the logo proportions;
- rotate, skew or stretch it;
- change individual mark colors outside the approved color/mono variants;
- add drop shadows, outlines, glows or 3D effects to the standard UI logo;
- separate the waveform, shield or arrow and present them as a different logo;
- place the logo on visually noisy imagery without a contrast treatment;
- recreate the wordmark with an unrelated font.

## 8. Web asset inventory

### SVG
- `public/brand/svg/verigence-logo.svg`
- `public/brand/svg/verigence-logo-tagline.svg`
- `public/brand/svg/verigence-logo-mono.svg`
- `public/brand/svg/verigence-mark.svg`
- `public/brand/svg/verigence-mark-mono.svg`
- `public/brand/icons/favicon.svg`

### PNG
- `public/brand/png/verigence-wordmark-navy.png`
- `public/brand/png/verigence-mark-gradient.png`
- `public/brand/png/verigence-wordmark-gradient.png`
- `public/brand/png/verigence-hero-lockup.png`

### App/browser icons
- `public/brand/icons/app-icon-512.png`
- `public/brand/icons/app-icon-192.png`
- `public/brand/icons/apple-touch-icon-180.png`
- `public/brand/icons/icon-64.png`
- `public/brand/icons/favicon-32.png`
- `public/brand/icons/favicon-16.png`
- `public/brand/icons/favicon.svg`

## 9. UI implementation rules

The Web application should consume the shared tokens from `public/brand/brand-tokens.css` rather than scattering raw brand hex values throughout components.

Use Deep Blue for primary shell/navigation hierarchy, Teal/Mint for intelligence and improvement accents, and keep operational content surfaces predominantly neutral/light.

Security, warning, error and success semantic colors are **not** defined by the logo palette; they should remain distinct accessible semantic tokens in the application design system.

## 10. Change control

Treat these assets as the Web brand baseline. Any material change to the Verigence mark, wordmark, palette or naming should update this document and the source assets together.

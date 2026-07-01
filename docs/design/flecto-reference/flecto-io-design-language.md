# Design Language: Flecto - Unlock your Rental Business and Access New Customers |

> Extracted from `https://flecto.io/?ref=godly` on June 20, 2026
> 3296 elements analyzed

This document describes the complete design language of the website. It is structured for AI/LLM consumption — use it to faithfully recreate the visual design in any framework.

## Color Palette

### Primary Colors

| Role | Hex | RGB | HSL | Usage Count |
|------|-----|-----|-----|-------------|
| Primary | `#004737` | rgb(0, 71, 55) | hsl(166, 100%, 14%) | 3863 |
| Secondary | `#fffbec` | rgb(255, 251, 236) | hsl(47, 100%, 96%) | 263 |
| Accent | `#d4ffe8` | rgb(212, 255, 232) | hsl(148, 100%, 92%) | 57 |

### Neutral Colors

| Hex | HSL | Usage Count |
|-----|-----|-------------|
| `#222222` | hsl(0, 0%, 13%) | 1869 |
| `#ffffff` | hsl(0, 0%, 100%) | 77 |
| `#000000` | hsl(0, 0%, 0%) | 21 |
| `#939393` | hsl(0, 0%, 58%) | 18 |
| `#292d32` | hsl(213, 10%, 18%) | 6 |
| `#b8b5a8` | hsl(49, 10%, 69%) | 3 |
| `#dfdccd` | hsl(50, 22%, 84%) | 3 |
| `#afc5c0` | hsl(166, 16%, 73%) | 3 |

### Background Colors

Used on large-area elements: `#ffffff`, `#004737`, `#56f09f`, `#032019`, `#fffbec`, `#d4ffe8`, `#faf2d5`, `#000000`

### Text Colors

Text color palette: `#222222`, `#004737`, `#fffbec`, `#d4ffe8`, `#0000ee`, `#4166d4`, `#f52929`, `#032019`, `#ffc900`, `#56f09f`

### Gradients

```css
background-image: linear-gradient(0deg, rgba(4, 43, 34, 0.5), rgba(4, 43, 34, 0.5));
```

### Full Color Inventory

| Hex | Contexts | Count |
|-----|----------|-------|
| `#004737` | text, border, background | 3863 |
| `#222222` | text, border | 1869 |
| `#fffbec` | text, border, background | 263 |
| `#0000ee` | text, border | 250 |
| `#56f09f` | background, text, border | 189 |
| `#032019` | text, border, background | 112 |
| `#ffffff` | background, text, border | 77 |
| `#d4ffe8` | text, border, background | 57 |
| `#000000` | text, border, background | 21 |
| `#939393` | text, border | 18 |
| `#f52929` | text, border | 8 |
| `#2aaf71` | text, border | 8 |
| `#effcf5` | background | 7 |
| `#faf2d5` | border, background | 7 |
| `#ffc900` | text, border, background | 7 |
| `#292d32` | text, border | 6 |
| `#4166d4` | text, border | 4 |
| `#8f37ff` | text, border | 4 |
| `#ffe2e2` | background | 3 |
| `#b8b5a8` | background | 3 |
| `#dfdccd` | background | 3 |
| `#afc5c0` | border, text | 3 |
| `#01382c` | background | 2 |
| `#ffb500` | background | 2 |
| `#309265` | background | 1 |
| `#ff004d` | background | 1 |
| `#4be393` | background | 1 |
| `#00e6a0` | background | 1 |

## Typography

### Font Families

- **aeonik** — used for all (1233 elements)
- **roobert-regular** — used for body (1038 elements)
- **Aeonik** — used for body (882 elements)
- **Times** — used for body (112 elements)
- **Arial** — used for body (31 elements)

### Type Scale

| Size (px) | Size (rem) | Weight | Line Height | Letter Spacing | Used On |
|-----------|------------|--------|-------------|----------------|---------|
| 66px | 4.125rem | 400 | 79.2px | normal | span |
| 60px | 3.75rem | 400 | 66px | -1.8px | h2, br, a, span |
| 56px | 3.5rem | 400 | 56px | -1.68px | span |
| 50px | 3.125rem | 400 | 50px | -1.5px | h2, div, p, strong |
| 46px | 2.875rem | 400 | 46px | -1.38px | h2 |
| 34.3222px | 2.1451rem | 400 | 44.6188px | normal | span |
| 30.2222px | 1.8889rem | 400 | 39.2889px | normal | span |
| 30px | 1.875rem | 400 | 36px | -0.6px | h3 |
| 26px | 1.625rem | 400 | 26px | -0.78px | a, button, span, p |
| 23.3412px | 1.4588rem | 400 | 28.0094px | 0.466824px | p |
| 22.2222px | 1.3889rem | 400 | 22.2222px | normal | li |
| 22px | 1.375rem | 400 | 26.4px | normal | p, label, button, span |
| 20px | 1.25rem | 400 | 26px | normal | span |
| 18px | 1.125rem | 400 | 21.6px | -0.36px | div, p, strong, span |
| 17px | 1.0625rem | 400 | 18.7px | -0.17px | span, svg, path, li |

### Heading Scale

```css
h2 { font-size: 60px; font-weight: 400; line-height: 66px; }
h2 { font-size: 50px; font-weight: 400; line-height: 50px; }
h2 { font-size: 46px; font-weight: 400; line-height: 46px; }
h3 { font-size: 30px; font-weight: 400; line-height: 36px; }
h3 { font-size: 14px; font-weight: 400; line-height: 15.4px; }
h2 { font-size: 12px; font-weight: 400; line-height: 12px; }
```

### Body Text

```css
body { font-size: 16px; font-weight: 400; line-height: normal; }
```

### Font Weights in Use

`400` (3286x), `500` (10x)

## Spacing

**Base unit:** 2px

| Token | Value | Rem |
|-------|-------|-----|
| spacing-0 | 0px | 0rem |
| spacing-20 | 20px | 1.25rem |
| spacing-22 | 22px | 1.375rem |
| spacing-34 | 34px | 2.125rem |
| spacing-40 | 40px | 2.5rem |
| spacing-42 | 42px | 2.625rem |
| spacing-47 | 47px | 2.9375rem |
| spacing-50 | 50px | 3.125rem |
| spacing-52 | 52px | 3.25rem |
| spacing-55 | 55px | 3.4375rem |
| spacing-60 | 60px | 3.75rem |
| spacing-65 | 65px | 4.0625rem |
| spacing-68 | 68px | 4.25rem |
| spacing-72 | 72px | 4.5rem |
| spacing-75 | 75px | 4.6875rem |
| spacing-80 | 80px | 5rem |
| spacing-87 | 87px | 5.4375rem |
| spacing-98 | 98px | 6.125rem |
| spacing-100 | 100px | 6.25rem |
| spacing-110 | 110px | 6.875rem |

## Border Radii

| Label | Value | Count |
|-------|-------|-------|
| xs | 2px | 1 |
| sm | 5px | 10 |
| md | 8px | 10 |
| lg | 11px | 5 |
| lg | 14px | 2 |
| xl | 18px | 7 |
| xl | 23px | 2 |
| full | 27px | 2 |
| full | 30px | 1 |
| full | 37px | 11 |
| full | 40px | 23 |
| full | 43px | 2 |
| full | 46px | 8 |
| full | 60px | 29 |
| full | 89px | 1 |
| full | 100px | 17 |
| full | 1280px | 1 |

## Box Shadows

**sm** — blur: 2px
```css
box-shadow: rgba(0, 0, 0, 0.04) 0px 3px 2px 0px;
```

**sm** — blur: 3.96px
```css
box-shadow: rgba(0, 0, 0, 0.12) 0px 3px 3.96px 0px;
```

**md** — blur: 8px
```css
box-shadow: rgba(0, 71, 55, 0.03) 1px 5px 8px 5px;
```

**md** — blur: 12.4444px
```css
box-shadow: rgba(0, 0, 0, 0.1) 0px 2.66667px 12.4444px 0px;
```

**lg** — blur: 12.3232px
```css
box-shadow: rgba(5, 73, 46, 0.055) 0px 10.8098px 12.3232px 0px;
```

**xl** — blur: 18px
```css
box-shadow: rgba(0, 0, 0, 0.05) 0px 18px 18px 0px;
```

**xl** — blur: 18px
```css
box-shadow: rgba(0, 0, 0, 0.1) 0px 18px 18px 0px;
```

**xl** — blur: 24.8889px
```css
box-shadow: rgba(0, 0, 0, 0.09) 0px 14.2222px 24.8889px 0px;
```

**xl** — blur: 21.3333px
```css
box-shadow: rgba(15, 194, 101, 0.09) 0px 17.7778px 21.3333px 0px;
```

**xl** — blur: 97.7778px
```css
box-shadow: rgba(1, 44, 34, 0.1) 0px 122.667px 97.7778px 0px;
```

## CSS Custom Properties

### Spacing

```css
--gap: 15px;
```

### Radii

```css
--radius: 20px;
```

### Other

```css
--device-full-height: 100vh;
--header-desktop-responsive-width: 1700;
--header-mobile-responsive-width: 390;
--top-left-width: 28%;
--top-center-width: 44%;
--top-right-width: 28%;
--bottom-left-width: 12%;
--bottom-center-width: 66%;
--bottom-right-width: 24%;
--fix-offset: 10px;
--white-height: 140px;
--center-height: calc(100% - var(--white-height));
--ftc-desktop-animation-base-width: 1700;
--ftc-mobile-animation-base-width: 390;
--legal-header-height: 50vh;
--404-header-height: 100vh;
```

### Dependencies

```css
--center-height: --white-height;
```

### Semantic

```css
success: [object Object];
warning: [object Object];
error: [object Object];
info: [object Object];
```

## Breakpoints

| Name | Value | Type |
|------|-------|------|
| 389px | 389px | max-width |
| 390px | 390px | min-width |
| 410px | 410px | max-width |
| 550px | 550px | min-width |
| sm | 603px | max-width |
| md | 743px | max-width |
| md | 767px | min-width |
| lg | 1023px | max-width |
| 1100px | 1100px | max-width |
| 1110px | 1110px | max-width |
| 1200px | 1200px | min-width |
| xl | 1290px | max-width |
| xl | 1340px | max-width |
| 1360px | 1360px | max-width |
| 1374px | 1374px | max-width |
| 1375px | 1375px | max-width |
| 1398px | 1398px | max-width |
| 1400px | 1400px | max-width |
| 1440px | 1440px | max-width |
| 1460px | 1460px | max-width |
| 2xl | 1530px | max-width |
| 2xl | 1558px | max-width |
| 1780px | 1780px | max-width |
| 1870px | 1870px | min-width |
| 2000px | 2000px | min-width |
| 2078px | 2078px | max-width |
| 2200px | 2200px | min-width |
| 2300px | 2300px | min-width |
| 2400px | 2400px | min-width |
| 2500px | 2500px | min-width |
| 2600px | 2600px | min-width |

## Transitions & Animations

**Easing functions:** `[object Object]`

**Durations:** `0.5s`, `0.2s`, `0.3s`

### Common Transitions

```css
transition: all;
transition: background-color 0.5s cubic-bezier(0.19, 1, 0.22, 1);
transition: transform 0.5s cubic-bezier(0.19, 1, 0.22, 1);
transition: transform 0.5s cubic-bezier(0.19, 1, 0.22, 1), opacity 0.5s cubic-bezier(0.19, 1, 0.22, 1);
transition: width;
transition: opacity 0.5s cubic-bezier(0.19, 1, 0.22, 1);
transition: opacity 0.2s;
transition: color 0.5s cubic-bezier(0.19, 1, 0.22, 1);
transition: color 0.5s cubic-bezier(0.19, 1, 0.22, 1), border 0.5s cubic-bezier(0.19, 1, 0.22, 1);
transition: transform 0.3s, opacity 0.3s;
```

### Keyframe Animations

**blink-4ceba078**
```css
@keyframes blink-4ceba078 {
  0% { opacity: 1; }
  50% { opacity: 0; }
  100% { opacity: 1; }
}
```

## Component Patterns

Detected UI component patterns and their most common styles:

### Buttons (31 instances)

```css
.button {
  background-color: rgb(212, 255, 232);
  color: rgb(34, 34, 34);
  font-size: 16px;
  font-weight: 400;
  padding-top: 0px;
  padding-right: 0px;
  border-radius: 0px;
}
```

### Cards (22 instances)

```css
.card {
  background-color: rgb(255, 255, 255);
  border-radius: 0px;
  box-shadow: rgba(0, 0, 0, 0.04) 0px 3px 2px 0px;
  padding-top: 0px;
  padding-right: 0px;
}
```

### Inputs (14 instances)

```css
.input {
  color: rgb(34, 34, 34);
  border-color: rgb(34, 34, 34);
  border-radius: 0px;
  font-size: 12px;
  padding-top: 0px;
  padding-right: 0px;
}
```

### Links (52 instances)

```css
.link {
  color: rgb(0, 0, 238);
  font-size: 16px;
  font-weight: 400;
}
```

### Navigation (65 instances)

```css
.navigatio {
  background-color: rgb(255, 251, 236);
  color: rgb(0, 71, 55);
  padding-top: 0px;
  padding-bottom: 0px;
  padding-left: 0px;
  padding-right: 0px;
  position: relative;
}
```

### Footer (9 instances)

```css
.foote {
  background-color: rgba(245, 245, 245, 0.15);
  color: rgb(0, 71, 55);
  padding-top: 0px;
  padding-bottom: 0px;
  font-size: 10.6667px;
}
```

### Dropdowns (16 instances)

```css
.dropdown {
  background-color: rgb(255, 255, 255);
  border-radius: 0px;
  border-color: rgb(0, 71, 55);
  padding-top: 0px;
}
```

### Badges (67 instances)

```css
.badge {
  background-color: rgb(239, 252, 245);
  color: rgb(0, 71, 55);
  font-size: 11px;
  font-weight: 400;
  padding-top: 0px;
  padding-right: 0px;
  border-radius: 0px;
}
```

### Tabs (12 instances)

```css
.tab {
  background-color: rgb(0, 71, 55);
  color: rgb(0, 71, 55);
  font-size: 16px;
  font-weight: 400;
  padding-top: 0px;
  padding-right: 0px;
  border-color: rgb(0, 71, 55);
  border-radius: 0px;
}
```

### Switches (129 instances)

```css
.switche {
  background-color: rgb(255, 255, 255);
  border-radius: 0px;
  border-color: rgb(0, 71, 55);
}
```

## Component Clusters

Reusable component instances grouped by DOM structure and style similarity:

### Button — 6 instances, 4 variants

**Variant 1** (1 instance)

```css
  background: rgba(0, 0, 0, 0);
  color: rgb(212, 255, 232);
  padding: 0px 0px 0px 0px;
  border-radius: 0px;
  border: 0px none rgb(212, 255, 232);
  font-size: 26px;
  font-weight: 400;
```

**Variant 2** (3 instances)

```css
  background: rgba(0, 0, 0, 0);
  color: rgb(0, 71, 55);
  padding: 24px 0px 24px 0px;
  border-radius: 0px;
  border: 0px none rgb(0, 71, 55);
  font-size: 16px;
  font-weight: 400;
```

**Variant 3** (1 instance)

```css
  background: rgb(238, 238, 238);
  color: rgb(41, 45, 50);
  padding: 0px 0px 0px 0px;
  border-radius: 6px;
  border: 0px none rgb(41, 45, 50);
  font-size: 12px;
  font-weight: 400;
```

**Variant 4** (1 instance)

```css
  background: rgb(0, 230, 160);
  color: rgb(41, 45, 50);
  padding: 0px 0px 0px 0px;
  border-radius: 6px;
  border: 0px none rgb(41, 45, 50);
  font-size: 12px;
  font-weight: 400;
```

### Button — 2 instances, 1 variant

**Variant 1** (2 instances)

```css
  background: rgba(0, 0, 0, 0);
  color: rgb(0, 71, 55);
  padding: 0px 0px 0px 0px;
  border-radius: 0px;
  border: 0px none rgb(0, 71, 55);
  font-size: 14px;
  font-weight: 400;
```

### Button — 4 instances, 1 variant

**Variant 1** (4 instances)

```css
  background: rgba(0, 0, 0, 0);
  color: rgb(0, 0, 238);
  padding: 0px 28px 0px 28px;
  border-radius: 0px;
  border: 0px none rgb(0, 0, 238);
  font-size: 16px;
  font-weight: 400;
```

### Button — 2 instances, 1 variant

**Variant 1** (2 instances)

```css
  background: rgb(212, 255, 232);
  color: rgb(34, 34, 34);
  padding: 0px 0px 0px 0px;
  border-radius: 100%;
  border: 0px none rgb(34, 34, 34);
  font-size: 16px;
  font-weight: 400;
```

### Card — 1 instance, 1 variant

**Variant 1** (1 instance)

```css
  background: rgb(86, 240, 159);
  color: rgb(0, 71, 55);
  padding: 0px 0px 0px 0px;
  border-radius: 17.7778px;
  border: 0px none rgb(0, 71, 55);
  font-size: 16px;
  font-weight: 400;
```

### Card — 1 instance, 1 variant

**Variant 1** (1 instance)

```css
  background: rgba(0, 0, 0, 0);
  color: rgb(0, 71, 55);
  padding: 26.6667px 26.6667px 26.6667px 26.6667px;
  border-radius: 0px;
  border: 0px none rgb(0, 71, 55);
  font-size: 16px;
  font-weight: 400;
```

### Button — 4 instances, 1 variant

**Variant 1** (4 instances)

```css
  background: rgba(0, 0, 0, 0);
  color: rgb(0, 71, 55);
  padding: 0px 0px 0px 0px;
  border-radius: 0px;
  border: 0px none rgb(0, 71, 55);
  font-size: 16px;
  font-weight: 400;
```

### Card — 1 instance, 1 variant

**Variant 1** (1 instance)

```css
  background: rgba(0, 0, 0, 0);
  color: rgb(0, 71, 55);
  padding: 0px 0px 0px 0px;
  border-radius: 0px;
  border: 0px none rgb(0, 71, 55);
  font-size: 16px;
  font-weight: 400;
```

### Button — 3 instances, 1 variant

**Variant 1** (3 instances)

```css
  background: rgb(0, 71, 55);
  color: rgb(255, 251, 236);
  padding: 8.88889px 0px 8.88889px 0px;
  border-radius: 6.8px;
  border: 0px none rgb(255, 251, 236);
  font-size: 10.6667px;
  font-weight: 400;
```

### Button — 5 instances, 2 variants

**Variant 1** (4 instances)

```css
  background: rgba(245, 245, 245, 0.15);
  color: rgb(0, 71, 55);
  padding: 0px 0px 0px 0px;
  border-radius: 26.6667px;
  border: 0px none rgb(0, 71, 55);
  font-size: 10.6667px;
  font-weight: 400;
```

**Variant 2** (1 instance)

```css
  background: rgba(0, 0, 0, 0);
  color: rgb(0, 71, 55);
  padding: 0px 0px 0px 0px;
  border-radius: 0px;
  border: 0px none rgb(0, 71, 55);
  font-size: 12.1137px;
  font-weight: 400;
```

### Button — 2 instances, 1 variant

**Variant 1** (2 instances)

```css
  background: rgb(0, 71, 55);
  color: rgb(255, 251, 236);
  padding: 8.88889px 0px 8.88889px 0px;
  border-radius: 6.8px;
  border: 0px none rgb(255, 251, 236);
  font-size: 10.6667px;
  font-weight: 400;
```

### Button — 4 instances, 1 variant

**Variant 1** (4 instances)

```css
  background: rgba(0, 0, 0, 0);
  color: rgb(34, 34, 34);
  padding: 12px 14px 12px 12px;
  border-radius: 0px;
  border: 0px none rgb(34, 34, 34);
  font-size: 16px;
  font-weight: 400;
```

### Button — 1 instance, 1 variant

**Variant 1** (1 instance)

```css
  background: rgba(0, 0, 0, 0);
  color: rgb(34, 34, 34);
  padding: 0px 0px 0px 0px;
  border-radius: 100%;
  border: 0px none rgb(34, 34, 34);
  font-size: 16px;
  font-weight: 400;
```

### Button — 1 instance, 1 variant

**Variant 1** (1 instance)

```css
  background: rgba(0, 0, 0, 0);
  color: rgb(0, 71, 55);
  padding: 0px 0px 0px 0px;
  border-radius: 0px;
  border: 0px none rgb(0, 71, 55);
  font-size: 12.1137px;
  font-weight: 400;
```

### Button — 1 instance, 1 variant

**Variant 1** (1 instance)

```css
  background: rgb(86, 240, 159);
  color: rgb(255, 251, 236);
  padding: 10.0948px 0px 10.0948px 0px;
  border-radius: 7.72249px;
  border: 0px none rgb(255, 251, 236);
  font-size: 12.1137px;
  font-weight: 400;
```

### Card — 2 instances, 1 variant

**Variant 1** (2 instances)

```css
  background: rgb(255, 255, 255);
  color: rgb(0, 71, 55);
  padding: 0px 0px 0px 0px;
  border-radius: 10px;
  border: 0px none rgb(0, 71, 55);
  font-size: 16px;
  font-weight: 400;
```

### Card — 4 instances, 1 variant

**Variant 1** (4 instances)

```css
  background: rgb(255, 255, 255);
  color: rgb(0, 71, 55);
  padding: 20px 0px 20px 0px;
  border-radius: 10px;
  border: 0px none rgb(0, 71, 55);
  font-size: 16px;
  font-weight: 400;
```

### Card — 4 instances, 2 variants

**Variant 1** (1 instance)

```css
  background: rgb(255, 255, 255);
  color: rgb(0, 71, 55);
  padding: 0px 0px 0px 0px;
  border-radius: 10px;
  border: 0px none rgb(0, 71, 55);
  font-size: 16px;
  font-weight: 400;
```

**Variant 2** (3 instances)

```css
  background: rgba(0, 0, 0, 0);
  color: rgb(0, 71, 55);
  padding: 0px 0px 0px 0px;
  border-radius: 0px;
  border: 0px none rgb(0, 71, 55);
  font-size: 16px;
  font-weight: 400;
```

### Card — 2 instances, 1 variant

**Variant 1** (2 instances)

```css
  background: rgb(255, 255, 255);
  color: rgb(0, 71, 55);
  padding: 0px 24px 0px 24px;
  border-radius: 10px;
  border: 0px none rgb(0, 71, 55);
  font-size: 16px;
  font-weight: 400;
```

### Button — 1 instance, 1 variant

**Variant 1** (1 instance)

```css
  background: rgba(0, 0, 0, 0);
  color: rgba(0, 71, 55, 0.2);
  padding: 10px 0px 10px 0px;
  border-radius: 0px;
  border: 0px 0px 2px none none solid rgba(0, 71, 55, 0.2) rgba(0, 71, 55, 0.2) rgba(0, 71, 55, 0.1);
  font-size: 22px;
  font-weight: 400;
```

## Layout System

**55 grid containers** and **334 flex containers** detected.

### Container Widths

| Max Width | Padding |
|-----------|---------|
| 1700px | 38px |
| 87.5% | 12px |
| 2200px | 0px |
| 100% | 0px |
| 62.5% | 12px |
| 31.25% | 12px |
| 25% | 12px |
| 2000px | 14px |
| 50% | 12px |
| 56.25% | 12px |
| 75% | 12px |
| 37.5% | 12px |

### Grid Column Patterns

| Columns | Usage Count |
|---------|-------------|
| 3-column | 22x |
| 2-column | 15x |
| 1-column | 12x |
| 4-column | 6x |

### Grid Templates

```css
grid-template-columns: 1180px;
grid-template-columns: 1088px;
grid-template-columns: 228.125px 380.203px 228.141px;
gap: 9.375%;
grid-template-columns: 237.219px;
grid-template-columns: 208.516px 162.531px;
```

### Flex Patterns

| Direction/Wrap | Count |
|----------------|-------|
| row/wrap | 30x |
| column/nowrap | 69x |
| row/nowrap | 235x |

**Gap values:** `10.0948px`, `10.6667px`, `10px`, `12.1137px`, `5.33333px`, `6.05685px`, `9.375%`

## Accessibility (WCAG 2.1)

**Overall Score: 50%** — 7 passing, 7 failing color pairs

### Failing Color Pairs

| Foreground | Background | Ratio | Level | Used On |
|------------|------------|-------|-------|---------|
| `#2aaf71` | `#effcf5` | 2.67:1 | FAIL | span (4x) |
| `#f52929` | `#ffe2e2` | 3.29:1 | FAIL | span (2x) |
| `#939393` | `#f9f9f9` | 2.92:1 | FAIL | span (1x) |

### Passing Color Pairs

| Foreground | Background | Ratio | Level |
|------------|------------|-------|-------|
| `#032019` | `#ffffff` | 17.15:1 | AAA |
| `#d4ffe8` | `#004737` | 9.85:1 | AAA |
| `#004737` | `#ffb500` | 6.06:1 | AA |
| `#4166d4` | `#eef0fb` | 4.54:1 | AA |
| `#292d32` | `#eeeeee` | 11.94:1 | AAA |
| `#292d32` | `#00e6a0` | 8.46:1 | AAA |

## Design System Score

**Overall: 67/100 (Grade: D)**

| Category | Score |
|----------|-------|
| Color Discipline | 80/100 |
| Typography Consistency | 40/100 |
| Spacing System | 85/100 |
| Shadow Consistency | 90/100 |
| Border Radius Consistency | 45/100 |
| Accessibility | 50/100 |
| CSS Tokenization | 100/100 |

**Strengths:** Well-defined spacing scale, Clean elevation system, Good CSS variable tokenization

**Issues:**
- 5 font families — consider limiting to 2 (heading + body)
- 39 distinct font sizes — consider a tighter type scale
- 17 unique border radii — standardize to 3-4 values
- 7 WCAG contrast failures
- 11 !important rules — prefer specificity over overrides
- 5284 duplicate CSS declarations

## Gradients

**1 unique gradients** detected.

| Type | Direction | Stops | Classification |
|------|-----------|-------|----------------|
| linear | 0deg | 2 | brand |

```css
background: linear-gradient(0deg, rgba(4, 43, 34, 0.5), rgba(4, 43, 34, 0.5));
```

## Z-Index Map

**14 unique z-index values** across 4 layers.

| Layer | Range | Elements |
|-------|-------|----------|
| modal | 1000,9999 | div.g.r.i.d, div.p.a.g.e.-.t.r.a.n.s.i.t.i.o.n, div.d.e.v.e.l.o.p.m.e.n.t.-.s.p.l.a.s.h |
| dropdown | 100,111 | div.s.c.r.o.l.l.-.b.t.n.-.w.r.a.p.p.e.r, div.c.h.a.p.t.e.r.-.c.o.n.t.r.o.l.l.e.r, footer.f.o.o.t.e.r |
| sticky | 10,99 | div.m.e.n.u, div.m.a.i.n.-.h.e.a.d.e.r.-.f.i.x.e.d, div.c.u.s.t.o.m.e.r.-.c.o.n.t.a.i.n.e.r |
| base | -1,9 | svg.t.r.a.i.l, svg.t.r.a.i.l, div.g.o.1.6.3.2.9.4.9.0.4.9 |

## SVG Icons

**77 unique SVG icons** detected. Dominant style: **filled**.

| Size Class | Count |
|------------|-------|
| xs | 28 |
| sm | 4 |
| md | 7 |
| lg | 6 |
| xl | 32 |

**Icon colors:** `#FFFBEC`, `rgb(0,96,81)`, `rgb(0, 0, 0)`, `#004737`, `white`, `#D5FFE8`, `#7B61FF`, `#FFAD61`, `rgb(255, 251, 236)`, `rgb(0, 71, 55)`

## Font Files

| Family | Source | Weights | Styles |
|--------|--------|---------|--------|
| aeonik | self-hosted | 400, normal | normal |

## Image Style Patterns

| Pattern | Count | Key Styles |
|---------|-------|------------|
| thumbnail | 53 | objectFit: fill, borderRadius: 0px, shape: square |
| general | 13 | objectFit: cover, borderRadius: 0px, shape: square |
| avatar | 1 | objectFit: fill, borderRadius: 60.4444px, shape: circular |
| gallery | 1 | objectFit: contain, borderRadius: 0px, shape: square |
| hero | 1 | objectFit: cover, borderRadius: 0px, shape: square |

**Aspect ratios:** 1:1 (24x), 3:2 (15x), 2:3 (10x), 21:9 (5x), 4:3 (4x), 3.6:1 (4x), 9:16 (2x), 3:4 (2x)

## Motion Language

**Feel:** responsive · **Scroll-linked:** yes

### Duration Tokens

| name | value | ms |
|---|---|---|
| `sm` | `200ms` | 200 |
| `md` | `300ms` | 300 |
| `lg` | `500ms` | 500 |

### Easing Families

- **ease-out** (55 uses) — `cubic-bezier(0.19, 1, 0.22, 1)`

## Component Anatomy

### button — 36 instances

**Slots:** label
**Variants:** secondary

| variant | count | sample label |
|---|---|---|
| default | 35 | Contact Sales |
| secondary | 1 | Restart |

### card — 15 instances

**Slots:** media

## Brand Voice

**Tone:** friendly · **Pronoun:** we→you · **Headings:** Sentence case (balanced)

### Top CTA Verbs

- **pay** (7)
- **scan** (4)
- **contact** (2)
- **en** (2)
- **login** (2)
- **book** (2)
- **get** (2)
- **day** (1)

### Button Copy Patterns

- "scan my face
proceed to pay
pay later
done" (4×)
- "pay €690.00" (3×)
- "contact sales" (2×)
- "en
pt
es" (2×)
- "login" (2×)
- "pay later
pay €690.00
proceed to pay" (2×)
- "book a demo" (2×)
- "get started" (2×)
- "100€/day
  rent" (1×)
- "restart" (1×)

### Sample Headings

> The Flecto Link
Everything you need to start renting today
> And it’s just as simple for your customers
> We
exist to
> Reimagine ownership for a sustainable future.
> Built for humans.
Designed for you.
> Manage your bookings
> Control your inventory
> Rethink just how safe renting can be with Flecto.
> Multiple channels to multiply your online sales
> Set up your own online store

## Page Intent

**Type:** `landing` (confidence 0.31)
**Description:** Flecto is the rental platform that makes businesses thrive in the circular economy. A flexible rental software for all types of businesses.

Alternates: blog-post (0.35)

## Section Roles

Reading order (top→bottom): pricing-table → pricing-table → content → pricing-table → cta → content → testimonial → content → footer

| # | Role | Heading | Confidence |
|---|------|---------|------------|
| 0 | pricing-table | The Flecto Link
Everything you need to start renting today | 0.9 |
| 1 | pricing-table | And it’s just as simple for your customers | 0.9 |
| 2 | content | We
exist to | 0.3 |
| 3 | pricing-table | Built for humans.
Designed for you. | 0.9 |
| 4 | cta | Rethink just how safe renting can be with Flecto. | 0.75 |
| 5 | content | Multiple channels to multiply your online sales | 0.3 |
| 6 | testimonial | This is the new generation of rental businesses.

Get to know them. | 0.8 |
| 7 | content | Our latest news | 0.3 |
| 8 | footer | Proudly backed by | 0.95 |

## Material Language

**Label:** `material-you` (confidence 0.45)

| Metric | Value |
|--------|-------|
| Avg saturation | 0.498 |
| Shadow profile | soft |
| Avg shadow blur | 0px |
| Max radius | 1280px |
| backdrop-filter in use | no |
| Gradients | 1 |

## Imagery Style

**Label:** `photography` (confidence 0.138)
**Counts:** total 69, svg 15, icon 35, screenshot-like 0, photo-like 15
**Dominant aspect:** square-ish
**Radius profile on images:** square

## Quick Start

To recreate this design in a new project:

1. **Install fonts:** Add `aeonik` from Google Fonts or your font provider
2. **Import CSS variables:** Copy `variables.css` into your project
3. **Tailwind users:** Use the generated `tailwind.config.js` to extend your theme
4. **Design tokens:** Import `design-tokens.json` for tooling integration

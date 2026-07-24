# 2Hands Brand Guidelines

## Brand Identity

**Brand Name:** 2Hands  
**Tagline:** "Hands on AI"  
**Brand Essence:** Autonomous AI agents that execute complex computer tasks with precision and reliability.

---

## Color Palette

### Primary Colors

| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `--background` | `#FFFFFF` | `#131314` | Page background |
| `--foreground` | `#3A4044` | `#BDBDBD` | Primary text |
| `--primary` | `#091217` | `#E8E8E8` | Primary buttons, headings |
| `--primary-foreground` | `#FFFFFF` | `#0E0E0E` | Text on primary buttons |

### Secondary Colors

| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `--secondary` | `#F4F4F4` | `#191919` | Secondary backgrounds |
| `--muted` | `#F3F3F3` | `#191919` | Muted sections, cards |
| `--accent` | `#F4F4F4` | `#191919` | Accent backgrounds |
| `--card` | `#FFFFFF` | `#191919` | Card backgrounds |
| `--popover` | `#FFFFFF` | `#191919` | Popover backgrounds |

### Semantic Colors

| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `--border` | `rgba(9,18,23,0.06)` | `rgba(255,255,255,0.06)` | Borders, dividers |
| `--input` | `#EDEDED` | `#2E2F31` | Input backgrounds |
| `--ring` | `#091217` | `#E8E8E8` | Focus rings |
| `--destructive` | `#ef4444` | `#ef4444` | Error states |

### Accent Colors

| Color | Hex | Usage |
|-------|-----|-------|
| Emerald | `#10b981` / `#059669` | Success, best value badges |
| Blue | `#3b82f6` | Links, interactive elements |
| Amber | `#f59e0b` | Warnings, highlights |

---

## Typography

### Font Family
- **Primary:** Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
- **Monospace:** Geist Mono (for code/technical content)

### Type Scale

| Style | Size | Weight | Line Height | Letter Spacing | Usage |
|-------|------|--------|-------------|----------------|-------|
| Hero | 32px | 700 | 40px | -0.02em | Main headlines |
| H1 | 28px | 600 | 34px | -0.02em | Section titles |
| H2 | 22px | 600 | 28px | -0.01em | Card titles |
| H3 | 18px | 600 | 24px | -0.01em | Subsection titles |
| Body | 14px | 400 | 22px | 0 | Body text |
| Small | 13px | 400 | 18px | 0 | Secondary text |
| Caption | 12px | 500 | 16px | 0.02em | Labels, badges |
| Button | 14px | 500 | 20px | 0 | Button text |

### Typography Patterns
- Use **tabular-nums** for all numeric displays (prices, credits)
- Use **tight tracking** (`-0.02em`) for large headings
- Use **uppercase** with increased letter-spacing for labels

---

## Spacing System

### Base Unit: 4px

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | 4px | Tight spacing |
| `--space-2` | 8px | Icon gaps |
| `--space-3` | 12px | Component internal spacing |
| `--space-4` | 16px | Card padding |
| `--space-5` | 20px | Dialog padding |
| `--space-6` | 24px | Section gaps |
| `--space-8` | 32px | Large section gaps |

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 6px | Small buttons, inputs |
| `--radius-md` | 10px | Cards, containers |
| `--radius-lg` | 16px | Large cards, dialogs |
| `--radius-xl` | 24px | Pricing cards |
| `--radius-2xl` | 28px | Dialog container |
| `--radius-full` | 9999px | Pills, avatars |

---

## Component Styles

### Buttons

**Primary Button**
- Background: `--primary`
- Text: `--primary-foreground`
- Padding: 12px 24px
- Border-radius: 10px (or full for pill style)
- Font: 14px, weight 500
- Hover: opacity 0.9

**Secondary Button**
- Background: transparent
- Border: 1px solid `--border`
- Text: `--foreground`
- Padding: 12px 24px
- Border-radius: 10px

**Ghost Button**
- Background: transparent
- Text: `--muted-foreground`
- Hover: background `--muted`

### Cards

**Pricing Card**
- Background: `--card`
- Border: 1px solid `--border`
- Border-radius: 16px
- Padding: 24px
- Shadow: none (clean flat design)

**Pricing Card (Featured)**
- Border: 2px solid `--primary` (or brand accent)
- Slight scale: 1.02
- "Most Popular" badge at top

### Badges

**Primary Badge**
- Background: `--primary`
- Text: `--primary-foreground`
- Border-radius: 9999px
- Padding: 4px 12px
- Font: 11px, weight 600, uppercase, letter-spacing 0.05em

**Success Badge**
- Background: `#10b981`
- Text: white
- Border-radius: 9999px
- Padding: 4px 12px
- Font: 11px, weight 600, uppercase

---

## Layout Patterns

### Dialogs
- Background: `--background`
- Border-radius: 28px (desktop), 0 (mobile full-screen)
- Shadow: `0 40px 100px -20px rgba(0,0,0,0.25)`
- Border: 1px solid `--border`
- Max-width: 900px
- Padding: 32px 24px 20px

### Pricing Grid
- 3 columns on desktop
- 1 column on mobile
- Gap: 12px between cards
- Cards use CSS Grid subgrid for alignment

---

## Iconography

### Icon Style
- Line icons (Lucide)
- Stroke width: 1.5px - 2px
- Size: 16px (default), 20px (large), 24px (xl)
- Color: inherit from text color

### Feature Icons
- Custom SVG icons for key features
- Color: `--primary` or `--icon-primary`
- Size: 16px
- Contained in 24px rounded container

---

## Motion & Animation

### Transitions
- Duration: 200ms (fast), 300ms (normal), 400ms (slow)
- Easing: `cubic-bezier(0.23, 1, 0.32, 1)` (smooth decelerate)
- Scale on hover: 1.02
- Lift on hover: translateY(-4px)

### Dialog Animation
- Entry: fade in + scale from 0.96 + translateY from 20px
- Exit: fade out + scale to 0.96 + translateY to 20px
- Duration: 350ms

### Number Animation
- Rolling number effect for prices
- Duration: 600ms
- Easing: ease-out

---

## Voice & Tone

### Brand Voice
- **Professional** but approachable
- **Precise** and clear
- **Confident** without being arrogant
- **Helpful** and supportive

### Copy Guidelines
- Use active voice
- Be concise - remove unnecessary words
- Use sentence case for headings (not ALL CAPS)
- Lead with benefits, not features
- Example: "4,000 credits per month" not "Includes 4,000 credits"

---

## Dos and Don'ts

### Do
- Use generous whitespace
- Maintain consistent spacing
- Use the border color for subtle separation
- Round corners for a friendly, modern feel
- Use tabular numbers for prices and credits

### Don't
- Use harsh shadows
- Use gradients on backgrounds (keep it flat)
- Use overly decorative elements
- Crowd elements - let them breathe
- Use ALL CAPS for body text

---

## Implementation Notes

### CSS Variables
All colors should use CSS variables for automatic dark mode support:
```css
background: var(--background);
color: var(--foreground);
border: 1px solid var(--border);
```

### Responsive Breakpoints
- Desktop: > 1024px (3-column pricing)
- Tablet: 768px - 1024px (2-column pricing)
- Mobile: < 768px (1-column, full-width dialog)

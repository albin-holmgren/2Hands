# 2Hands Brand Assets

Complete brand system ready to clone into your application.

## Quick Start

```bash
# Clone this directory into your project
cp -r . /path/to/your/project/brand-assets/

# Or add as git submodule
git submodule add <your-repo-url> brand-assets
```

## What's Included

### 🎨 Design System
- **Complete color system** with light/dark mode
- **Multiple gray shades** for all UI states
- **Semantic color tokens** that auto-adapt
- **Component styles** ready to use

### 📄 Logo Files
- Black logo (primary)
- White logo (dark mode)
- Terracotta logos (merchandise)
- Favicon (optimized)

### 📖 Documentation
- Developer guidelines (complete reference)
- Color system documentation
- Typography guide
- Icon library (48 custom icons)

### 💻 Ready-to-Use Code
- CSS file with all variables
- React/Tailwind examples
- HTML component templates

## File Structure

```
/brand-assets/
├── README.md                              # This file
├── QUICK-START.md                         # 5-minute setup guide
│
├── /css/
│   └── 2hands-design-system.css          # Complete CSS (import this!)
│
├── /logos/
│   ├── 2hands-logo-black.svg             # Primary logo
│   ├── 2hands-logo-white.svg             # Dark mode logo
│   ├── 2hands-logo-terracotta-light.svg  # Merchandise (light bg)
│   └── 2hands-logo-terracotta-dark.svg   # Merchandise (dark bg)
│
├── /favicon/
│   └── 2hands-favicon-corrected.svg      # Website icon
│
├── /docs/
│   ├── 2HANDS-BRAND-GUIDELINES-DEVELOPER.md   # Complete guide
│   ├── 2HANDS-COLOR-SYSTEM-COMPLETE.md        # Color system
│   └── 2hands-custom-typography-guide.md      # Typography options
│
└── /examples/
    ├── 2hands-custom-icon-library.html    # 48 custom icons
    ├── 2hands-logo-system-final.html      # Logo usage
    ├── 2hands-final-brand-palette.html    # Color reference
    └── 2hands-homepage.html               # Example homepage
```

## Implementation (5 minutes)

### Step 1: Import CSS
```html
<!-- In your HTML head -->
<link rel="stylesheet" href="brand-assets/css/2hands-design-system.css">

<!-- Import Google Fonts -->
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">

<!-- Add favicon -->
<link rel="icon" type="image/svg+xml" href="brand-assets/favicon/2hands-favicon-corrected.svg">
```

### Step 2: Add Dark Mode Toggle
```html
<!-- Add to <html> element -->
<html data-theme="light">

<script>
  // Toggle dark mode
  function toggleDarkMode() {
    const theme = document.documentElement.getAttribute('data-theme');
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  }
  
  // Load saved theme
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
</script>
```

### Step 3: Use Colors
```css
/* Use semantic tokens (auto-adapt to light/dark) */
.my-component {
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border-default);
}

.my-button:hover {
  background: var(--surface-hover);
}
```

### Step 4: Add Logo
```html
<!-- Light mode -->
<img src="brand-assets/logos/2hands-logo-black.svg" alt="2Hands" width="140">

<!-- Dark mode (swap with JS) -->
<img src="brand-assets/logos/2hands-logo-white.svg" alt="2Hands" width="140">
```

## Color System Overview

### Base Colors
- `--color-brand-black: #34322D`
- `--color-brand-terracotta: #D97757`
- `--color-brand-beige: #F5F3F0`

### Semantic Tokens (Auto-adapt)
- `--bg-primary` - Main background
- `--bg-secondary` - Section backgrounds
- `--surface-default` - Card backgrounds
- `--surface-hover` - Hover states
- `--text-primary` - Main text
- `--text-secondary` - Secondary text
- `--border-default` - Default borders
- `--input-bg` - Input backgrounds

See `docs/2HANDS-COLOR-SYSTEM-COMPLETE.md` for complete reference.

## React/Next.js Setup

```jsx
// app/layout.js
import '../brand-assets/css/2hands-design-system.css';

export default function RootLayout({ children }) {
  return (
    <html data-theme="light">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
        <link rel="icon" type="image/svg+xml" href="/brand-assets/favicon/2hands-favicon-corrected.svg" />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

## Tailwind CSS Setup

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        'brand-black': '#34322D',
        'brand-terracotta': '#D97757',
        'brand-beige': '#F5F3F0',
        gray: {
          50: '#FAFAFA',
          100: '#F5F3F0',
          200: '#EEECE9',
          300: '#E5E3E0',
          400: '#C8C6C3',
          500: '#9E9C99',
          600: '#75736F',
          700: '#57554F',
          800: '#34322D',
          900: '#1F1E1A',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
      },
    },
  },
};
```

## Support

- **Complete Documentation**: `docs/2HANDS-BRAND-GUIDELINES-DEVELOPER.md`
- **Color System**: `docs/2HANDS-COLOR-SYSTEM-COMPLETE.md`
- **Icon Library**: `examples/2hands-custom-icon-library.html`
- **Logo Usage**: `examples/2hands-logo-system-final.html`

## License

These brand assets are proprietary to 2Hands. Internal use only.

---

**Version:** 2.1  
**Last Updated:** February 15, 2026  
**Status:** Production Ready ✨

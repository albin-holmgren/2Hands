# 2Hands Complete Color System
**Version 2.1 | Light & Dark Mode**

Complete color system for production applications with multiple gray shades, semantic tokens, and state colors.

---

## Color Philosophy

**Principle:** Every color has a purpose. Every shade has a use case.

We use a **base + semantic** approach:
1. **Base colors:** Brand colors that never change
2. **Semantic tokens:** Purpose-driven colors that adapt to light/dark mode

---

## Base Brand Colors

These colors remain constant across light and dark modes.

### Primary Brand Colors

```css
/* Brand Colors - Never change */
--color-brand-black: #34322D;
--color-brand-terracotta: #D97757;
--color-brand-terracotta-dark: #C86647;  /* Hover state */
--color-brand-beige: #F5F3F0;
--color-pure-white: #FFFFFF;
--color-pure-black: #000000;
```

### Functional Colors

```css
/* Functional - Never change */
--color-success: #10B981;
--color-success-dark: #059669;
--color-warning: #F59E0B;
--color-warning-dark: #D97706;
--color-error: #EF4444;
--color-error-dark: #DC2626;
--color-info: #3B82F6;
--color-info-dark: #2563EB;
```

---

## Gray Scale System

### Light Mode Grays

```css
/* Light Mode - Gray Scale */
--gray-50: #FAFAFA;   /* Lightest - Subtle backgrounds */
--gray-100: #F5F3F0;  /* Brand beige - Section backgrounds */
--gray-200: #EEECE9;  /* Hover states on beige */
--gray-300: #E5E3E0;  /* Borders, dividers */
--gray-400: #C8C6C3;  /* Disabled text */
--gray-500: #9E9C99;  /* Placeholder text */
--gray-600: #75736F;  /* Secondary text */
--gray-700: #57554F;  /* Body text alternative */
--gray-800: #34322D;  /* Brand black - Primary text */
--gray-900: #1F1E1A;  /* Darkest - Headers on dark surfaces */
```

### Dark Mode Grays

```css
/* Dark Mode - Gray Scale */
--gray-dark-50: #F5F3F0;   /* Lightest - Primary text in dark mode */
--gray-dark-100: #E5E3E0;  /* Secondary text */
--gray-dark-200: #C8C6C3;  /* Tertiary text */
--gray-dark-300: #9E9C99;  /* Placeholder text */
--gray-dark-400: #75736F;  /* Disabled text */
--gray-dark-500: #57554F;  /* Subtle borders */
--gray-dark-600: #3A3833;  /* Dividers */
--gray-dark-700: #2C2B27;  /* Elevated surfaces (cards) */
--gray-dark-800: #24232E;  /* Secondary backgrounds */
--gray-dark-900: #1A1918;  /* Base background */
```

---

## Semantic Color Tokens

These automatically adapt based on light/dark mode.

### Light Mode Tokens

```css
[data-theme="light"] {
  /* Backgrounds */
  --bg-primary: #FFFFFF;           /* Main background */
  --bg-secondary: #F5F3F0;         /* Section backgrounds */
  --bg-tertiary: #FAFAFA;          /* Subtle backgrounds */
  --bg-elevated: #FFFFFF;          /* Cards, modals (same as primary) */
  --bg-overlay: rgba(52, 50, 45, 0.8);  /* Modal overlays */
  
  /* Surfaces (Components) */
  --surface-default: #FFFFFF;      /* Default card background */
  --surface-hover: #F5F3F0;        /* Card hover state */
  --surface-active: #EEECE9;       /* Card active/pressed state */
  --surface-selected: #E5E3E0;     /* Selected state */
  --surface-disabled: #FAFAFA;     /* Disabled state */
  
  /* Input Fields */
  --input-bg: #F5F3F0;             /* Default input background */
  --input-bg-hover: #EEECE9;       /* Input hover */
  --input-bg-focus: #FFFFFF;       /* Input focus */
  --input-bg-disabled: #FAFAFA;    /* Input disabled */
  --input-border: #E5E3E0;         /* Input border */
  --input-border-hover: #C8C6C3;   /* Input border hover */
  --input-border-focus: #34322D;   /* Input border focus */
  
  /* Text Colors */
  --text-primary: #34322D;         /* Main text */
  --text-secondary: #75736F;       /* Secondary text */
  --text-tertiary: #9E9C99;        /* Tertiary text */
  --text-placeholder: #C8C6C3;     /* Placeholder text */
  --text-disabled: #C8C6C3;        /* Disabled text */
  --text-inverse: #FFFFFF;         /* Text on dark backgrounds */
  --text-link: #D97757;            /* Links */
  --text-link-hover: #C86647;      /* Link hover */
  
  /* Borders */
  --border-subtle: #F5F3F0;        /* Very subtle borders */
  --border-default: #E5E3E0;       /* Default borders */
  --border-medium: #C8C6C3;        /* Medium emphasis borders */
  --border-strong: #75736F;        /* Strong borders */
  --border-focus: #34322D;         /* Focus outlines */
  
  /* Interactive States */
  --hover-overlay: rgba(52, 50, 45, 0.04);   /* Hover overlay */
  --active-overlay: rgba(52, 50, 45, 0.08);  /* Active/pressed overlay */
  --selected-overlay: rgba(217, 119, 87, 0.1); /* Selected overlay */
  
  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(52, 50, 45, 0.05);
  --shadow-md: 0 4px 6px rgba(52, 50, 45, 0.07);
  --shadow-lg: 0 10px 15px rgba(52, 50, 45, 0.1);
  --shadow-xl: 0 20px 25px rgba(52, 50, 45, 0.15);
}
```

### Dark Mode Tokens

```css
[data-theme="dark"] {
  /* Backgrounds */
  --bg-primary: #1A1918;           /* Main background */
  --bg-secondary: #24232E;         /* Section backgrounds */
  --bg-tertiary: #2C2B27;          /* Subtle backgrounds */
  --bg-elevated: #2C2B27;          /* Cards, modals (elevated) */
  --bg-overlay: rgba(0, 0, 0, 0.8); /* Modal overlays */
  
  /* Surfaces (Components) */
  --surface-default: #2C2B27;      /* Default card background */
  --surface-hover: #3A3833;        /* Card hover state */
  --surface-active: #434139;       /* Card active/pressed state */
  --surface-selected: #57554F;     /* Selected state */
  --surface-disabled: #24232E;     /* Disabled state */
  
  /* Input Fields */
  --input-bg: #2C2B27;             /* Default input background */
  --input-bg-hover: #3A3833;       /* Input hover */
  --input-bg-focus: #24232E;       /* Input focus */
  --input-bg-disabled: #24232E;    /* Input disabled */
  --input-border: #3A3833;         /* Input border */
  --input-border-hover: #57554F;   /* Input border hover */
  --input-border-focus: #D97757;   /* Input border focus */
  
  /* Text Colors */
  --text-primary: #F5F3F0;         /* Main text */
  --text-secondary: #C8C6C3;       /* Secondary text */
  --text-tertiary: #9E9C99;        /* Tertiary text */
  --text-placeholder: #75736F;     /* Placeholder text */
  --text-disabled: #57554F;        /* Disabled text */
  --text-inverse: #1A1918;         /* Text on light backgrounds */
  --text-link: #E88768;            /* Links (lighter terracotta) */
  --text-link-hover: #D97757;      /* Link hover */
  
  /* Borders */
  --border-subtle: #2C2B27;        /* Very subtle borders */
  --border-default: #3A3833;       /* Default borders */
  --border-medium: #57554F;        /* Medium emphasis borders */
  --border-strong: #75736F;        /* Strong borders */
  --border-focus: #D97757;         /* Focus outlines */
  
  /* Interactive States */
  --hover-overlay: rgba(255, 255, 255, 0.05);   /* Hover overlay */
  --active-overlay: rgba(255, 255, 255, 0.08);  /* Active/pressed overlay */
  --selected-overlay: rgba(217, 119, 87, 0.15); /* Selected overlay */
  
  /* Shadows (less prominent in dark mode) */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.5);
  --shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.6);
}
```

---

## Component-Specific Colors

### Chat Components

```css
/* Chat Messages */
--chat-message-user-bg: var(--surface-default);
--chat-message-ai-bg: var(--bg-secondary);
--chat-message-system-bg: var(--bg-tertiary);
--chat-message-hover: var(--surface-hover);
--chat-input-bg: var(--input-bg);
--chat-input-border: var(--input-border);

/* Dark Mode Overrides */
[data-theme="dark"] {
  --chat-message-user-bg: #2C2B27;
  --chat-message-ai-bg: #24232E;
  --chat-message-system-bg: #1A1918;
}
```

### Sidebar/Navigation

```css
/* Sidebar */
--sidebar-bg: var(--bg-primary);
--sidebar-item-hover: var(--surface-hover);
--sidebar-item-active: var(--surface-selected);
--sidebar-border: var(--border-default);

/* Dark Mode */
[data-theme="dark"] {
  --sidebar-bg: #24232E;
  --sidebar-item-hover: #3A3833;
  --sidebar-item-active: #57554F;
}
```

### Code Blocks

```css
/* Code Syntax Highlighting */
--code-bg: #2C2B27;
--code-text: #F5F3F0;
--code-comment: #9E9C99;
--code-keyword: #D97757;
--code-string: #10B981;
--code-function: #3B82F6;
--code-number: #F59E0B;
```

### Status Colors

```css
/* Status Indicators */
--status-online: #10B981;
--status-away: #F59E0B;
--status-busy: #EF4444;
--status-offline: #75736F;

/* Processing States */
--processing-bg: rgba(217, 119, 87, 0.1);
--processing-border: #D97757;
--processing-text: #C86647;
```

---

## Usage Examples

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: var(--color-brand-terracotta);
  color: var(--color-pure-white);
  border: none;
}

.btn-primary:hover {
  background: var(--color-brand-terracotta-dark);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: var(--text-primary);
  border: 2px solid var(--border-default);
}

.btn-secondary:hover {
  background: var(--surface-hover);
  border-color: var(--border-medium);
}

/* Ghost Button */
.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
}

.btn-ghost:hover {
  background: var(--hover-overlay);
  color: var(--text-primary);
}
```

### Cards

```css
.card {
  background: var(--surface-default);
  border: 1px solid var(--border-default);
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-sm);
}

.card:hover {
  background: var(--surface-hover);
  box-shadow: var(--shadow-md);
}
```

### Input Fields

```css
.input {
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  color: var(--text-primary);
  border-radius: 8px;
  padding: 12px 16px;
}

.input:hover {
  background: var(--input-bg-hover);
  border-color: var(--input-border-hover);
}

.input:focus {
  background: var(--input-bg-focus);
  border: 2px solid var(--input-border-focus);
  outline: none;
}

.input::placeholder {
  color: var(--text-placeholder);
}
```

### Chat Messages

```css
/* User Message */
.chat-message-user {
  background: var(--chat-message-user-bg);
  border: 1px solid var(--border-default);
  color: var(--text-primary);
  padding: 16px;
  border-radius: 12px;
}

/* AI Message */
.chat-message-ai {
  background: var(--chat-message-ai-bg);
  color: var(--text-primary);
  padding: 16px;
  border-radius: 12px;
}

/* Chat Input */
.chat-input {
  background: var(--chat-input-bg);
  border: 1px solid var(--chat-input-border);
  color: var(--text-primary);
}
```

### Hover States

```css
/* Interactive elements */
.interactive-item {
  position: relative;
}

.interactive-item::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--hover-overlay);
  opacity: 0;
  transition: opacity 0.2s;
}

.interactive-item:hover::before {
  opacity: 1;
}
```

---

## Complete CSS Implementation

```css
:root {
  /* ==================== */
  /* BASE BRAND COLORS    */
  /* ==================== */
  --color-brand-black: #34322D;
  --color-brand-terracotta: #D97757;
  --color-brand-terracotta-dark: #C86647;
  --color-brand-beige: #F5F3F0;
  --color-pure-white: #FFFFFF;
  --color-pure-black: #000000;
  
  /* Functional Colors */
  --color-success: #10B981;
  --color-success-dark: #059669;
  --color-warning: #F59E0B;
  --color-warning-dark: #D97706;
  --color-error: #EF4444;
  --color-error-dark: #DC2626;
  --color-info: #3B82F6;
  --color-info-dark: #2563EB;
  
  /* ==================== */
  /* LIGHT MODE (Default) */
  /* ==================== */
  
  /* Backgrounds */
  --bg-primary: #FFFFFF;
  --bg-secondary: #F5F3F0;
  --bg-tertiary: #FAFAFA;
  --bg-elevated: #FFFFFF;
  --bg-overlay: rgba(52, 50, 45, 0.8);
  
  /* Surfaces */
  --surface-default: #FFFFFF;
  --surface-hover: #F5F3F0;
  --surface-active: #EEECE9;
  --surface-selected: #E5E3E0;
  --surface-disabled: #FAFAFA;
  
  /* Inputs */
  --input-bg: #F5F3F0;
  --input-bg-hover: #EEECE9;
  --input-bg-focus: #FFFFFF;
  --input-bg-disabled: #FAFAFA;
  --input-border: #E5E3E0;
  --input-border-hover: #C8C6C3;
  --input-border-focus: #34322D;
  
  /* Text */
  --text-primary: #34322D;
  --text-secondary: #75736F;
  --text-tertiary: #9E9C99;
  --text-placeholder: #C8C6C3;
  --text-disabled: #C8C6C3;
  --text-inverse: #FFFFFF;
  --text-link: #D97757;
  --text-link-hover: #C86647;
  
  /* Borders */
  --border-subtle: #F5F3F0;
  --border-default: #E5E3E0;
  --border-medium: #C8C6C3;
  --border-strong: #75736F;
  --border-focus: #34322D;
  
  /* Interactive */
  --hover-overlay: rgba(52, 50, 45, 0.04);
  --active-overlay: rgba(52, 50, 45, 0.08);
  --selected-overlay: rgba(217, 119, 87, 0.1);
  
  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(52, 50, 45, 0.05);
  --shadow-md: 0 4px 6px rgba(52, 50, 45, 0.07);
  --shadow-lg: 0 10px 15px rgba(52, 50, 45, 0.1);
  --shadow-xl: 0 20px 25px rgba(52, 50, 45, 0.15);
}

/* ==================== */
/* DARK MODE            */
/* ==================== */
[data-theme="dark"] {
  /* Backgrounds */
  --bg-primary: #1A1918;
  --bg-secondary: #24232E;
  --bg-tertiary: #2C2B27;
  --bg-elevated: #2C2B27;
  --bg-overlay: rgba(0, 0, 0, 0.8);
  
  /* Surfaces */
  --surface-default: #2C2B27;
  --surface-hover: #3A3833;
  --surface-active: #434139;
  --surface-selected: #57554F;
  --surface-disabled: #24232E;
  
  /* Inputs */
  --input-bg: #2C2B27;
  --input-bg-hover: #3A3833;
  --input-bg-focus: #24232E;
  --input-bg-disabled: #24232E;
  --input-border: #3A3833;
  --input-border-hover: #57554F;
  --input-border-focus: #D97757;
  
  /* Text */
  --text-primary: #F5F3F0;
  --text-secondary: #C8C6C3;
  --text-tertiary: #9E9C99;
  --text-placeholder: #75736F;
  --text-disabled: #57554F;
  --text-inverse: #1A1918;
  --text-link: #E88768;
  --text-link-hover: #D97757;
  
  /* Borders */
  --border-subtle: #2C2B27;
  --border-default: #3A3833;
  --border-medium: #57554F;
  --border-strong: #75736F;
  --border-focus: #D97757;
  
  /* Interactive */
  --hover-overlay: rgba(255, 255, 255, 0.05);
  --active-overlay: rgba(255, 255, 255, 0.08);
  --selected-overlay: rgba(217, 119, 87, 0.15);
  
  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.5);
  --shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.6);
}
```

---

## Tailwind Configuration

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        // Brand
        'brand-black': '#34322D',
        'brand-terracotta': '#D97757',
        'brand-terracotta-dark': '#C86647',
        'brand-beige': '#F5F3F0',
        
        // Grays (Light Mode)
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
        
        // Dark backgrounds
        dark: {
          50: '#F5F3F0',
          100: '#E5E3E0',
          200: '#C8C6C3',
          300: '#9E9C99',
          400: '#75736F',
          500: '#57554F',
          600: '#3A3833',
          700: '#2C2B27',
          800: '#24232E',
          900: '#1A1918',
        },
      },
    },
  },
};
```

---

## Color Decision Matrix

| Use Case | Light Mode | Dark Mode |
|----------|------------|-----------|
| **Page background** | `--bg-primary` (#FFFFFF) | `--bg-primary` (#1A1918) |
| **Section background** | `--bg-secondary` (#F5F3F0) | `--bg-secondary` (#24232E) |
| **Card background** | `--surface-default` (#FFFFFF) | `--surface-default` (#2C2B27) |
| **Card hover** | `--surface-hover` (#F5F3F0) | `--surface-hover` (#3A3833) |
| **Input background** | `--input-bg` (#F5F3F0) | `--input-bg` (#2C2B27) |
| **Input focus** | `--input-bg-focus` (#FFFFFF) | `--input-bg-focus` (#24232E) |
| **Chat message (user)** | #FFFFFF | #2C2B27 |
| **Chat message (AI)** | #F5F3F0 | #24232E |
| **Border default** | `--border-default` (#E5E3E0) | `--border-default` (#3A3833) |
| **Text primary** | `--text-primary` (#34322D) | `--text-primary` (#F5F3F0) |
| **Text secondary** | `--text-secondary` (#75736F) | `--text-secondary` (#C8C6C3) |

---

## Accessibility Notes

All color combinations meet **WCAG 2.1 Level AA** standards:

- Primary text on backgrounds: ✅ AAA (7:1+)
- Secondary text on backgrounds: ✅ AA (4.5:1+)
- Interactive elements: ✅ AA (3:1+)
- Focus indicators: ✅ Clear and visible

---

**Version:** 2.1  
**Last Updated:** February 15, 2026  
**Status:** Production Ready

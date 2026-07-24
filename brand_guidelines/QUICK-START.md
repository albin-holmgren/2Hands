# 2Hands Brand Assets - Quick Start Guide

Get up and running in 5 minutes.

## Step 1: Import the CSS (2 minutes)

```html
<!DOCTYPE html>
<html data-theme="light">
<head>
  <!-- Google Fonts -->
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
  
  <!-- Favicon -->
  <link rel="icon" type="image/svg+xml" href="/brand-assets/favicon/2hands-favicon-corrected.svg">
  
  <!-- 2Hands Design System -->
  <link rel="stylesheet" href="/brand-assets/css/2hands-design-system.css">
</head>
<body>
  <!-- Your app -->
</body>
</html>
```

## Step 2: Add Dark Mode (1 minute)

```javascript
// Add this script to toggle dark mode
function toggleDarkMode() {
  const html = document.documentElement;
  const currentTheme = html.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
}

// Load saved theme on page load
const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);
```

```html
<!-- Dark mode toggle button -->
<button onclick="toggleDarkMode()">Toggle Dark Mode</button>
```

## Step 3: Use the Colors (2 minutes)

### Basic Component Example

```html
<div class="card">
  <h2 style="color: var(--text-primary);">Card Title</h2>
  <p style="color: var(--text-secondary);">This card automatically adapts to light/dark mode!</p>
  <button class="btn-primary">Click Me</button>
</div>
```

### Chat Message Example

```html
<div class="chat-message-user">
  User message - uses semantic tokens
</div>

<div class="chat-message-ai">
  AI response - uses semantic tokens
</div>
```

### Input Example

```html
<input 
  type="text" 
  class="input" 
  placeholder="Type something..."
>
```

## That's It! 🎉

All colors, hover states, and dark mode work automatically.

## Common Use Cases

### Background Colors
```css
.my-section {
  background: var(--bg-primary);      /* Main background */
  background: var(--bg-secondary);    /* Section background */
  background: var(--surface-default); /* Card background */
}
```

### Text Colors
```css
.my-text {
  color: var(--text-primary);    /* Main text */
  color: var(--text-secondary);  /* Secondary text */
  color: var(--text-link);       /* Links */
}
```

### Borders
```css
.my-element {
  border: 1px solid var(--border-default);  /* Default border */
  border: 1px solid var(--border-medium);   /* Stronger border */
}
```

### Hover States
```css
.my-button:hover {
  background: var(--surface-hover);  /* Auto-adapts! */
}
```

## Next Steps

- **Full documentation**: See `docs/2HANDS-BRAND-GUIDELINES-DEVELOPER.md`
- **All colors**: See `docs/2HANDS-COLOR-SYSTEM-COMPLETE.md`
- **48 custom icons**: See `examples/2hands-custom-icon-library.html`

## React/Next.js?

```jsx
// app/layout.js
import '../brand-assets/css/2hands-design-system.css';

export default function RootLayout({ children }) {
  return (
    <html data-theme="light">
      <body>{children}</body>
    </html>
  );
}
```

## Need Help?

Check the `docs/` folder for complete documentation.

# Assets Folder

This folder contains static assets for the MarketSense application.

## Folder Structure

```
assets/
├── images/       # Image files (PNG, JPG, SVG, etc.)
├── icons/        # Icon files and icon sets
├── fonts/        # Custom web fonts
└── data/         # Static data files (JSON, CSV, etc.)
```

## Usage

### Images

Place image files in the `images/` folder and reference them in your components:

```html
<!-- In HTML -->
<img src="assets/images/logo.png" alt="Logo">
```

```typescript
// In TypeScript
logoUrl = 'assets/images/logo.png';
```

### Icons

Place icon files in the `icons/` folder:

```html
<img src="assets/icons/user-icon.svg" alt="User">
```

### Fonts

Place custom fonts in the `fonts/` folder and reference them in your styles:

```scss
// In styles.scss or component styles
@font-face {
  font-family: 'CustomFont';
  src: url('/assets/fonts/CustomFont.woff2') format('woff2');
}

body {
  font-family: 'CustomFont', sans-serif;
}
```

### Data Files

Place static JSON or other data files in the `data/` folder:

```typescript
// In a service
import { HttpClient } from '@angular/common/http';

constructor(private http: HttpClient) {}

getData() {
  return this.http.get('assets/data/config.json');
}
```

## Best Practices

1. **Optimize Images**: Compress images before adding them to reduce bundle size
2. **Use SVG**: Prefer SVG format for icons and logos for better scalability
3. **Lazy Loading**: For large images, consider lazy loading techniques
4. **Web Fonts**: Use modern formats like WOFF2 for better compression
5. **Naming Convention**: Use kebab-case for file names (e.g., `company-logo.png`)

## Asset Pipeline

Assets in this folder are:
- Copied to the build output as-is (no processing)
- Available at the `/assets/` path in your application
- Configured in `angular.json` under the `assets` array



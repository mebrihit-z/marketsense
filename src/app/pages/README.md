# Pages Module

The Pages module (also called Features module) contains all the page components and feature-specific functionality of the application.

## Structure

```
pages/
├── home/               # Home page
│   ├── home.component.ts
│   ├── home.component.html
│   └── home.component.scss
├── dashboard/          # Dashboard page
│   ├── dashboard.component.ts
│   ├── dashboard.component.html
│   └── dashboard.component.scss
├── about/             # About page
│   ├── about.component.ts
│   ├── about.component.html
│   └── about.component.scss
└── pages.module.ts    # Pages module definition with routes
```

## Available Pages

### Home Page (`/`)
- Landing page with hero section
- Feature highlights
- Call-to-action buttons

### Dashboard Page (`/dashboard`)
- Statistics overview
- Recent activities
- User-specific data

### About Page (`/about`)
- Company mission
- Team information
- Core values

## Adding New Pages

1. Create a new folder for your page:
```bash
ng generate component pages/my-page
```

2. Add the component to `pages.module.ts`:
```typescript
import { MyPageComponent } from './my-page/my-page.component';

// Add to declarations array
declarations: [
  // ...
  MyPageComponent
]
```

3. Add a route in `pages.module.ts`:
```typescript
const routes: Routes = [
  // ...
  { path: 'my-page', component: MyPageComponent }
];
```

## Lazy Loading (Optional)

For better performance, you can convert feature pages into lazy-loaded modules:

```typescript
// In app.routes.ts
{
  path: 'dashboard',
  loadChildren: () => import('./pages/dashboard/dashboard.module')
    .then(m => m.DashboardModule)
}
```

## Best Practices

1. **Feature Folders**: Organize related components in feature folders
2. **Smart vs Dumb**: Separate container (smart) and presentational (dumb) components
3. **Routing**: Keep all page routes in the pages module
4. **Services**: Use feature-specific services when needed
5. **Shared Components**: Import SharedModule for reusable components
6. **State Management**: Consider adding state management for complex features

## Page Structure

Each page should follow this structure:
- `*.component.ts` - Component logic
- `*.component.html` - Template
- `*.component.scss` - Styles
- `*.component.spec.ts` - Unit tests (optional)

## Navigation

Pages are accessible via routing:
```typescript
// In templates
<a routerLink="/">Home</a>
<a routerLink="/dashboard">Dashboard</a>
<a routerLink="/about">About</a>

// In components
this.router.navigate(['/dashboard']);
```





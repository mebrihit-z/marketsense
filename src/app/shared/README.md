# Shared Module

The Shared module contains reusable components, directives, and pipes that are used across multiple feature modules.

## Structure

```
shared/
├── components/       # Reusable UI components
│   ├── loading-spinner/
│   └── confirm-dialog/
├── directives/       # Custom directives
│   └── highlight.directive.ts
├── pipes/           # Custom pipes
│   ├── truncate.pipe.ts
│   └── safe-html.pipe.ts
└── shared.module.ts # Shared module definition
```

## What Goes Here

### Components (`components/`)
- Reusable UI components (buttons, cards, modals, etc.)
- Form controls
- Layout components used across features
- Display components

### Directives (`directives/`)
- Custom attribute directives
- Structural directives
- DOM manipulation directives

### Pipes (`pipes/`)
- Custom transformation pipes
- Formatting pipes
- Filter pipes

## Usage

Import SharedModule in any feature module that needs these components:

```typescript
import { SharedModule } from '../shared/shared.module';

@NgModule({
  imports: [SharedModule],
  declarations: [MyFeatureComponent]
})
export class MyFeatureModule { }
```

### Navbar Component

```html
<!-- Add to app.component.html (already configured) -->
<app-navbar></app-navbar>
<router-outlet></router-outlet>
```

Features:
- Sticky navigation bar
- Responsive mobile menu with hamburger icon
- Active route highlighting
- User authentication display
- Smooth animations and transitions
- Modern gradient design

### Loading Spinner Component

```html
<app-loading-spinner 
  size="medium" 
  color="#3b82f6" 
  message="Loading data...">
</app-loading-spinner>
```

### Confirm Dialog Component

```html
<app-confirm-dialog
  [isVisible]="showDialog"
  title="Delete Item"
  message="Are you sure you want to delete this item?"
  confirmText="Delete"
  cancelText="Cancel"
  (confirmed)="onDelete()"
  (cancelled)="onCancel()">
</app-confirm-dialog>
```

### Highlight Directive

```html
<div appHighlight="#ffeb3b">Hover over me!</div>
```

### Truncate Pipe

```html
<p>{{ longText | truncate:100:'...' }}</p>
```

### Safe HTML Pipe

```html
<div [innerHTML]="htmlContent | safeHtml"></div>
```

## Best Practices

1. **Keep it Generic**: Components should be reusable and not tied to specific features
2. **Export Everything**: Export all components, directives, and pipes for use in other modules
3. **Import Common Modules**: Always include CommonModule, FormsModule, etc.
4. **No Services**: Keep singleton services in the Core module
5. **Document Usage**: Add comments or documentation for complex components


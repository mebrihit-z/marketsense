# MarketSense Project Structure

This document describes the complete architecture and organization of the MarketSense Angular application.

## 📁 Project Overview

```
marketsense/
├── src/
│   ├── app/
│   │   ├── core/              # Singleton services, guards, interceptors
│   │   ├── shared/            # Reusable components, directives, pipes
│   │   ├── pages/             # Page components (features)
│   │   ├── app.component.*    # Root component
│   │   ├── app.config.ts      # Application configuration
│   │   └── app.routes.ts      # Application routes
│   ├── assets/                # Static assets
│   │   ├── images/
│   │   ├── icons/
│   │   ├── fonts/
│   │   └── data/
│   ├── environments/          # Environment configurations
│   │   ├── environment.ts        # Development
│   │   ├── environment.prod.ts   # Production
│   │   └── environment.staging.ts # Staging
│   ├── index.html            # Main HTML file
│   ├── main.ts               # Application entry point
│   └── styles.scss           # Global styles
├── public/                    # Public assets
├── angular.json              # Angular CLI configuration
├── package.json              # Dependencies
└── tsconfig.json             # TypeScript configuration
```

## 🏗️ Architecture

This project follows Angular best practices with a modular, scalable architecture:

### 1. Core Module (`src/app/core/`)
**Purpose**: Contains singleton services and app-wide functionality used once.

```
core/
├── guards/
│   └── auth.guard.ts         # Route protection
├── interceptors/
│   ├── auth.interceptor.ts   # Add auth tokens to requests
│   └── error.interceptor.ts  # Global error handling
├── services/
│   ├── auth.service.ts       # Authentication logic
│   └── api.service.ts        # HTTP API wrapper
├── models/
│   └── user.model.ts         # User interfaces & types
└── core.module.ts            # Core module definition
```

**Key Features**:
- Authentication service with JWT token management
- HTTP interceptors for auth and error handling
- Route guards for protected routes
- Shared models and interfaces

### 2. Shared Module (`src/app/shared/`)
**Purpose**: Reusable UI components, directives, and pipes.

```
shared/
├── components/
│   ├── loading-spinner/      # Loading indicator
│   └── confirm-dialog/       # Confirmation dialog
├── directives/
│   └── highlight.directive.ts # Highlight on hover
├── pipes/
│   ├── truncate.pipe.ts      # Truncate text
│   └── safe-html.pipe.ts     # Sanitize HTML
└── shared.module.ts          # Shared module definition
```

**Key Features**:
- Standalone components for easy importing
- Reusable UI components
- Custom directives and pipes
- No business logic (presentation only)

### 3. Pages Module (`src/app/pages/`)
**Purpose**: Feature modules and page components.

```
pages/
├── home/                     # Landing page
│   ├── home.component.ts
│   ├── home.component.html
│   └── home.component.scss
├── dashboard/                # Dashboard page
│   ├── dashboard.component.ts
│   ├── dashboard.component.html
│   └── dashboard.component.scss
├── about/                    # About page
│   ├── about.component.ts
│   ├── about.component.html
│   └── about.component.scss
└── pages.module.ts           # Pages module with routes
```

**Available Routes**:
- `/` - Home page
- `/dashboard` - Dashboard (can be protected with authGuard)
- `/about` - About page

### 4. Assets (`src/assets/`)
**Purpose**: Static files like images, icons, fonts, and data files.

```
assets/
├── images/    # Image files
├── icons/     # Icon files
├── fonts/     # Custom fonts
└── data/      # Static JSON/data files
```

### 5. Environments (`src/environments/`)
**Purpose**: Environment-specific configuration.

```
environments/
├── environment.ts           # Development (default)
├── environment.prod.ts     # Production
└── environment.staging.ts  # Staging
```

**Configuration**:
- API URLs
- Debug flags
- App metadata
- Feature flags

## 🚀 Getting Started

### Installation
```bash
cd marketsense
npm install
```

### Development
```bash
# Start dev server (uses environment.ts)
ng serve

# Serve with specific environment
ng serve --configuration=staging
ng serve --configuration=production
```

### Building
```bash
# Development build
ng build --configuration=development

# Staging build
ng build --configuration=staging

# Production build
ng build --configuration=production
```

### Testing
```bash
# Run unit tests
ng test

# Run e2e tests
ng e2e
```

## 📝 Code Organization Principles

### 1. Separation of Concerns
- **Core**: App-wide singletons
- **Shared**: Reusable UI components
- **Pages**: Feature-specific code

### 2. Standalone Components
All components use the standalone pattern for:
- Better tree-shaking
- Simplified imports
- Lazy loading support

### 3. Dependency Injection
Services use Angular's DI system with `providedIn: 'root'` for:
- Automatic singleton pattern
- Better testability
- Lazy initialization

### 4. Type Safety
- All models defined in `core/models/`
- Strong typing throughout
- Interfaces for data contracts

## 🔐 Security Features

### HTTP Interceptors
1. **Auth Interceptor**: Adds JWT tokens to outgoing requests
2. **Error Interceptor**: Handles 401/403/500 errors globally

### Route Guards
- `authGuard`: Protects routes requiring authentication
- Redirects unauthorized users to login

### Best Practices
- Sanitized HTML rendering (SafeHtmlPipe)
- HTTPS for production API calls
- Token storage in localStorage (consider httpOnly cookies for production)

## 🎨 Styling

### Global Styles
- `src/styles.scss` - Global SCSS styles
- Component-specific styles in their respective `.scss` files

### Component Styling
- Scoped styles using `:host`
- SCSS for variables and nesting
- Responsive design with media queries

### Design System
- Consistent color palette
- Reusable components
- Modern, clean UI

## 📚 Adding New Features

### Create a New Page
```bash
# Generate component in pages folder
ng generate component pages/my-new-page

# Add route in app.routes.ts
{ path: 'my-new-page', component: MyNewPageComponent }
```

### Create a Shared Component
```bash
# Generate standalone component
ng generate component shared/components/my-component --standalone

# Import in shared.module.ts or use directly
```

### Create a Service
```bash
# Generate service in core
ng generate service core/services/my-service
```

## 🧪 Testing Strategy

### Unit Tests
- Component tests (*.spec.ts)
- Service tests
- Pipe/Directive tests

### Integration Tests
- Route navigation
- API integration
- State management

### E2E Tests
- User workflows
- Critical paths
- Cross-browser testing

## 📦 Dependencies

### Core Dependencies
- `@angular/core` - Angular framework
- `@angular/router` - Routing
- `@angular/common/http` - HTTP client
- `rxjs` - Reactive programming

### Development Dependencies
- `@angular/cli` - Angular CLI
- `typescript` - TypeScript compiler
- `karma/jasmine` - Testing framework

## 🔄 Build & Deployment

### Build Configurations
- **Development**: Source maps, no optimization
- **Staging**: Optimized, staging API
- **Production**: Fully optimized, minified

### Deployment Steps
1. Build: `ng build --configuration=production`
2. Output: `dist/marketsense/`
3. Deploy to hosting provider (Netlify, Vercel, Firebase, etc.)

### Environment Variables
Configure in `environments/*.ts`:
- API URLs
- Feature flags
- Third-party keys

## 🐛 Debugging

### Development Tools
- Angular DevTools (Chrome extension)
- Browser developer tools
- Source maps enabled in dev

### Logging
- `environment.enableDebug` flag
- Console logging in services
- Error interceptor catches HTTP errors

## 📖 Further Reading

- [Angular Documentation](https://angular.dev)
- [RxJS Documentation](https://rxjs.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

## 👥 Contributing

When adding new features:
1. Follow the established folder structure
2. Use standalone components
3. Add proper TypeScript types
4. Include unit tests
5. Update this documentation

---

**Version**: 1.0.0  
**Last Updated**: December 2025  
**Angular Version**: 19.x









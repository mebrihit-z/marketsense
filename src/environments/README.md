# Environment Configuration

This folder contains environment-specific configuration files for the MarketSense application.

## Available Environments

### 1. Development (`environment.ts`)
- Used during local development
- Debug mode enabled
- Source maps included
- API URL: `http://localhost:3000/api`

### 2. Production (`environment.prod.ts`)
- Used for production builds
- Optimizations enabled
- Debug mode disabled
- API URL: `https://api.marketsense.com/api`

### 3. Staging (`environment.staging.ts`)
- Used for staging/testing builds
- Debug mode enabled
- API URL: `https://staging-api.marketsense.com/api`

## Usage

### Running the Application

```bash
# Development (default)
ng serve

# Production
ng serve --configuration=production

# Staging
ng serve --configuration=staging
```

### Building the Application

```bash
# Development build
ng build --configuration=development

# Production build
ng build --configuration=production

# Staging build
ng build --configuration=staging
```

## Using Environment Variables

Import the environment object in your components or services:

```typescript
import { environment } from '../environments/environment';

// Example usage
console.log(environment.apiUrl);
console.log(environment.production);
```

## Adding New Environment Variables

To add new configuration values:

1. Add the property to all environment files (`environment.ts`, `environment.prod.ts`, `environment.staging.ts`)
2. Use the property in your code by importing from `environments/environment`
3. Angular's build process will automatically replace it with the correct file based on your build configuration

## File Replacements

The `angular.json` configuration handles file replacements:
- Production builds replace `environment.ts` with `environment.prod.ts`
- Staging builds replace `environment.ts` with `environment.staging.ts`
- Development uses `environment.ts` as-is





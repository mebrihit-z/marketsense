# Core Module

The Core module contains singleton services, guards, interceptors, and models that are used throughout the application. This module should be imported only once in the AppModule.

## Structure

```
core/
├── guards/           # Route guards
│   └── auth.guard.ts
├── interceptors/     # HTTP interceptors
│   ├── auth.interceptor.ts
│   └── error.interceptor.ts
├── services/         # Singleton services
│   ├── auth.service.ts
│   └── api.service.ts
├── models/          # Application-wide models/interfaces
│   └── user.model.ts
└── core.module.ts   # Core module definition
```

## What Goes Here

### Services (`services/`)
- Authentication service
- API service
- State management services
- Data services used across the app
- Utility services

### Guards (`guards/`)
- Route guards (auth, role-based access)
- Can activate/deactivate guards

### Interceptors (`interceptors/`)
- HTTP interceptors (auth token, error handling)
- Request/response transformers

### Models (`models/`)
- Application-wide interfaces
- Type definitions
- Enums

## Usage

Import the CoreModule only once in your AppModule:

```typescript
import { CoreModule } from './core/core.module';

@NgModule({
  imports: [
    CoreModule,
    // other modules
  ]
})
export class AppModule { }
```

## Best Practices

1. **Singleton Services**: All services in core should be singletons
2. **Import Once**: Core module should only be imported in AppModule
3. **No Components**: Keep UI components in shared or feature modules
4. **Guard Against Reimport**: Core module throws an error if imported more than once


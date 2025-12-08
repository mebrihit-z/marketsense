import { Routes } from '@angular/router';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', component: DashboardComponent,
  },
  { path: '**', redirectTo: '', pathMatch: 'full' }
];

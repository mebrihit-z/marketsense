import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent {
  isMenuOpen = false;
//   currentUser$ = this.authService.currentUser$;

  navLinks = [
    { path: '/', label: 'Dashboard', icon: '📊' },
    { path: '/home', label: 'Home', icon: '🏠' },
    { path: '/about', label: 'About', icon: 'ℹ️' }
  ];

  constructor(
    // private authService: AuthService,
    private router: Router
  ) {}

  toggleMenu(): void {
    this.isMenuOpen = !this.isMenuOpen;
  }

  closeMenu(): void {
    this.isMenuOpen = false;
  }

  logout(): void {
    // this.authService.logout();
    this.router.navigate(['/home']);
    this.closeMenu();
  }

  isActiveRoute(path: string): boolean {
    return this.router.url === path;
  }
}


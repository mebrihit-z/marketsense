import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent {
  isMenuOpen = false;
//   currentUser$ = this.authService.currentUser$;
  imageLoaded = true;

  navLinks = [
    { path: '/', label: 'Dashboard', icon: '📊' },
    { path: '/home', label: 'Home', icon: '🏠' },
    { path: '/about', label: 'About', icon: 'ℹ️' }
  ];

  constructor(
    // private authService: AuthService,
    private router: Router
  ) {}

  onImageError(event: Event): void {
    this.imageLoaded = false;
    console.error('Logo image failed to load. Using fallback text logo.');
  }

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


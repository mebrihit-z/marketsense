import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ProfileModalComponent } from '../profile-modal/profile-modal.component';
import UserProfileService from '../../services/user-profile.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule, ProfileModalComponent],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export default class HeaderComponent {
  isProfileModalOpen = false;

  constructor(private userProfileService: UserProfileService) {}

  /** Last login: from UserProfileService or default (like welcome section). */
  get lastLogin(): string {
    return this.userProfileService.getLastLogin() ?? 'Today, 9:42 AM';
  }

  /** Avatar initials from logged-in user (UserProfileService) or fallback. */
  get displayInitials(): string {
    const name = this.userProfileService.getGivenName() ?? 'Mick';
    if (!name.trim()) return 'M';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    return name.charAt(0).toUpperCase() || 'M';
  }

  toggleProfileModal(): void {
    this.isProfileModalOpen = !this.isProfileModalOpen;
  }

  closeProfileModal(): void {
    this.isProfileModalOpen = false;
  }
}
 

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import ProfileModalComponent, { Profile } from '../profile-modal/profile-modal.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule, ProfileModalComponent],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export default class HeaderComponent {
  isProfileModalOpen = false;
  
  // Sample profile data - you can replace this with data from a service
  profiles: Profile[] = [
    {
      id: '1',
      firstName: 'Sofia',
      lastName: 'Fischer',
      role: 'Product Strategist',
      avatarColor: 'blue'
    },
    {
      id: '2',
      firstName: 'Priya',
      lastName: 'Ramesh',
      role: 'Consultant Relations Director',
      avatarColor: 'green'
    },
    {
      id: '3',
      firstName: 'Mattiya',
      lastName: 'Thompson',
      role: 'Sales/Marketing Manager',
      avatarColor: 'red'
    }
  ];

  currentProfileId = '1';

  /**
   * @returns {import("../profile-modal/profile-modal.component").Profile | undefined} The currently selected profile, or undefined
   */
  get currentProfile(): Profile | undefined {
    return this.profiles.find(p => p.id === this.currentProfileId);
  }

  /**
   * @param {import("../profile-modal/profile-modal.component").Profile} profile - Profile to get initials for
   * @returns {string} Uppercase two-letter initials
   */
  static getInitials(profile: Profile): string {
    return `${profile.firstName.charAt(0)}${profile.lastName.charAt(0)}`.toUpperCase();
  }

  toggleProfileModal(): void {
    this.isProfileModalOpen = !this.isProfileModalOpen;
  }

  closeProfileModal(): void {
    this.isProfileModalOpen = false;
  }

  /**
   * @param {import("../profile-modal/profile-modal.component").Profile} profile - Profile switched to
   */
  onProfileSwitch(profile: Profile): void {
    this.currentProfileId = profile.id;
    // Here you can add logic to switch the actual user profile
    // For example, call an authentication service to switch context
  }
}
 

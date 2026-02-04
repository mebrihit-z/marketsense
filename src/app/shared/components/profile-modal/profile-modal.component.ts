import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

export interface Profile {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  avatarColor: 'blue' | 'green' | 'red' | 'orange' | 'purple' | 'pink' | 'teal';
}

/**
 * @typedef {Object} ProfileJsDoc
 * @property {string} id - Unique profile identifier
 * @property {string} firstName - User's first name
 * @property {string} lastName - User's last name
 * @property {string} role - User's role
 * @property {string} avatarColor - Avatar color key
 */

@Component({
  selector: 'app-profile-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './profile-modal.component.html',
  styleUrl: './profile-modal.component.scss'
})
export default class ProfileModalComponent implements OnChanges {
  @Input() isVisible: boolean = false;
  @Input() profiles: Profile[] = [];
  @Input() currentProfileId: string = '';
  @Output() close = new EventEmitter<void>();
  @Output() profileSwitch = new EventEmitter<Profile>();

  /**
   * @param {import("@angular/router").Router} router - Angular Router for navigation
   */
  constructor(
    private router: Router
  ) {}

  /**
   * @param {import("@angular/core").SimpleChanges} changes - SimpleChanges object containing current and previous property values
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible']) {
      if (this.isVisible) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }
    }
  }

  /** Handles Escape key to close the modal. */
  @HostListener('document:keydown.escape')
  handleEscapeKey(): void {
    if (this.isVisible) {
      this.onClose();
    }
  }

  /**
   * @returns {ProfileJsDoc | undefined} The currently selected profile, or undefined
   */
  get currentProfile(): Profile | undefined {
    return this.profiles.find(p => p.id === this.currentProfileId);
  }

  /**
   * Returns initials from a profile's first and last name.
   * @param {ProfileJsDoc} profile - Profile to get initials for
   * @returns {string} Uppercase two-letter initials
   */
  // eslint-disable-next-line class-methods-use-this -- pure formatter, no instance state needed
  getInitials(profile: Profile): string {
    return `${profile.firstName.charAt(0)}${profile.lastName.charAt(0)}`.toUpperCase();
  }

  /**
   * Returns full name from a profile.
   * @param {ProfileJsDoc} profile - Profile to get full name for
   * @returns {string} First and last name concatenated
   */
  // eslint-disable-next-line class-methods-use-this -- pure formatter, no instance state needed
  getFullName(profile: Profile): string {
    return `${profile.firstName} ${profile.lastName}`;
  }

  /**
   * @param {ProfileJsDoc} profile - Profile to check
   * @returns {boolean} Whether the profile is currently selected
   */
  isProfileSelected(profile: Profile): boolean {
    return profile.id === this.currentProfileId;
  }

  /**
   * @param {ProfileJsDoc} profile - Profile to switch to
   */
  onSwitchProfile(profile: Profile): void {
    if (!this.isProfileSelected(profile)) {
      this.profileSwitch.emit(profile);
    }
    this.onClose();
  }

  onSignOut(): void {
    this.onClose();
    this.router.navigate(['/']);
  }

  onClose(): void {
    document.body.style.overflow = '';
    this.close.emit();
  }

  /**
   * Stops click propagation when clicking inside the modal.
   * @param {Event} event - DOM click event
   */
  // eslint-disable-next-line class-methods-use-this -- event handler only uses event param
  onModalClick(event: Event): void {
    event.stopPropagation();
  }
}


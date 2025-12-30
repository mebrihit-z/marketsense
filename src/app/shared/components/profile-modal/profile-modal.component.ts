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

  constructor(
    private router: Router
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible']) {
      if (this.isVisible) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  handleEscapeKey(event: KeyboardEvent): void {
    if (this.isVisible) {
      this.onClose();
    }
  }

  get currentProfile(): Profile | undefined {
    return this.profiles.find(p => p.id === this.currentProfileId);
  }

  getInitials(profile: Profile): string {
    return `${profile.firstName.charAt(0)}${profile.lastName.charAt(0)}`.toUpperCase();
  }

  getFullName(profile: Profile): string {
    return `${profile.firstName} ${profile.lastName}`;
  }

  isProfileSelected(profile: Profile): boolean {
    return profile.id === this.currentProfileId;
  }

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

  onModalClick(event: Event): void {
    event.stopPropagation();
  }
}


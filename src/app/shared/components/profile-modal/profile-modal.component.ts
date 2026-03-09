import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import UserProfileService from '../../services/user-profile.service';

@Component({
  selector: 'app-profile-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './profile-modal.component.html',
  styleUrl: './profile-modal.component.scss'
})
export class ProfileModalComponent implements OnChanges {
  @Input() isVisible: boolean = false;
  @Input() role: string = 'Product Strategist';
  @Output() close = new EventEmitter<void>();

  /** Display name: from UserProfileService (logged-in user) or fallback. */
  get displayName(): string {
    return this.userProfileService.getGivenName() ?? 'Mick';
  }

  /** Role: from UserProfileService.getRoleName() or fallback to role input. */
  get displayRole(): string {
    return this.userProfileService.getRoleName() ?? this.role;
  }

  /** Avatar initials derived from displayName. */
  get displayInitials(): string {
    const name = this.displayName?.trim();
    if (!name) return 'M';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    return name.charAt(0).toUpperCase() || 'M';
  }

  onModalClick(event: Event): void {
    event.stopPropagation();
  }

  constructor(
    private router: Router,
    private userProfileService: UserProfileService
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

  /** Handles Escape key to close the modal. */
  @HostListener('document:keydown.escape')
  handleEscapeKey(): void {
    if (this.isVisible) {
      this.onClose();
    }
  }

  onSignOut(): void {
    this.onClose();
    this.router.navigate(['/']);
  }

  onClose(): void {
    document.body.style.overflow = '';
    this.close.emit();
  }
}

export default ProfileModalComponent;

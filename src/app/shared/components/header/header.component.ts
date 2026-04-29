/* eslint-disable */
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ProfileModalComponent } from '../profile-modal/profile-modal.component';
import { DisclaimerBannerComponent } from '../disclaimer-banner/disclaimer-banner.component';
import UserProfileService from '../../services/user-profile.service';
import { AssetFlowsDataService } from '../../../core/services/asset-flows-data.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule, ProfileModalComponent, DisclaimerBannerComponent],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export default class HeaderComponent implements OnInit, OnDestroy {
  @Input() showTopDisclaimerBanner = true;
  @Output() learnMoreClicked = new EventEmitter<void>();
  @Output() dismissDisclaimer = new EventEmitter<void>();

  isProfileModalOpen = false;
  lastUpdatedLabel = 'N/A';
  private assetFlowsSub?: Subscription;

  constructor(
    private userProfileService: UserProfileService,
    private assetFlowsDataService: AssetFlowsDataService
  ) {}

  ngOnInit(): void {
    this.assetFlowsSub = this.assetFlowsDataService.getAssetFlows().subscribe({
      next: (rows) => {
        const latestDateIso = rows
          .map((row) => row.Load_Date)
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
        this.lastUpdatedLabel = latestDateIso ? this.formatDate(latestDateIso) : 'N/A';
      },
      error: () => {
        this.lastUpdatedLabel = 'N/A';
      },
    });
  }

  ngOnDestroy(): void {
    this.assetFlowsSub?.unsubscribe();
    document.body.style.overflow = '';
  }

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

  closeDisclaimerBanner(): void {
    this.dismissDisclaimer.emit();
  }

  openDisclosureModal(): void {
    this.learnMoreClicked.emit();
  }

  private formatDate(value: string): string {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'N/A';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(d);
  }
}
 

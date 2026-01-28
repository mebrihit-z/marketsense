/* eslint-disable */
import { Component, Input, HostListener, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import AskMarketsenseModalComponent from '../ask-marketsense-modal/ask-marketsense-modal.component';

@Component({
  selector: 'app-welcome-section',
  standalone: true,
  imports: [CommonModule, AskMarketsenseModalComponent],
  templateUrl: './welcome-section.component.html',
  styleUrls: ['./welcome-section.component.scss']
})
export class WelcomeSectionComponent implements AfterViewInit {
  @Input() userName: string = 'Sofia';
  @Input() lastLogin: string = 'Yesterday at 4:32 PM';
  @Input() viewingFilter: string = 'High-confidence Equities';
  @Input() isViewingDropdownOpen: boolean = false;

  @ViewChild('filterButton', { static: false }) filterButton!: ElementRef<HTMLButtonElement>;
  
  dropdownPosition = { top: 0, left: 0 };
  showAskMarketSenseModal: boolean = false;

  viewingOptions = [
    {
      name: 'High-confidence Equities',
      savedDate: '2 days',
      tags: ['Equity', 'North America, Europe'],
      isActive: true
    },
    {
      name: 'Global Alternatives View',
      savedDate: '5 days',
      tags: ['Alternatives, Private Equity'],
      isActive: false
    },
    {
      name: 'All Equities',
      savedDate: '1 week',
      tags: ['Equity'],
      isActive: false
    },
  ];

  ngAfterViewInit(): void {
    // Initial setup if needed
  }

  toggleViewingDropdown(): void {
    this.isViewingDropdownOpen = !this.isViewingDropdownOpen;
    if (this.isViewingDropdownOpen && this.filterButton) {
      setTimeout(() => {
        this.updateDropdownPosition();
      }, 0);
    }
  }

  updateDropdownPosition(): void {
    if (this.filterButton?.nativeElement) {
      const rect = this.filterButton.nativeElement.getBoundingClientRect();
      this.dropdownPosition = {
        top: rect.bottom + 8,
        left: rect.left
      };
    }
  }

  @HostListener('window:scroll', ['$event'])
  onScroll(): void {
    if (this.isViewingDropdownOpen) {
      this.updateDropdownPosition();
    }
  }

  @HostListener('window:resize', ['$event'])
  onResize(): void {
    if (this.isViewingDropdownOpen) {
      this.updateDropdownPosition();
    }
  }

  selectViewingOption(option: any): void {
    this.viewingFilter = option.name;
    // Update active state
    this.viewingOptions.forEach(opt => opt.isActive = false);
    option.isActive = true;
    this.isViewingDropdownOpen = false;
  }

  deleteOption(option: any, event: Event): void {
    event.stopPropagation(); // Prevent triggering selectViewingOption
    const index = this.viewingOptions.findIndex(opt => opt === option);
    if (index !== -1) {
      // If deleting the active option, set the first remaining option as active
      if (option.isActive && this.viewingOptions.length > 1) {
        const nextOption = this.viewingOptions[index === 0 ? 1 : 0];
        this.viewingFilter = nextOption.name;
        nextOption.isActive = true;
      }
      this.viewingOptions.splice(index, 1);
      
      // If no options remain, reset the viewing filter
      if (this.viewingOptions.length === 0) {
        this.viewingFilter = 'No presets';
      }
    }
  }

  onSaveCurrent(): void {
    // Handle save current filter preset
    console.log('Save current filter preset');
    // Here you would typically save the current filter configuration
  }

  onAskMarketSense(): void {
    this.showAskMarketSenseModal = true;
  }

  onCloseModal(): void {
    this.showAskMarketSenseModal = false;
  }

  onSendMessage(message: string): void {
    // Handle sending message to AI
    console.log('Message sent:', message);
    // Here you would typically send the message to an AI service
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (this.isViewingDropdownOpen) {
      const target = event.target as HTMLElement;
      const filterContainer = target.closest('.viewing-filter-container');
      if (!filterContainer) {
        this.isViewingDropdownOpen = false;
      }
    }
  }

}


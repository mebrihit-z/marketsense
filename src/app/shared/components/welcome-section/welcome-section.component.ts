import { Component, Input, HostListener, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import AskMarketsenseModalComponent from '../ask-marketsense-modal/ask-marketsense-modal.component';

export interface ViewingOption {
  name: string;
  savedDate: string;
  tags: string[];
  isActive: boolean;
}

@Component({
  selector: 'app-welcome-section',
  standalone: true,
  imports: [CommonModule, AskMarketsenseModalComponent],
  templateUrl: './welcome-section.component.html',
  styleUrls: ['./welcome-section.component.scss']
})
export default class WelcomeSectionComponent implements AfterViewInit {
  @Input() userName: string = 'Sofia';
  @Input() lastLogin: string = 'Today, 9:42 AM';
  @Input() viewingFilter: string = 'High-confidence Equities';
  @Input() isViewingDropdownOpen: boolean = false;

  get savedViewsCount(): number {
    return this.viewingOptions?.length ?? 0;
  }

  @ViewChild('filterButton', { static: false }) filterButton!: ElementRef<HTMLButtonElement>;
  
  dropdownPosition = { top: 0, left: 0 };
  showAskMarketSenseModal: boolean = false;

  viewingOptions: ViewingOption[] = [
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
    if (this.filterButton?.nativeElement) {
      this.updateDropdownPosition();
    }
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

  /**
   * @param {ViewingOption} option - Selected viewing option
   */
  selectViewingOption(option: ViewingOption): void {
    this.viewingFilter = option.name;
    this.viewingOptions = this.viewingOptions.map(o => ({
      ...o,
      isActive: o === option
    }));
    this.isViewingDropdownOpen = false;
  }

  /**
   * @param {ViewingOption} option - Option to remove
   * @param {Event} event - DOM event (used to stop propagation)
   */
  deleteOption(option: ViewingOption, event: Event): void {
    event.stopPropagation();
    const index = this.viewingOptions.findIndex(opt => opt === option);
    if (index === -1) return;
    const wasActive = option.isActive;
    const hadMultiple = this.viewingOptions.length > 1;
    this.viewingOptions = this.viewingOptions.filter((_, i) => i !== index);
    if (this.viewingOptions.length === 0) {
      this.viewingFilter = 'No presets';
    } else if (wasActive && hadMultiple) {
      this.viewingFilter = this.viewingOptions[0].name;
      this.viewingOptions = this.viewingOptions.map((o, i) => ({
        ...o,
        isActive: i === 0
      }));
    }
  }

  onSaveCurrent(): void {
    if (this.viewingFilter) {
      // Placeholder: save current filter configuration (inject a service and persist this.viewingFilter)
    }
  }

  onAskMarketSense(): void {
    this.showAskMarketSenseModal = true;
  }

  onCloseModal(): void {
    this.showAskMarketSenseModal = false;
  }

  /**
   * @param {string} message - Message to send
   */
  onSendMessage(message: string): void {
    if (this.showAskMarketSenseModal && message) {
      // Placeholder: send message to AI service
    }
  }

  /**
   * @param {Event} event - Document click event
   */
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


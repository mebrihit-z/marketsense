import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-disclaimer-banner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './disclaimer-banner.component.html',
  styleUrl: './disclaimer-banner.component.scss',
})
export class DisclaimerBannerComponent {
  @Input() isVisible = true;
  @Input() position: 'top' | 'bottom' = 'top';
  @Output() learnMore = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  onLearnMore(event: Event): void {
    event.preventDefault();
    this.learnMore.emit();
  }

  onClose(): void {
    this.close.emit();
  }
}

export default DisclaimerBannerComponent;

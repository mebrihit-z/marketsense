import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-view-more-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './view-more-card.component.html',
  styleUrl: './view-more-card.component.scss'
})
export class ViewMoreCardComponent {
  @Output() viewMore = new EventEmitter<void>();

  onViewMore(): void {
    this.viewMore.emit();
  }
}




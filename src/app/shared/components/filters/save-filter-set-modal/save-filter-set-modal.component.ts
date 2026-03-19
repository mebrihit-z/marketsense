/* eslint-disable */
import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import TitleComponent from '../../title/title.component';

@Component({
  selector: 'app-save-filter-set-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, TitleComponent],
  templateUrl: './save-filter-set-modal.component.html',
  styleUrl: './save-filter-set-modal.component.scss'
})
export default class SaveFilterSetModalComponent implements OnChanges {
  @Input() isVisible: boolean = false;
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<{ name: string; isDefault: boolean }>();

  filterSetName: string = '';
  isDefault: boolean = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible']) {
      if (this.isVisible) {
        document.body.style.overflow = 'hidden';
        // Reset the input when modal opens
        this.filterSetName = '';
        this.isDefault = false;
      } else {
        document.body.style.overflow = '';
      }
    }
  }

  onClose(): void {
    document.body.style.overflow = '';
    this.filterSetName = '';
    this.isDefault = false;
    this.close.emit();
  }

  onSave(): void {
    if (this.filterSetName.trim()) {
      this.save.emit({ name: this.filterSetName.trim(), isDefault: this.isDefault });
      this.filterSetName = '';
      this.isDefault = false;
      this.onClose();
    }
  }

  onCancel(): void {
    this.onClose();
  }

  onKeyDown(event: Event): void {
    // Allow Enter key to submit
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key === 'Enter' && this.filterSetName.trim()) {
      keyboardEvent.preventDefault();
      this.onSave();
    }
  }
}


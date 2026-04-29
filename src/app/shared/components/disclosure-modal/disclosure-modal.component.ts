import { Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-disclosure-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './disclosure-modal.component.html',
  styleUrl: './disclosure-modal.component.scss',
})
export default class DisclosureModalComponent implements OnChanges {
  @Input() isVisible = false;
  @Output() close = new EventEmitter<void>();
  @Output() acknowledge = new EventEmitter<void>();

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['isVisible']) return;
    document.body.style.overflow = this.isVisible ? 'hidden' : '';
  }

  @HostListener('document:keydown.escape')
  handleEscape(): void {
    if (!this.isVisible) return;
    this.onClose();
  }

  onClose(): void {
    document.body.style.overflow = '';
    this.close.emit();
  }

  onPrint(): void {
    window.print();
  }

  onAcknowledge(): void {
    document.body.style.overflow = '';
    this.acknowledge.emit();
  }
}

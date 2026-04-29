/* eslint-disable */
import { Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-disclosure-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './disclosure-modal.component.html',
  styleUrl: './disclosure-modal.component.scss',
  encapsulation: ViewEncapsulation.None,
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
    const root = document.documentElement;
    const cls = 'print-disclosure-only';
    root.classList.add(cls);

    let done = false;
    /** Browser `setTimeout` ids are numeric (distinct from Node's `Timer` type). */
    let fallbackId: number | undefined;

    const finish = (): void => {
      if (done) return;
      done = true;
      root.classList.remove(cls);
      window.removeEventListener('afterprint', finish);
      if (fallbackId !== undefined) {
        window.clearTimeout(fallbackId);
      }
    };

    window.addEventListener('afterprint', finish);
    fallbackId = window.setTimeout(finish, 120_000);

    queueMicrotask(() => {
      window.print();
    });
  }

  onAcknowledge(): void {
    document.body.style.overflow = '';
    this.acknowledge.emit();
  }
}

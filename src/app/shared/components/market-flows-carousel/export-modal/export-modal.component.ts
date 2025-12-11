import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-export-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './export-modal.component.html',
  styleUrl: './export-modal.component.scss'
})
export class ExportModalComponent implements OnChanges {
  @Input() isVisible: boolean = false;
  @Output() close = new EventEmitter<void>();
  @Output() exportXLS = new EventEmitter<void>();
  @Output() exportPDF = new EventEmitter<void>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible']) {
      if (this.isVisible) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }
    }
  }

  onClose(): void {
    document.body.style.overflow = '';
    this.close.emit();
  }

  onExportXLS(): void {
    this.exportXLS.emit();
    this.onClose();
  }

  onExportPDF(): void {
    this.exportPDF.emit();
    this.onClose();
  }
}




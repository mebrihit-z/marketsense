/* eslint-disable */
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import TitleComponent from '../title/title.component';

@Component({
  selector: 'app-charts-export-modal',
  standalone: true,
  imports: [CommonModule, TitleComponent],
  templateUrl: './charts-export-modal.component.html',
  styleUrl: './charts-export-modal.component.scss',
})
export class ChartsExportModalComponent implements OnChanges {
  @Input() isVisible: boolean = false;
  @Input() title: string = 'Export Chart';
  @Input() subtitle: string = 'Choose your preferred export format';
  @Output() close = new EventEmitter<void>();
  @Output() exportPNG = new EventEmitter<void>();
  @Output() exportPDF = new EventEmitter<void>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible']) {
      document.body.style.overflow = this.isVisible ? 'hidden' : '';
    }
  }

  onClose(): void {
    document.body.style.overflow = '';
    this.close.emit();
  }

  onExportPNG(): void {
    this.exportPNG.emit();
    this.onClose();
  }

  onExportPDF(): void {
    this.exportPDF.emit();
    this.onClose();
  }
}


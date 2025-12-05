import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-selected-filter-chip',
  standalone: true,
  imports: [],
  templateUrl: './selected-filter-chip.component.html',
  styleUrl: './selected-filter-chip.component.scss'
})
export class SelectedFilterChipComponent {
  @Input() label = '';
  @Output() remove = new EventEmitter<void>();

  get labelName(): string {
    const colonIndex = this.label.indexOf(':');
    return colonIndex !== -1 ? this.label.substring(0, colonIndex + 1) : this.label;
  }

  get labelValue(): string {
    const colonIndex = this.label.indexOf(':');
    return colonIndex !== -1 ? this.label.substring(colonIndex + 1).trim() : '';
  }
}

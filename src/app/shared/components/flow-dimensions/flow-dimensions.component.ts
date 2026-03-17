/* eslint-disable */
import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import TitleComponent from '../title/title.component';

export interface FlowDimension {
  id: string;
  label: string;
  count: number;
  active: boolean;
  total?: number;
}

export type DimensionSelectId = 'dimension1' | 'dimension2' | 'dimension3';

@Component({
  selector: 'app-flow-dimensions',
  standalone: true,
  imports: [CommonModule, FormsModule, TitleComponent],
  templateUrl: './flow-dimensions.component.html',
  styleUrl: './flow-dimensions.component.scss',
})
export class FlowDimensionsComponent implements OnChanges {
  @Input() title = 'Flow Dimensions';
  @Input() subtitle = '';
  @Input() availableDimensions: FlowDimension[] = [];
  @Input() selectedDimension1: FlowDimension | null = null;
  @Input() selectedDimension2: FlowDimension | null = null;
  @Input() selectedDimension3: FlowDimension | null = null;
  @Input() forceCloseDimensionDropdown = 0;
  /** When true, Dimension 3 dropdown includes a "None" option (super + parent nodes only). */
  @Input() showNoneForDimension3 = false;

  @Output() dimensionChange = new EventEmitter<{
    selectId: DimensionSelectId;
    dimension: FlowDimension | null;
  }>();
  @Output() dimensionDropdownOpened = new EventEmitter<void>();

  openDropdown: DimensionSelectId | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes['forceCloseDimensionDropdown'] &&
      (changes['forceCloseDimensionDropdown'].currentValue as number) > 0
    ) {
      this.openDropdown = null;
    }
  }

  getDimensionOptionText(dimension: FlowDimension): string {
    return dimension.label;
  }

  /** Synthetic "None" option for Dimension 3 only. */
  private readonly noneDimensionOption: FlowDimension = {
    id: 'none',
    label: 'None',
    count: 0,
    active: true,
  };

  getAvailableDimensionsForSelect(
    selectId: DimensionSelectId
  ): FlowDimension[] {
    const selectedIds = new Set<string>();
    if (selectId !== 'dimension1' && this.selectedDimension1) {
      selectedIds.add(this.selectedDimension1.id);
    }
    if (selectId !== 'dimension2' && this.selectedDimension2) {
      selectedIds.add(this.selectedDimension2.id);
    }
    if (selectId !== 'dimension3' && this.selectedDimension3) {
      selectedIds.add(this.selectedDimension3.id);
    }
    const list = this.availableDimensions.filter((dim) => !selectedIds.has(dim.id));
    if (selectId === 'dimension3' && this.showNoneForDimension3) {
      return [this.noneDimensionOption, ...list];
    }
    return list;
  }

  toggleDropdown(selectId: DimensionSelectId, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    if (this.openDropdown === selectId) {
      this.openDropdown = null;
    } else {
      this.openDropdown = selectId;
      this.dimensionDropdownOpened.emit();
    }
  }

  selectDimension(dimension: FlowDimension, selectId: DimensionSelectId): void {
    this.dimensionChange.emit({ selectId, dimension });
    this.openDropdown = null;
  }

  getDimensionCountLabel(dimension: FlowDimension): string | null {
    const selected = dimension.count ?? 0;
    const total = dimension.total ?? 0;
    if (selected === 0 && total === 0) {
      return null;
    }
    return total > 0 ? `${selected}/${total}` : `${selected}`;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.custom-select-wrapper')) {
      this.openDropdown = null;
    }
  }
}

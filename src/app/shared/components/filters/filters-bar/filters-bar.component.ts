import { Component, OnInit, HostListener, ViewChild, ElementRef, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FilterDropdownComponent, FilterOption, GroupedFilterOption } from '../filter-dropdown/filter-dropdown.component';

@Component({
  selector: 'app-filters-bar',
  standalone: true,
  imports: [CommonModule, FormsModule, FilterDropdownComponent],
  templateUrl: './filters-bar.component.html',
  styleUrl: './filters-bar.component.scss'
})
export class FiltersBarComponent implements OnInit {
  @ViewChild('sliderContainer', { static: false }) sliderContainer!: ElementRef<HTMLElement>;
  @Output() dataTypeChange = new EventEmitter<'historical' | 'forecasted'>();
  @Output() timeHorizonChange = new EventEmitter<string>();
  @Output() productSubTypeChange = new EventEmitter<string[]>();
  
  aiConfidenceRange = { min: 50, max: 100 };
  isDragging = false;
  dragType: 'min' | 'max' | null = null;
  sliderTrackWidth = 142; // Width of the slider track in pixels
  
  // Toggle state
  dataType: 'historical' | 'forecasted' = 'historical';
  selectedTimeHorizon: string = '-9 mo';

  ngOnInit() {
    // Initialize product sub-types with all options selected by default
    this.state.productSubType = this.productSubTypeOptions.flatMap(group => 
      group.options.map(opt => opt.value)
    );
    // Emit initial selection
    this.productSubTypeChange.emit(this.state.productSubType);
  }

  // --- sample options (replace with your real data) ---
  investorRegionOptions: FilterOption[] = [
    { value: 'United States' }, { value: 'Europe' }, { value: 'Asia Pacific' },
    { value: 'United Kingdom' }, { value: 'Middle East & Africa' }
  ];

  investorTypeOptions: FilterOption[] = [
    { value: 'Institutional' }, { value: 'Corporate' }, { value: 'Pension Funds' },
    { value: 'Sovereign Wealth' }, { value: 'Family Office' },
    { value: 'Endowments' }
  ];

  productRegionOptions: FilterOption[] = [
    { value: 'United States' }, { value: 'Europe' }, { value: 'Asia Pacific' },
    { value: 'United Kingdom' }, { value: 'Middle East & Africa' }
  ];

  productTypeOptions: FilterOption[] = [
    { value: 'Equity' }, { value: 'Fixed Income' }, { value: 'Alternatives' },
    { value: 'Cash' }, { value: 'Private Markets' }, { value: 'Other/Specialized' }, 
    { value: 'Multi-Asset' }
  ];

  productSubTypeOptions: GroupedFilterOption[] = [
    {
      category: 'Equity',
      options: [
        { value: 'US Equity Small Cap' },
        { value: 'US Equity Large Cap' },
        { value: 'Global Equity' },
        { value: 'Emerging Markets' }
      ]
    },
    {
      category: 'Fixed Income',
      options: [
        { value: 'US Fixed Income' },
        { value: 'Municipal Bond' },
        { value: 'Global Bonds' },
        { value: 'Short Duration' }
      ]
    },
    {
      category: 'Alternatives',
      options: [
        { value: 'Hedge Funds' },
        { value: 'Crypto' },
        { value: 'Commodities' }
      ]
    },
    {
      category: 'Cash',
      options: [
        { value: 'Money Market Funds' },
        { value: 'Treasury Bills' },
        { value: 'Bank Deposits/CDs' },
        { value: 'Foreign Currency/FFX' }
      ]
    }
  ];
  // --------------------------------------------------
   // centralized state (Option A)
   state = {
    investorRegion: [] as string[],
    investorType: [] as string[],
    productRegion: [] as string[],
    productType: [] as string[],
    productSubType: [] as string[]
  };

  onChange(key: keyof typeof this.state, values: string[]) {
    this.state[key] = values;
    if (key === 'productSubType') {
      this.productSubTypeChange.emit(values);
    }
  }

  clearAll() {
    for (const k of Object.keys(this.state)) (this.state as any)[k] = [];
    this.aiConfidenceRange = { min: 50, max: 100 };
  }

  startDrag(event: MouseEvent | TouchEvent, type: 'min' | 'max') {
    event.preventDefault();
    this.isDragging = true;
    this.dragType = type;
    this.handleDrag(event);
  }

  @HostListener('document:mousemove', ['$event'])
  @HostListener('document:touchmove', ['$event'])
  onDrag(event: MouseEvent | TouchEvent) {
    if (this.isDragging) {
      this.handleDrag(event);
    }
  }

  @HostListener('document:mouseup')
  @HostListener('document:touchend')
  stopDrag() {
    this.isDragging = false;
    this.dragType = null;
  }

  getKnobPosition(type: 'min' | 'max'): number {
    const value = type === 'min' ? this.aiConfidenceRange.min : this.aiConfidenceRange.max;
    return (value / 100) * this.sliderTrackWidth;
  }

  getActiveTrackLeft(): number {
    return (this.aiConfidenceRange.min / 100) * this.sliderTrackWidth;
  }

  getActiveTrackWidth(): number {
    return ((this.aiConfidenceRange.max - this.aiConfidenceRange.min) / 100) * this.sliderTrackWidth;
  }

  private handleDrag(event: MouseEvent | TouchEvent) {
    if (!this.dragType || !this.sliderContainer) return;

    const rect = this.sliderContainer.nativeElement.getBoundingClientRect();
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const x = clientX - rect.left;
    // Calculate percentage based on track width (142px)
    // Track starts at left: 0 within the container, so we use track width directly
    const percentage = Math.max(0, Math.min(100, (x / this.sliderTrackWidth) * 100));

    if (this.dragType === 'min') {
      this.aiConfidenceRange.min = Math.min(percentage, this.aiConfidenceRange.max - 1);
    } else {
      this.aiConfidenceRange.max = Math.max(percentage, this.aiConfidenceRange.min + 1);
    }
  }

  // Toggle methods
  get timeHorizons(): string[] {
    return this.dataType === 'historical' 
      ? ['-3 mo', '-6 mo', '-9 mo', '-12 mo', '-18 mo', 'Today']
      : ['Today', '+3 mo', '+6 mo', '+9 mo', '+12 mo', '+18 mo'];
  }

  setDataType(type: 'historical' | 'forecasted'): void {
    this.dataType = type;
    // Update the time horizon sign when switching data type
    const currentValue = this.selectedTimeHorizon.replace(/[+-]/g, '');
    const newSign = type === 'historical' ? '-' : '+';
    this.selectedTimeHorizon = `${newSign}${currentValue}`;
    this.dataTypeChange.emit(type);
    this.timeHorizonChange.emit(this.selectedTimeHorizon);
  }

  setTimeHorizon(horizon: string): void {
    this.selectedTimeHorizon = horizon;
    this.timeHorizonChange.emit(horizon);
  }
}

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
  @ViewChild('timeHorizonSliderContainer', { static: false }) timeHorizonSliderContainer!: ElementRef<HTMLElement>;
  @Output() dataTypeChange = new EventEmitter<'historical' | 'forecasted'>();
  @Output() timeHorizonChange = new EventEmitter<string>();
  @Output() productSubTypeChange = new EventEmitter<string[]>();
  @Output() productTypeChange = new EventEmitter<string[]>();
  @Output() productRegionChange = new EventEmitter<string[]>();
  
  aiConfidenceRange = { min: 50, max: 100 };
  isDragging = false;
  dragType: 'min' | 'max' | null = null;
  hasDragged = false; // Track if user actually dragged vs just clicked
  sliderTrackWidth = 142; // Width of the slider track in pixels
  
  // Time Horizon range slider state
  timeHorizonRange = { startIndex: 0, endIndex: 1 }; // Default: Today to +3mo for forecasted
  isTimeHorizonDragging = false;
  timeHorizonDragType: 'start' | 'end' | null = null;
  timeHorizonHasDragged = false; // Track if user actually dragged vs just clicked
  timeHorizonSliderTrackWidth = 400; // Width of the time horizon slider track in pixels
  
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
    
    // Initialize time horizon range based on selectedTimeHorizon
    this.initializeTimeHorizonRange();
  }

  private initializeTimeHorizonRange(): void {
    const horizons = this.timeHorizons;
    const selectedIndex = horizons.indexOf(this.selectedTimeHorizon);
    if (selectedIndex >= 0) {
      // Set range from start (Today/First option) to selected index
      this.timeHorizonRange = { startIndex: 0, endIndex: selectedIndex || 1 };
    } else {
      // Default: Today to first option (+3mo for forecasted)
      this.timeHorizonRange = { startIndex: 0, endIndex: 1 };
      this.updateSelectedTimeHorizon();
    }
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
    if (key === 'productType') {
      this.productTypeChange.emit(values);
    }
    if (key === 'productRegion') {
      this.productRegionChange.emit(values);
    }
  }

  clearAll() {
    for (const k of Object.keys(this.state)) (this.state as any)[k] = [];
    this.aiConfidenceRange = { min: 50, max: 100 };
  }

  startDrag(event: MouseEvent | TouchEvent, type: 'min' | 'max') {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
    this.hasDragged = false;
    this.dragType = type;
    this.handleDrag(event);
  }

  @HostListener('document:mousemove', ['$event'])
  @HostListener('document:touchmove', ['$event'])
  onDrag(event: MouseEvent | TouchEvent) {
    if (this.isDragging) {
      this.handleDrag(event);
    }
    if (this.isTimeHorizonDragging) {
      this.handleTimeHorizonDrag(event);
    }
  }

  @HostListener('document:mouseup')
  @HostListener('document:touchend')
  stopDrag() {
    this.isDragging = false;
    this.dragType = null;
    // Reset drag flag after a brief delay to allow click handler to check it
    setTimeout(() => {
      this.hasDragged = false;
    }, 100);
    if (this.isTimeHorizonDragging) {
      this.isTimeHorizonDragging = false;
      this.timeHorizonDragType = null;
      // Reset drag flag after a brief delay to allow click handler to check it
      setTimeout(() => {
        this.timeHorizonHasDragged = false;
      }, 100);
    }
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
    
    this.hasDragged = true;
  }

  onAIConfidenceTrackClick(event: MouseEvent | TouchEvent) {
    // Don't handle clicks if user was dragging
    if (this.hasDragged || this.isDragging) {
      return;
    }
    
    event.stopPropagation();
    if (!this.sliderContainer) return;

    const rect = this.sliderContainer.nativeElement.getBoundingClientRect();
    let clientX: number;
    if ('touches' in event || 'changedTouches' in event) {
      const touchEvent = event as TouchEvent;
      clientX = touchEvent.changedTouches?.[0]?.clientX || touchEvent.touches?.[0]?.clientX || 0;
    } else {
      clientX = (event as MouseEvent).clientX;
    }
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / this.sliderTrackWidth) * 100));
    
    // Determine which knob is closer to the click position
    const minDistance = Math.abs(percentage - this.aiConfidenceRange.min);
    const maxDistance = Math.abs(percentage - this.aiConfidenceRange.max);
    
    // Move the closer knob, or min knob if equidistant
    if (minDistance <= maxDistance) {
      // Move min knob, but ensure it doesn't go past max
      this.aiConfidenceRange.min = Math.min(percentage, this.aiConfidenceRange.max - 1);
    } else {
      // Move max knob, but ensure it doesn't go before min
      this.aiConfidenceRange.max = Math.max(percentage, this.aiConfidenceRange.min + 1);
    }
  }

  // Time Horizon methods
  get timeHorizons(): string[] {
    return this.dataType === 'historical' 
      ? ['-3 mo', '-6 mo', '-9 mo', '-12 mo', '-18 mo', 'Today']
      : ['Today', '+3 mo', '+6 mo', '+9 mo', '+12 mo', '+18 mo'];
  }

  setDataType(type: 'historical' | 'forecasted'): void {
    this.dataType = type;
    // Reset time horizon range to default (Today to first option)
    this.timeHorizonRange = { startIndex: 0, endIndex: 1 };
    this.updateSelectedTimeHorizon();
    this.dataTypeChange.emit(type);
  }

  private updateSelectedTimeHorizon(): void {
    // Emit the end value (right handle) as the selected time horizon
    const endHorizon = this.timeHorizons[this.timeHorizonRange.endIndex];
    this.selectedTimeHorizon = endHorizon;
    this.timeHorizonChange.emit(endHorizon);
  }

  startTimeHorizonDrag(event: MouseEvent | TouchEvent, type: 'start' | 'end') {
    event.preventDefault();
    event.stopPropagation();
    this.isTimeHorizonDragging = true;
    this.timeHorizonHasDragged = false;
    this.timeHorizonDragType = type;
    this.handleTimeHorizonDrag(event);
  }

  onTimeHorizonTrackClick(event: MouseEvent | TouchEvent) {
    // Don't handle clicks if user was dragging
    if (this.timeHorizonHasDragged || this.isTimeHorizonDragging) {
      return;
    }
    
    event.stopPropagation();
    if (!this.timeHorizonSliderContainer) return;

    const rect = this.timeHorizonSliderContainer.nativeElement.getBoundingClientRect();
    let clientX: number;
    if ('touches' in event || 'changedTouches' in event) {
      const touchEvent = event as TouchEvent;
      clientX = touchEvent.changedTouches?.[0]?.clientX || touchEvent.touches?.[0]?.clientX || 0;
    } else {
      clientX = (event as MouseEvent).clientX;
    }
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / this.timeHorizonSliderTrackWidth) * 100));
    
    // Calculate which index this percentage corresponds to
    const numSteps = this.timeHorizons.length - 1;
    const stepIndex = Math.round((percentage / 100) * numSteps);
    const clickedIndex = Math.max(0, Math.min(numSteps, stepIndex));
    
    // Determine which handle is closer to the click position
    const startDistance = Math.abs(clickedIndex - this.timeHorizonRange.startIndex);
    const endDistance = Math.abs(clickedIndex - this.timeHorizonRange.endIndex);
    
    // Move the closer handle, or start handle if equidistant
    if (startDistance <= endDistance) {
      // Move start handle, but ensure it doesn't go past end
      this.timeHorizonRange.startIndex = Math.min(clickedIndex, this.timeHorizonRange.endIndex);
    } else {
      // Move end handle, but ensure it doesn't go before start
      this.timeHorizonRange.endIndex = Math.max(clickedIndex, this.timeHorizonRange.startIndex);
    }
    
    this.updateSelectedTimeHorizon();
  }

  private handleTimeHorizonDrag(event: MouseEvent | TouchEvent) {
    if (!this.timeHorizonDragType || !this.timeHorizonSliderContainer) return;

    const rect = this.timeHorizonSliderContainer.nativeElement.getBoundingClientRect();
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / this.timeHorizonSliderTrackWidth) * 100));
    
    // Calculate which index this percentage corresponds to
    const numSteps = this.timeHorizons.length - 1;
    const stepIndex = Math.round((percentage / 100) * numSteps);
    const clampedIndex = Math.max(0, Math.min(numSteps, stepIndex));

    if (this.timeHorizonDragType === 'start') {
      // Ensure start is not greater than end
      this.timeHorizonRange.startIndex = Math.min(clampedIndex, this.timeHorizonRange.endIndex);
    } else {
      // Ensure end is not less than start
      this.timeHorizonRange.endIndex = Math.max(clampedIndex, this.timeHorizonRange.startIndex);
    }
    
    this.timeHorizonHasDragged = true;
    this.updateSelectedTimeHorizon();
  }

  getTimeHorizonHandlePosition(type: 'start' | 'end'): number {
    const index = type === 'start' ? this.timeHorizonRange.startIndex : this.timeHorizonRange.endIndex;
    const numSteps = this.timeHorizons.length - 1;
    return (index / numSteps) * this.timeHorizonSliderTrackWidth;
  }

  getTimeHorizonActiveTrackLeft(): number {
    const numSteps = this.timeHorizons.length - 1;
    return (this.timeHorizonRange.startIndex / numSteps) * this.timeHorizonSliderTrackWidth;
  }

  getTimeHorizonActiveTrackWidth(): number {
    const numSteps = this.timeHorizons.length - 1;
    const range = this.timeHorizonRange.endIndex - this.timeHorizonRange.startIndex;
    return (range / numSteps) * this.timeHorizonSliderTrackWidth;
  }
}

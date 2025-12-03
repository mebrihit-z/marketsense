import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FilterDropdownComponent, FilterOption } from '../filter-dropdown/filter-dropdown.component';
import { SelectedFiltersListComponent, ChipItem } from '../selected-filters-list/selected-filters-list.component';

@Component({
  selector: 'app-filters-bar',
  imports: [CommonModule, FormsModule, FilterDropdownComponent, SelectedFiltersListComponent],
  templateUrl: './filters-bar.component.html',
  styleUrl: './filters-bar.component.scss'
})
export class FiltersBarComponent {
  includeMediumConfidence = false;

  // --- sample options (replace with your real data) ---
  investorRegionOptions: FilterOption[] = [
    { value: 'United States' }, { value: 'Europe' }, { value: 'Asia Pacific' },
    { value: 'United Kingdom' }, { value: 'Middle East & Africa' }
  ];

  investorTypeOptions: FilterOption[] = [
    { value: 'Retail' }, { value: 'Institutional' }, { value: 'Family Office' }
  ];

  productRegionOptions: FilterOption[] = [
    { value: 'United States' }, { value: 'Europe' }, { value: 'Asia' }
  ];

  productTypeOptions: FilterOption[] = [
    { value: 'Equity' }, { value: 'Fixed Income' }, { value: 'Alternatives' }
  ];

  productSubTypeOptions: FilterOption[] = [
    { value: 'Sub A' }, { value: 'Sub B' }, { value: 'Sub C' }
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

  // chips computed getter
  get chips(): ChipItem[] {
    const res: ChipItem[] = [];
    const add = (key: string, arr: string[]) => {
      for (const v of arr) {
        res.push({ key, label: this.prettyKey(key) + ': ' + v, value: v } as ChipItem);
      }
    };

    add('investorRegion', this.state.investorRegion);
    add('investorType', this.state.investorType);
    add('productRegion', this.state.productRegion);
    add('productType', this.state.productType);
    add('productSubType', this.state.productSubType);
    return res;
  }

  prettyKey(k: string) {
    return k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
  }

  onChange(key: keyof typeof this.state, values: string[]) {
    this.state[key] = values;
  }

  removeChip(chip: ChipItem) {
    const arr = this.state[chip.key as keyof typeof this.state] as string[];
    this.state[chip.key as keyof typeof this.state] = arr.filter(x => x !== chip.value);
  }

  clearAll() {
    for (const k of Object.keys(this.state)) (this.state as any)[k] = [];
    this.includeMediumConfidence = false;
  }
}

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FilterDropdownComponent, FilterOption, GroupedFilterOption } from '../filter-dropdown/filter-dropdown.component';
import { SelectedFiltersListComponent, ChipItem } from '../selected-filters-list/selected-filters-list.component';

@Component({
  selector: 'app-filters-bar',
  standalone: true,
  imports: [CommonModule, FormsModule, FilterDropdownComponent, SelectedFiltersListComponent],
  templateUrl: './filters-bar.component.html',
  styleUrl: './filters-bar.component.scss'
})
export class FiltersBarComponent implements OnInit {
  includeMediumConfidence = false;

  ngOnInit() {
    // Initialize product sub-types with all options selected by default
    this.state.productSubType = this.productSubTypeOptions.flatMap(group => 
      group.options.map(opt => opt.value)
    );
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
    // Exclude productSubType from chips as there are too many (15 items)
    // add('productSubType', this.state.productSubType);
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

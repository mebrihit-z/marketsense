import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SelectedFilterChipComponent } from './selected-filter-chip.component';

describe('SelectedFilterChipComponent', () => {
  let component: SelectedFilterChipComponent;
  let fixture: ComponentFixture<SelectedFilterChipComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SelectedFilterChipComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SelectedFilterChipComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

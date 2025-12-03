import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SelectedFiltersListComponent } from './selected-filters-list.component';

describe('SelectedFiltersListComponent', () => {
  let component: SelectedFiltersListComponent;
  let fixture: ComponentFixture<SelectedFiltersListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SelectedFiltersListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SelectedFiltersListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

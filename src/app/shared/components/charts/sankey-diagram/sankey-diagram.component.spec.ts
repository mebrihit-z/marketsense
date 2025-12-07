import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SankeyDiagramComponent } from './sankey-diagram.component';

describe('SankeyDiagramComponent', () => {
  let component: SankeyDiagramComponent;
  let fixture: ComponentFixture<SankeyDiagramComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SankeyDiagramComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SankeyDiagramComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

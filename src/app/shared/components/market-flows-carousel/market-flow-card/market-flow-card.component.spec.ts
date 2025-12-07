import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MarketFlowCardComponent } from './market-flow-card.component';

describe('MarketFlowCardComponent', () => {
  let component: MarketFlowCardComponent;
  let fixture: ComponentFixture<MarketFlowCardComponent>;

  const mockCard = {
    id: '1',
    title: 'Test Card',
    value: '$100B',
    valueColor: 'green' as const,
    percentageChange: '+10%',
    percentageColor: 'green' as const,
    metricLabel: 'AUM',
    aiConfidence: 'high' as const,
    description: 'Test description',
    chartColor: 'green' as const,
    borderColor: '#00bc7d'
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MarketFlowCardComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(MarketFlowCardComponent);
    component = fixture.componentInstance;
    component.card = mockCard;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display card title', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.card-title')?.textContent).toContain('Test Card');
  });

  it('should emit download event when download button clicked', () => {
    spyOn(component.download, 'emit');
    component.onDownload();
    expect(component.download.emit).toHaveBeenCalledWith('1');
  });

  it('should emit moreOptions event when more options button clicked', () => {
    spyOn(component.moreOptions, 'emit');
    component.onMoreOptions();
    expect(component.moreOptions.emit).toHaveBeenCalledWith('1');
  });

  it('should emit askMarketSense event when ask button clicked', () => {
    spyOn(component.askMarketSense, 'emit');
    component.onAskMarketSense();
    expect(component.askMarketSense.emit).toHaveBeenCalledWith('1');
  });

  it('should return correct confidence color', () => {
    expect(component.getConfidenceColor('high')).toBe('#00bc7d');
    expect(component.getConfidenceColor('medium')).toBe('#fe9a00');
    expect(component.getConfidenceColor('low')).toBe('#d4183d');
  });
});


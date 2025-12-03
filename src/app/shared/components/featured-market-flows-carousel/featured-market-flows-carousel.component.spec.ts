import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FeaturedMarketFlowsCarouselComponent } from './featured-market-flows-carousel.component';

describe('FeaturedMarketFlowsCarouselComponent', () => {
  let component: FeaturedMarketFlowsCarouselComponent;
  let fixture: ComponentFixture<FeaturedMarketFlowsCarouselComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeaturedMarketFlowsCarouselComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(FeaturedMarketFlowsCarouselComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with default values', () => {
    expect(component.dataType).toBe('historical');
    expect(component.selectedTimeHorizon).toBe('+9 mo');
    expect(component.currentSlideIndex).toBe(0);
  });

  it('should change data type', () => {
    component.setDataType('forecasted');
    expect(component.dataType).toBe('forecasted');
  });

  it('should change time horizon', () => {
    component.setTimeHorizon('+12 mo');
    expect(component.selectedTimeHorizon).toBe('+12 mo');
  });

  it('should navigate slides correctly', () => {
    component.cards = new Array(9).fill({}).map((_, i) => ({
      id: `card-${i}`,
      title: `Card ${i}`,
      value: '$100B',
      valueColor: 'green' as const,
      percentageChange: '+10%',
      percentageColor: 'green' as const,
      metricLabel: 'AUM',
      aiConfidence: 'high' as const,
      description: 'Test description',
      chartColor: 'green' as const,
      borderColor: '#00bc7d'
    }));

    expect(component.currentSlideIndex).toBe(0);
    
    component.nextSlide();
    expect(component.currentSlideIndex).toBe(1);
    
    component.previousSlide();
    expect(component.currentSlideIndex).toBe(0);
  });

  it('should calculate total slides correctly', () => {
    component.cards = new Array(7).fill({});
    expect(component.totalSlides).toBe(3); // 7 cards / 3 per slide = 3 slides
  });

  it('should return visible cards for current slide', () => {
    component.cards = new Array(9).fill({}).map((_, i) => ({
      id: `card-${i}`,
      title: `Card ${i}`,
      value: '$100B',
      valueColor: 'green' as const,
      percentageChange: '+10%',
      percentageColor: 'green' as const,
      metricLabel: 'AUM',
      aiConfidence: 'high' as const,
      description: 'Test description',
      chartColor: 'green' as const,
      borderColor: '#00bc7d'
    }));

    expect(component.visibleCards.length).toBe(3);
    expect(component.visibleCards[0].id).toBe('card-0');
    
    component.nextSlide();
    expect(component.visibleCards[0].id).toBe('card-3');
  });
});


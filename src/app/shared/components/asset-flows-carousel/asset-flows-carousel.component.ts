import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AssetFlowCardComponent, type AssetFlowCard } from './asset-flow-card/asset-flow-card.component';

// Re-export for convenience
export type { AssetFlowCard } from './asset-flow-card/asset-flow-card.component';

@Component({
  selector: 'app-asset-flows-carousel',
  standalone: true,
  imports: [CommonModule, AssetFlowCardComponent],
  templateUrl: './asset-flows-carousel.component.html',
  styleUrl: './asset-flows-carousel.component.scss'
})
export class AssetFlowsCarouselComponent implements OnInit {
  @Input() cards: AssetFlowCard[] = [];
  @Input() title: string = 'Asset Flows';
  
  currentSlideIndex: number = 0;
  cardsPerSlide = 3;
  selectedTimeframe: string = '7d';
  selectedAssetType: string = 'all';
  
  timeframes = ['24h', '7d', '30d', '90d', '1y'];
  assetTypes = ['all', 'Equity', 'Fixed Income', 'Commodities', 'Real Estate', 'Crypto'];
  
  ngOnInit() {
    this.updateCardsPerSlide();
    this.setupResponsiveListener();
  }
  
  get filteredCards(): AssetFlowCard[] {
    return this.cards.filter(card => {
      const matchesTimeframe = card.timeframe === this.selectedTimeframe;
      const matchesAssetType = this.selectedAssetType === 'all' || card.assetType === this.selectedAssetType;
      return matchesTimeframe && matchesAssetType;
    });
  }
  
  get totalSlides(): number {
    return Math.ceil(this.filteredCards.length / this.cardsPerSlide);
  }
  
  get visibleCards(): AssetFlowCard[] {
    const startIndex = this.currentSlideIndex * this.cardsPerSlide;
    return this.filteredCards.slice(startIndex, startIndex + this.cardsPerSlide);
  }
  
  setTimeframe(timeframe: string): void {
    this.selectedTimeframe = timeframe;
    this.currentSlideIndex = 0;
  }
  
  setAssetType(assetType: string): void {
    this.selectedAssetType = assetType;
    this.currentSlideIndex = 0;
  }
  
  previousSlide(): void {
    if (this.currentSlideIndex > 0) {
      this.currentSlideIndex--;
    }
  }
  
  nextSlide(): void {
    if (this.currentSlideIndex < this.totalSlides - 1) {
      this.currentSlideIndex++;
    }
  }
  
  goToSlide(index: number): void {
    if (index >= 0 && index < this.totalSlides) {
      this.currentSlideIndex = index;
    }
  }
  
  onViewDetails(cardId: string): void {
    console.log('View details clicked for asset:', cardId);
    // TODO: Navigate to asset detail page or open modal
  }
  
  onDownload(cardId: string): void {
    console.log('Download clicked for asset:', cardId);
    // TODO: Implement download functionality
  }
  
  onMoreOptions(cardId: string): void {
    console.log('More options clicked for asset:', cardId);
    // TODO: Show options menu
  }
  
  onViewAll(): void {
    console.log('View all asset flows clicked');
    // TODO: Navigate to full asset flows page
  }
  
  private updateCardsPerSlide(): void {
    if (typeof window !== 'undefined') {
      const width = window.innerWidth;
      if (width < 768) {
        this.cardsPerSlide = 1;
      } else if (width < 1200) {
        this.cardsPerSlide = 2;
      } else {
        this.cardsPerSlide = 3;
      }
    }
  }
  
  private setupResponsiveListener(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => {
        this.updateCardsPerSlide();
      });
    }
  }
}

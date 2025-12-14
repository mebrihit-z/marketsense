import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FiltersBarComponent } from '../../shared/components/filters/filters-bar/filters-bar.component';
import { FeaturedMarketFlowsCarouselComponent } from '../../shared/components/market-flows-carousel/market-flows-carousel.component';
import { MarketFlowCard } from '../../shared/components/market-flows-carousel/market-flow-card/market-flow-card.component';
import { AssetFlowsComponent } from '../../shared/components/asset-flows/asset-flows.component';
import { AssetAllocationComponent } from '../../shared/components/asset-allocation/asset-allocation.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FiltersBarComponent, FeaturedMarketFlowsCarouselComponent, AssetFlowsComponent, AssetAllocationComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  carouselDataType: 'historical' | 'forecasted' = 'historical';
  carouselTimeHorizon: string = '-9 mo';
  selectedProductSubTypes: string[] = [];
  selectedProductTypes: string[] = [];
  selectedProductRegions: string[] = [];
  pinnedCardIds: string[] = [];

  marketFlowCards: MarketFlowCard[] = [
    // Historical -3 mo
    {
      id: 'hist-3-1',
      title: 'Real Estate Headwinds',
      value: '-$2.8B',
      valueColor: 'red',
      percentageChange: '-2.3%',
      percentageColor: 'red',
      metricLabel: 'Net Outflow',
      aiConfidence: 'high',
      description: 'Commercial real estate showing early signs of pressure from rising interest rates.',
      chartColor: 'red',
      borderColor: '#fb2c36',
      timeHorizon: '-3 mo',
      dataType: 'historical'
    },
    {
      id: 'hist-3-2',
      title: 'Private Equity Momentum',
      value: '$42.1B',
      valueColor: 'green',
      percentageChange: '+4.2%',
      percentageColor: 'green',
      metricLabel: 'AUM',
      aiConfidence: 'high',
      description: 'PE funds attracting steady institutional capital over the past quarter.',
      chartColor: 'green',
      borderColor: '#00bc7d',
      timeHorizon: '-3 mo',
      dataType: 'historical'
    },
    {
      id: 'hist-3-3',
      title: 'Fixed Income Growth',
      value: '$1.2B',
      valueColor: 'green',
      percentageChange: '+0.8%',
      percentageColor: 'green',
      metricLabel: 'Net Flow',
      aiConfidence: 'medium',
      description: 'Modest inflows as investors seek stability in uncertain market conditions.',
      chartColor: 'green',
      borderColor: '#00bc7d',
      timeHorizon: '-3 mo',
      dataType: 'historical'
    },
    
    // Historical -6 mo
    {
      id: 'hist-6-1',
      title: 'Real Estate Headwinds',
      value: '-$4.5B',
      valueColor: 'red',
      percentageChange: '-3.7%',
      percentageColor: 'red',
      metricLabel: 'Net Outflow',
      aiConfidence: 'high',
      description: 'Commercial real estate facing growing pressure from elevated interest rates.',
      chartColor: 'red',
      borderColor: '#fb2c36',
      timeHorizon: '-6 mo',
      dataType: 'historical'
    },
    {
      id: 'hist-6-2',
      title: 'Private Equity Surge',
      value: '$78.3B',
      valueColor: 'green',
      percentageChange: '+7.8%',
      percentageColor: 'green',
      metricLabel: 'AUM',
      aiConfidence: 'high',
      description: 'Strong inflows into PE funds over the past six months.',
      chartColor: 'green',
      borderColor: '#00bc7d',
      timeHorizon: '-6 mo',
      dataType: 'historical'
    },
    {
      id: 'hist-6-3',
      title: 'Fixed Income Stability',
      value: '$2.1B',
      valueColor: 'green',
      percentageChange: '+1.3%',
      percentageColor: 'green',
      metricLabel: 'Net Flow',
      aiConfidence: 'medium',
      description: 'Steady bond market flows as rates stabilized in recent months.',
      chartColor: 'green',
      borderColor: '#00bc7d',
      timeHorizon: '-6 mo',
      dataType: 'historical'
    },
    
    // Historical -9 mo (default)
    {
      id: 'hist-9-1',
      title: 'Real Estate Headwinds',
      value: '-$8.2B',
      valueColor: 'red',
      percentageChange: '-6.8%',
      percentageColor: 'red',
      metricLabel: 'Net Outflow',
      aiConfidence: 'high',
      description: 'Commercial real estate facing pressure from elevated interest rates and hybrid work trends reducing office space demand.',
      chartColor: 'red',
      borderColor: '#fb2c36',
      timeHorizon: '-9 mo',
      dataType: 'historical'
    },
    {
      id: 'hist-9-2',
      title: 'Private Equity Surge',
      value: '$124.8B',
      valueColor: 'green',
      percentageChange: '+12.3%',
      percentageColor: 'green',
      metricLabel: 'AUM',
      aiConfidence: 'high',
      description: 'Strong institutional inflows into PE funds driven by high-net-worth investors seeking alternative assets amid equity market volatility.',
      chartColor: 'green',
      borderColor: '#00bc7d',
      timeHorizon: '-9 mo',
      dataType: 'historical'
    },
    {
      id: 'hist-9-3',
      title: 'Fixed Income Stability',
      value: '$3.4B',
      valueColor: 'green',
      percentageChange: '+2.1%',
      percentageColor: 'green',
      metricLabel: 'Net Flow',
      aiConfidence: 'medium',
      description: 'Duration positioning shifting as market anticipates potential rate cuts in late 2025, though timing remains uncertain.',
      chartColor: 'green',
      borderColor: '#00bc7d',
      timeHorizon: '-9 mo',
      dataType: 'historical'
    },
    {
      id: 'hist-9-4',
      title: 'Global Equities Performance',
      value: '$45.2B',
      valueColor: 'green',
      percentageChange: '+3.1%',
      percentageColor: 'green',
      metricLabel: 'Net Flow',
      aiConfidence: 'high',
      description: 'Developed markets showing resilience as inflation concerns gradually ease.',
      chartColor: 'green',
      borderColor: '#00bc7d',
      timeHorizon: '-9 mo',
      dataType: 'historical'
    },
    {
      id: 'hist-9-5',
      title: 'Emerging Markets Caution',
      value: '-$6.3B',
      valueColor: 'red',
      percentageChange: '-5.1%',
      percentageColor: 'red',
      metricLabel: 'Net Flow',
      aiConfidence: 'high',
      description: 'Moderate outflows as investors assess geopolitical risks.',
      chartColor: 'red',
      borderColor: '#fb2c36',
      timeHorizon: '-9 mo',
      dataType: 'historical'
    },
    
    // Historical -12 mo
    {
      id: 'hist-12-1',
      title: 'Real Estate Headwinds',
      value: '-$11.5B',
      valueColor: 'red',
      percentageChange: '-9.2%',
      percentageColor: 'red',
      metricLabel: 'Net Outflow',
      aiConfidence: 'high',
      description: 'Year-long pressure on commercial real estate from structural market shifts.',
      chartColor: 'red',
      borderColor: '#fb2c36',
      timeHorizon: '-12 mo',
      dataType: 'historical'
    },
    {
      id: 'hist-12-2',
      title: 'Private Equity Growth',
      value: '$156.7B',
      valueColor: 'green',
      percentageChange: '+15.1%',
      percentageColor: 'green',
      metricLabel: 'AUM',
      aiConfidence: 'high',
      description: 'Full year of strong PE performance attracting major institutional investors.',
      chartColor: 'green',
      borderColor: '#00bc7d',
      timeHorizon: '-12 mo',
      dataType: 'historical'
    },
    {
      id: 'hist-12-3',
      title: 'Fixed Income Trends',
      value: '$4.8B',
      valueColor: 'green',
      percentageChange: '+2.9%',
      percentageColor: 'green',
      metricLabel: 'Net Flow',
      aiConfidence: 'medium',
      description: 'Annual bond flows reflect investor preference for income stability.',
      chartColor: 'green',
      borderColor: '#00bc7d',
      timeHorizon: '-12 mo',
      dataType: 'historical'
    },
    
    // Historical -18 mo
    {
      id: 'hist-18-1',
      title: 'Real Estate Decline',
      value: '-$15.3B',
      valueColor: 'red',
      percentageChange: '-12.1%',
      percentageColor: 'red',
      metricLabel: 'Net Outflow',
      aiConfidence: 'high',
      description: 'Extended period of weakness in commercial real estate sector.',
      chartColor: 'red',
      borderColor: '#fb2c36',
      timeHorizon: '-18 mo',
      dataType: 'historical'
    },
    {
      id: 'hist-18-2',
      title: 'Private Equity Leadership',
      value: '$198.9B',
      valueColor: 'green',
      percentageChange: '+18.7%',
      percentageColor: 'green',
      metricLabel: 'AUM',
      aiConfidence: 'high',
      description: 'Sustained PE growth over 18 months demonstrates strong alternative asset appetite.',
      chartColor: 'green',
      borderColor: '#00bc7d',
      timeHorizon: '-18 mo',
      dataType: 'historical'
    },
    {
      id: 'hist-18-3',
      title: 'Fixed Income Evolution',
      value: '$6.2B',
      valueColor: 'green',
      percentageChange: '+3.7%',
      percentageColor: 'green',
      metricLabel: 'Net Flow',
      aiConfidence: 'medium',
      description: 'Long-term fixed income trends show consistent investor demand for bonds.',
      chartColor: 'green',
      borderColor: '#00bc7d',
      timeHorizon: '-18 mo',
      dataType: 'historical'
    },
    
    // Forecasted +3 mo
    {
      id: 'fore-3-1',
      title: 'Real Estate Outlook',
      value: '-$2.5B',
      valueColor: 'red',
      percentageChange: '-2.0%',
      percentageColor: 'red',
      metricLabel: 'Projected Outflow',
      aiConfidence: 'medium',
      description: 'Near-term forecast suggests continued but moderating pressure on commercial real estate.',
      chartColor: 'red',
      borderColor: '#fb2c36',
      timeHorizon: '+3 mo',
      dataType: 'forecasted'
    },
    {
      id: 'fore-3-2',
      title: 'Private Equity Projection',
      value: '$38.2B',
      valueColor: 'green',
      percentageChange: '+3.8%',
      percentageColor: 'green',
      metricLabel: 'Projected AUM',
      aiConfidence: 'high',
      description: 'PE funds expected to maintain momentum in the coming quarter.',
      chartColor: 'green',
      borderColor: '#00bc7d',
      timeHorizon: '+3 mo',
      dataType: 'forecasted'
    },
    {
      id: 'fore-3-3',
      title: 'Fixed Income Forecast',
      value: '$1.8B',
      valueColor: 'green',
      percentageChange: '+1.1%',
      percentageColor: 'green',
      metricLabel: 'Projected Flow',
      aiConfidence: 'medium',
      description: 'Moderate bond inflows anticipated as rate environment stabilizes.',
      chartColor: 'green',
      borderColor: '#00bc7d',
      timeHorizon: '+3 mo',
      dataType: 'forecasted'
    },
    
    // Forecasted +6 mo
    {
      id: 'fore-6-1',
      title: 'Real Estate Recovery',
      value: '-$1.2B',
      valueColor: 'red',
      percentageChange: '-0.9%',
      percentageColor: 'red',
      metricLabel: 'Projected Outflow',
      aiConfidence: 'medium',
      description: 'Six-month outlook shows potential stabilization in commercial real estate.',
      chartColor: 'red',
      borderColor: '#fb2c36',
      timeHorizon: '+6 mo',
      dataType: 'forecasted'
    },
    {
      id: 'fore-6-2',
      title: 'Private Equity Expansion',
      value: '$82.4B',
      valueColor: 'green',
      percentageChange: '+8.2%',
      percentageColor: 'green',
      metricLabel: 'Projected AUM',
      aiConfidence: 'high',
      description: 'Continued strong PE performance expected through mid-2026.',
      chartColor: 'green',
      borderColor: '#00bc7d',
      timeHorizon: '+6 mo',
      dataType: 'forecasted'
    },
    {
      id: 'fore-6-3',
      title: 'Fixed Income Strength',
      value: '$3.9B',
      valueColor: 'green',
      percentageChange: '+2.4%',
      percentageColor: 'green',
      metricLabel: 'Projected Flow',
      aiConfidence: 'high',
      description: 'Rate stabilization expected to drive increased bond allocations.',
      chartColor: 'green',
      borderColor: '#00bc7d',
      timeHorizon: '+6 mo',
      dataType: 'forecasted'
    },
    
    // Forecasted +9 mo
    {
      id: 'fore-9-1',
      title: 'Real Estate Stabilization',
      value: '$0.8B',
      valueColor: 'green',
      percentageChange: '+0.6%',
      percentageColor: 'green',
      metricLabel: 'Projected Inflow',
      aiConfidence: 'low',
      description: 'Long-term forecast suggests potential reversal to positive flows in commercial real estate.',
      chartColor: 'green',
      borderColor: '#00bc7d',
      timeHorizon: '+9 mo',
      dataType: 'forecasted'
    },
    {
      id: 'fore-9-2',
      title: 'Private Equity Peak',
      value: '$135.6B',
      valueColor: 'green',
      percentageChange: '+13.4%',
      percentageColor: 'green',
      metricLabel: 'Projected AUM',
      aiConfidence: 'medium',
      description: 'PE growth trajectory expected to continue through late 2026.',
      chartColor: 'green',
      borderColor: '#00bc7d',
      timeHorizon: '+9 mo',
      dataType: 'forecasted'
    },
    {
      id: 'fore-9-3',
      title: 'Fixed Income Momentum',
      value: '$5.7B',
      valueColor: 'green',
      percentageChange: '+3.5%',
      percentageColor: 'green',
      metricLabel: 'Projected Flow',
      aiConfidence: 'medium',
      description: 'Nine-month outlook shows sustained investor interest in fixed income.',
      chartColor: 'green',
      borderColor: '#00bc7d',
      timeHorizon: '+9 mo',
      dataType: 'forecasted'
    },
    {
      id: 'fore-9-4',
      title: 'Global Equities Rebound',
      value: '$98.4B',
      valueColor: 'green',
      percentageChange: '+4.6%',
      percentageColor: 'green',
      metricLabel: 'Projected Flow',
      aiConfidence: 'high',
      description: 'Renewed optimism in developed markets as easing inflation supports higher equity valuations.',
      chartColor: 'green',
      borderColor: '#00bc7d',
      timeHorizon: '+9 mo',
      dataType: 'forecasted'
    },
    {
      id: 'fore-9-5',
      title: 'Emerging Markets Watch',
      value: '-$4.1B',
      valueColor: 'red',
      percentageChange: '-3.2%',
      percentageColor: 'red',
      metricLabel: 'Projected Flow',
      aiConfidence: 'low',
      description: 'Emerging markets may see reduced outflows as global conditions improve.',
      chartColor: 'red',
      borderColor: '#fb2c36',
      timeHorizon: '+9 mo',
      dataType: 'forecasted'
    },
    
    // Forecasted +12 mo
    {
      id: 'fore-12-1',
      title: 'Real Estate Revival',
      value: '$3.2B',
      valueColor: 'green',
      percentageChange: '+2.4%',
      percentageColor: 'green',
      metricLabel: 'Projected Inflow',
      aiConfidence: 'low',
      description: 'Year-ahead projection shows potential turnaround in commercial real estate fundamentals.',
      chartColor: 'green',
      borderColor: '#00bc7d',
      timeHorizon: '+12 mo',
      dataType: 'forecasted'
    },
    {
      id: 'fore-12-2',
      title: 'Private Equity Dominance',
      value: '$178.3B',
      valueColor: 'green',
      percentageChange: '+17.2%',
      percentageColor: 'green',
      metricLabel: 'Projected AUM',
      aiConfidence: 'medium',
      description: 'Full-year PE forecast remains bullish on alternative asset allocations.',
      chartColor: 'green',
      borderColor: '#00bc7d',
      timeHorizon: '+12 mo',
      dataType: 'forecasted'
    },
    {
      id: 'fore-12-3',
      title: 'Fixed Income Outlook',
      value: '$7.8B',
      valueColor: 'green',
      percentageChange: '+4.7%',
      percentageColor: 'green',
      metricLabel: 'Projected Flow',
      aiConfidence: 'high',
      description: 'Annual bond market forecast shows strong institutional demand.',
      chartColor: 'green',
      borderColor: '#00bc7d',
      timeHorizon: '+12 mo',
      dataType: 'forecasted'
    },
    
    // Forecasted +18 mo
    {
      id: 'fore-18-1',
      title: 'Real Estate Transformation',
      value: '$6.8B',
      valueColor: 'green',
      percentageChange: '+5.1%',
      percentageColor: 'green',
      metricLabel: 'Projected Inflow',
      aiConfidence: 'low',
      description: 'Extended forecast suggests significant recovery in commercial real estate sector.',
      chartColor: 'green',
      borderColor: '#00bc7d',
      timeHorizon: '+18 mo',
      dataType: 'forecasted'
    },
    {
      id: 'fore-18-2',
      title: 'Private Equity Evolution',
      value: '$234.7B',
      valueColor: 'green',
      percentageChange: '+22.5%',
      percentageColor: 'green',
      metricLabel: 'Projected AUM',
      aiConfidence: 'medium',
      description: '18-month PE outlook remains highly favorable for institutional allocations.',
      chartColor: 'green',
      borderColor: '#00bc7d',
      timeHorizon: '+18 mo',
      dataType: 'forecasted'
    },
    {
      id: 'fore-18-3',
      title: 'Fixed Income Future',
      value: '$10.4B',
      valueColor: 'green',
      percentageChange: '+6.3%',
      percentageColor: 'green',
      metricLabel: 'Projected Flow',
      aiConfidence: 'medium',
      description: 'Long-term fixed income projections show sustained growth in bond allocations.',
      chartColor: 'green',
      borderColor: '#00bc7d',
      timeHorizon: '+18 mo',
      dataType: 'forecasted'
    },
  ];

  ngOnInit(): void {
    console.log('Dashboard component initialized');
  }

  onDataTypeChange(dataType: 'historical' | 'forecasted'): void {
    this.carouselDataType = dataType;
  }

  onTimeHorizonChange(timeHorizon: string): void {
    this.carouselTimeHorizon = timeHorizon;
  }

  onProductSubTypeChange(productSubTypes: string[]): void {
    this.selectedProductSubTypes = productSubTypes;
  }

  onProductTypeChange(productTypes: string[]): void {
    this.selectedProductTypes = productTypes;
  }

  onProductRegionChange(productRegions: string[]): void {
    this.selectedProductRegions = productRegions;
  }

  onPinCard(cardId: string): void {
    // If card is already pinned, unpin it; otherwise, pin it
    const index = this.pinnedCardIds.indexOf(cardId);
    if (index > -1) {
      // Unpin: remove from pinned list
      this.pinnedCardIds.splice(index, 1);
    } else {
      // Pin: add to the beginning of pinned list
      this.pinnedCardIds.unshift(cardId);
    }
  }

  get filteredMarketFlowCards(): MarketFlowCard[] {
    // If no product sub-types selected, return empty array
    if (!this.selectedProductSubTypes || this.selectedProductSubTypes.length === 0) {
      return [];
    }

    // Generate cards dynamically based on selected product sub-types
    const cards = this.selectedProductSubTypes.map((subType, index) => {
      // Find a matching card from existing data for the same timeHorizon and dataType, or create a default one
      const matchingCard = this.marketFlowCards.find(
        card => card.timeHorizon === this.carouselTimeHorizon && 
                card.dataType === this.carouselDataType
      );

      // Use matching card as template, or create default values
      const baseCard = matchingCard || {
        id: '',
        title: '',
        value: '$0B',
        valueColor: 'green' as const,
        percentageChange: '0%',
        percentageColor: 'green' as const,
        metricLabel: 'Net Flow',
        aiConfidence: 'medium' as const,
        description: '',
        chartColor: 'green' as const,
        borderColor: '#00bc7d',
        timeHorizon: this.carouselTimeHorizon,
        dataType: this.carouselDataType
      };

      return {
        ...baseCard,
        id: `${this.carouselDataType}-${this.carouselTimeHorizon.replace(/\s/g, '')}-${subType.replace(/\s/g, '-')}-${index}`,
        title: subType,
        productSubType: subType
      };
    });

    // Sort cards: pinned cards first (in order of pinning), then others
    return cards.sort((a, b) => {
      const aPinIndex = this.pinnedCardIds.indexOf(a.id);
      const bPinIndex = this.pinnedCardIds.indexOf(b.id);
      
      // Both pinned: maintain pin order (lower index = pinned earlier = appears first)
      if (aPinIndex > -1 && bPinIndex > -1) {
        return aPinIndex - bPinIndex;
      }
      // Only a is pinned: a comes first
      if (aPinIndex > -1) return -1;
      // Only b is pinned: b comes first
      if (bPinIndex > -1) return 1;
      // Neither pinned: maintain original order
      return 0;
    });
  }

}


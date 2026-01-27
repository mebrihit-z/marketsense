/* eslint-disable */
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FiltersBarComponent, type FilterOptionTotals } from '../../shared/components/filters/filters-bar/filters-bar.component';
import { FeaturedMarketFlowsCarouselComponent } from '../../shared/components/market-flows-carousel/market-flows-carousel.component';
import { MarketFlowCard } from '../../shared/components/market-flows-carousel/market-flow-card/market-flow-card.component';
import { AssetFlowsComponent } from '../../shared/components/asset-flows/asset-flows.component';
import { AssetAllocationComponent } from '../../shared/components/asset-allocation/asset-allocation.component';
import HeaderComponent from '../../shared/components/header/header.component';
import { WelcomeSectionComponent } from '../../shared/components/welcome-section/welcome-section.component';
import { type AssetFlowRecord } from '../../shared/utils/asset-flows-to-sankey.util';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [HeaderComponent, CommonModule, FiltersBarComponent, FeaturedMarketFlowsCarouselComponent, AssetFlowsComponent, AssetAllocationComponent, WelcomeSectionComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export default class DashboardComponent implements OnInit {
  carouselDataType: 'historical' | 'forecasted' = 'forecasted';
  carouselTimeHorizon: string = 'Today';
  timeHorizonRange: { start: string; end: string } | null = null;
  selectedProductSubTypes: string[] = [];
  selectedProductTypes: string[] = [];
  selectedProductRegions: string[] = [];
  selectedInvestorRegions: string[] = [];
  selectedInvestorTypes: string[] = [];
  filterOptionTotals: FilterOptionTotals = {
    productTypeTotal: 0,
    productSubTypeTotal: 0,
    investorRegionTotal: 0,
    investorTypeTotal: 0,
    productRegionTotal: 0
  };
  pinnedCardIds: string[] = [];
  isAssetAllocationPinned: boolean = false;
  isAssetFlowsPinned: boolean = false;

  // Raw asset flows data
  rawAssetFlowsData: AssetFlowRecord[] = [];

  constructor(private cdr: ChangeDetectorRef, private http: HttpClient) {}

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
    {
      id: 'hist-9-5',
      title: 'Mid Cap Growth',
      value: '+$6.3B',
      valueColor: 'green',
      percentageChange: '+5.1%',
      percentageColor: 'green',
      metricLabel: 'Net Flow',
      aiConfidence: 'high',
      description: 'Mid cap growth showing strong inflows as investors seek growth opportunities.',
      chartColor: 'green',
      borderColor: '#00bc7d',
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
    
    // Forecasted Today
    {
      id: 'fore-today-1',
      title: 'Real Estate Current State',
      value: '-$1.8B',
      valueColor: 'red',
      percentageChange: '-1.4%',
      percentageColor: 'red',
      metricLabel: 'Current Outflow',
      aiConfidence: 'high',
      description: 'Current market conditions show ongoing pressure on commercial real estate with signs of stabilization ahead.',
      chartColor: 'red',
      borderColor: '#fb2c36',
      timeHorizon: 'Today',
      dataType: 'forecasted'
    },
    {
      id: 'fore-today-2',
      title: 'Private Equity Current Momentum',
      value: '$35.6B',
      valueColor: 'green',
      percentageChange: '+3.5%',
      percentageColor: 'green',
      metricLabel: 'Current AUM',
      aiConfidence: 'high',
      description: 'PE funds maintaining strong current performance with continued institutional interest.',
      chartColor: 'green',
      borderColor: '#00bc7d',
      timeHorizon: 'Today',
      dataType: 'forecasted'
    },
    {
      id: 'fore-today-3',
      title: 'Fixed Income Current Trends',
      value: '$1.5B',
      valueColor: 'green',
      percentageChange: '+0.9%',
      percentageColor: 'green',
      metricLabel: 'Current Flow',
      aiConfidence: 'medium',
      description: 'Current bond market showing steady inflows as investors position for rate stability.',
      chartColor: 'green',
      borderColor: '#00bc7d',
      timeHorizon: 'Today',
      dataType: 'forecasted'
    },
    {
      id: 'fore-today-4',
      title: 'Global Equities Current View',
      value: '$52.8B',
      valueColor: 'green',
      percentageChange: '+3.8%',
      percentageColor: 'green',
      metricLabel: 'Current Flow',
      aiConfidence: 'high',
      description: 'Current equity markets showing resilience with positive momentum in developed markets.',
      chartColor: 'green',
      borderColor: '#00bc7d',
      timeHorizon: 'Today',
      dataType: 'forecasted'
    },
    {
      id: 'fore-today-5',
      title: 'Emerging Markets Current Status',
      value: '$12.4B',
      valueColor: 'green',
      percentageChange: '+2.1%',
      percentageColor: 'green',
      metricLabel: 'Current Flow',
      aiConfidence: 'medium',
      description: 'Current emerging markets showing positive momentum as global conditions improve.',
      chartColor: 'green',
      borderColor: '#00bc7d',
      timeHorizon: 'Today',
      dataType: 'forecasted'
    },
    {
      id: 'fore-today-6',
      title: 'Cash Allocation Current',
      value: '$8.4B',
      valueColor: 'green',
      percentageChange: '+2.1%',
      percentageColor: 'green',
      metricLabel: 'Current Flow',
      aiConfidence: 'medium',
      description: 'Current cash allocations showing increased interest as investors seek liquidity and safety.',
      chartColor: 'green',
      borderColor: '#00bc7d',
      timeHorizon: 'Today',
      dataType: 'forecasted'
    },
    {
      id: 'fore-today-7',
      title: 'Alternatives Current Performance',
      value: '$28.5B',
      valueColor: 'green',
      percentageChange: '+2.8%',
      percentageColor: 'green',
      metricLabel: 'Current Flow',
      aiConfidence: 'high',
      description: 'Current alternative investments showing strong performance, particularly in hedge funds and commodities.',
      chartColor: 'green',
      borderColor: '#00bc7d',
      timeHorizon: 'Today',
      dataType: 'forecasted'
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
      description: 'Small-cap equities see renewed investor appetite as easing inflation and improving earnings expectations support risk-on positioning in the U.S. domestic market.',
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
    {
      id: 'fore-9-5',
      title: 'Mid Cap Growth',
      value: '+$4.1B',
      valueColor: 'green',
      percentageChange: '+3.2%',
      percentageColor: 'green',
      metricLabel: 'Projected Flow',
      aiConfidence: 'low',
      description: 'Mid cap growth showing strong inflows as investors seek growth opportunities.',
      chartColor: 'green',
      borderColor: '#00bc7d',
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
    {
      id: 'fore-12-4',
      title: 'Municipal Bond Concerns',
      value: '-$3.5B',
      valueColor: 'red',
      percentageChange: '-2.8%',
      percentageColor: 'red',
      metricLabel: 'Projected Outflow',
      aiConfidence: 'medium',
      description: 'Municipal bonds facing headwinds as state and local government finances come under scrutiny.',
      chartColor: 'red',
      borderColor: '#fb2c36',
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
    {
      id: 'fore-18-4',
      title: 'Short Duration Pressure',
      value: '-$5.2B',
      valueColor: 'red',
      percentageChange: '-4.1%',
      percentageColor: 'red',
      metricLabel: 'Projected Outflow',
      aiConfidence: 'medium',
      description: 'Short duration bonds expected to face continued outflows as investors extend duration in search of yield.',
      chartColor: 'red',
      borderColor: '#fb2c36',
      timeHorizon: '+18 mo',
      dataType: 'forecasted'
    },
  ];

  ngOnInit(): void {
    console.log('Dashboard component initialized');
    this.loadAssetFlowsData();
  }

  private loadAssetFlowsData(): void {
    this.http.get<AssetFlowRecord[]>('assets/data/asset-flows-data.json').subscribe({
      next: (data) => {
        this.rawAssetFlowsData = data;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error loading asset flows data:', error);
      }
    });
  }

  onDataTypeChange(dataType: 'historical' | 'forecasted'): void {
    this.carouselDataType = dataType;
    // Clean up pinned card IDs when data type changes (card IDs include data type)
    this.cleanupPinnedCardIds();
  }

  onTimeHorizonChange(timeHorizon: string): void {
    this.carouselTimeHorizon = timeHorizon;
    // Clean up pinned card IDs when time horizon changes (card IDs include time horizon)
    this.cleanupPinnedCardIds();
  }

  onTimeHorizonRangeChange(range: { start: string; end: string }): void {
    this.timeHorizonRange = range;
    // Also update the carousel time horizon to the end value for backward compatibility
    this.carouselTimeHorizon = range.end;
  }
  
  /**
   * Removes pinned card IDs that are no longer valid
   * (cards whose product sub-types were deselected, or data type/time horizon changed)
   */
  private cleanupPinnedCardIds(): void {
    if (this.pinnedCardIds.length > 0) {
      const validCardIds = this.getValidCardIds();
      this.pinnedCardIds = this.pinnedCardIds.filter(id => validCardIds.includes(id));
    }
  }

  onProductSubTypeChange(productSubTypes: string[]): void {
    this.selectedProductSubTypes = productSubTypes;
    // Clean up pinned card IDs for cards that no longer exist
    // This happens when product sub-types are deselected
    this.cleanupPinnedCardIds();
  }

  /**
   * Generates the card IDs that would exist based on current selected product sub-types
   * Used for cleaning up pinned card IDs when sub-types are deselected
   */
  private getValidCardIds(): string[] {
    if (!this.selectedProductSubTypes || this.selectedProductSubTypes.length === 0) {
      return [];
    }

    return this.selectedProductSubTypes.map((subType) => {
      return `${this.carouselDataType}-${this.carouselTimeHorizon.replace(/\s/g, '')}-${subType.replace(/\s/g, '-').replace(/\//g, '-')}`;
    });
  }

  onProductTypeChange(productTypes: string[]): void {
    this.selectedProductTypes = productTypes;
  }

  onProductRegionChange(productRegions: string[]): void {
    this.selectedProductRegions = productRegions;
  }

  onInvestorRegionChange(investorRegions: string[]): void {
    this.selectedInvestorRegions = investorRegions;
  }

  onInvestorTypeChange(investorTypes: string[]): void {
    this.selectedInvestorTypes = investorTypes;
  }

  onFilterOptionTotalsChange(totals: FilterOptionTotals): void {
    this.filterOptionTotals = totals;
  }

  onAssetAllocationPinToggle(): void {
    this.isAssetAllocationPinned = !this.isAssetAllocationPinned;
  }

  onAssetFlowsPinToggle(): void {
    this.isAssetFlowsPinned = !this.isAssetFlowsPinned;
  }

  onPinCard(cardId: string): void {
    // If card is already pinned, unpin it; otherwise, pin it
    const index = this.pinnedCardIds.indexOf(cardId);
    if (index > -1) {
      // Unpin: remove from pinned list (create new array reference for change detection)
      this.pinnedCardIds = this.pinnedCardIds.filter(id => id !== cardId);
    } else {
      // Pin: add to the beginning of pinned list (create new array reference for change detection)
      this.pinnedCardIds = [cardId, ...this.pinnedCardIds];
    }
    // Force change detection to ensure the UI updates
    this.cdr.detectChanges();
  }

  get filteredMarketFlowCards(): MarketFlowCard[] {
    // If no investor regions selected, return empty array
    if (!this.selectedInvestorRegions || this.selectedInvestorRegions.length === 0) {
      return [];
    }

    // If no product sub-types selected, return empty array
    if (!this.selectedProductSubTypes || this.selectedProductSubTypes.length === 0) {
      return [];
    }

    // If no data loaded yet, return empty array
    if (!this.rawAssetFlowsData || this.rawAssetFlowsData.length === 0) {
      return [];
    }

    // Filter data by selected investor regions and product types
    // When "Global" is selected, include all investor regions and all product types (like sankey)
    let filteredData = this.rawAssetFlowsData;
    const hasGlobal = this.selectedInvestorRegions.includes('Global');
    
    // Filter by investor regions (if Global is selected, include all regions)
    if (!hasGlobal) {
      filteredData = filteredData.filter(record => 
        this.selectedInvestorRegions.includes(record.Investor_Region)
      );
    }
    
    // Filter by selected product types (if Global is selected, include all product types)
    if (!hasGlobal && this.selectedProductTypes && this.selectedProductTypes.length > 0) {
      filteredData = filteredData.filter(record => 
        this.selectedProductTypes.includes(record.Product_Type)
      );
    }

    // Filter by time horizon (date range) - use the same timeHorizonRange as sankey
    // This ensures cards and sankey use the same date filtering
    if (this.timeHorizonRange && this.timeHorizonRange.start && this.timeHorizonRange.end) {
      const startDate = this.convertTimeHorizonToDate(this.timeHorizonRange.start);
      const endDate = this.convertTimeHorizonToDate(this.timeHorizonRange.end);
      
      if (startDate && endDate) {
        filteredData = filteredData.filter(record => {
          if (!record.Asset_Flow_Date) return false;
          const recordDate = record.Asset_Flow_Date;
          return recordDate >= startDate && recordDate <= endDate;
        });
      }
    } else {
      // Fallback: use getDateRangeForTimeHorizon if timeHorizonRange is not available
      const dateRange = this.getDateRangeForTimeHorizon(this.carouselTimeHorizon, this.carouselDataType);
      if (dateRange && dateRange.start && dateRange.end && dateRange.start !== dateRange.end) {
        filteredData = filteredData.filter(record => {
          if (!record.Asset_Flow_Date) return false;
          const recordDate = record.Asset_Flow_Date;
          return recordDate >= dateRange.start && recordDate <= dateRange.end;
        });
      }
    }

    // Aggregate by product sub-type
    // VALUE CALCULATION:
    // 1. Filter records by: selected investor regions + selected product types + selected product sub-types + time horizon
    // 2. For each Product_Sub_Type, sum all Asset_Flow_Value (which are in thousands)
    // 3. Convert to billions: divide by 1,000,000
    // 4. Result: Net flow = sum of all positive values - sum of all negative values (negative values are subtracted)
    const aggregatedData = new Map<string, { total: number; count: number; positiveSum: number; negativeSum: number }>();
    
    filteredData.forEach(record => {
      if (!this.selectedProductSubTypes.includes(record.Product_Sub_Type)) {
        return; // Skip if not in selected product sub-types
      }
      
      const existing = aggregatedData.get(record.Product_Sub_Type) || { total: 0, count: 0, positiveSum: 0, negativeSum: 0 };
      // Asset_Flow_Value is in thousands, convert to billions
      // Example: 1200000 (thousands) = 1.2 billion
      const valueInBillions = record.Asset_Flow_Value / 1000000;
      
      // Handle positive and negative values explicitly
      if (valueInBillions > 0) {
        // Positive value: add to total
        existing.total += valueInBillions;
        existing.positiveSum += valueInBillions;
      } else if (valueInBillions < 0) {
        // Negative value: subtract from total (minus it)
        existing.total += valueInBillions; // Adding negative = subtracting
        existing.negativeSum += Math.abs(valueInBillions);
      }
      // If valueInBillions is 0, we don't need to do anything
      
      existing.count += 1;
      aggregatedData.set(record.Product_Sub_Type, existing);
    });

    // Calculate previous period data for percentage change
    const previousDateRange = this.getPreviousPeriodDateRange(this.carouselTimeHorizon, this.carouselDataType);
    const previousAggregatedData = new Map<string, number>();
    
    if (previousDateRange) {
      let previousData = this.rawAssetFlowsData;
      // Apply same filters as current period
      // When "Global" is selected, include all investor regions and all product types (like sankey)
      const hasGlobal = this.selectedInvestorRegions && this.selectedInvestorRegions.includes('Global');
      
      // Filter by investor regions (if Global is selected, include all regions)
      if (!hasGlobal) {
        previousData = previousData.filter(record => 
          this.selectedInvestorRegions.includes(record.Investor_Region)
        );
      }
      
      // Filter by selected product types (if Global is selected, include all product types)
      if (!hasGlobal && this.selectedProductTypes && this.selectedProductTypes.length > 0) {
        previousData = previousData.filter(record => 
          this.selectedProductTypes.includes(record.Product_Type)
        );
      }
      
      // Use same date filtering logic as current period
      const prevStartDate = this.convertTimeHorizonToDate(previousDateRange.start);
      const prevEndDate = this.convertTimeHorizonToDate(previousDateRange.end);
      
      if (prevStartDate && prevEndDate) {
        previousData = previousData.filter(record => {
          if (!record.Asset_Flow_Date) return false;
          const recordDate = record.Asset_Flow_Date;
          return recordDate >= prevStartDate && recordDate <= prevEndDate;
        });
      }

      previousData.forEach(record => {
        if (!this.selectedProductSubTypes.includes(record.Product_Sub_Type)) {
          return;
        }
        const valueInBillions = record.Asset_Flow_Value / 1000000;
        const existing = previousAggregatedData.get(record.Product_Sub_Type) || 0;
        // Handle negative values: subtract them (minus them)
        previousAggregatedData.set(record.Product_Sub_Type, existing + valueInBillions);
      });
    }

    // Generate cards from aggregated data
    // Include all selected product sub-types, even if they have no data (show as 0)
    const cards = this.selectedProductSubTypes      .map((subType) => {
        const data = aggregatedData.get(subType) || { total: 0, count: 0, positiveSum: 0, negativeSum: 0 };
        const totalValue = data.total; // Net flow (sum of all positive and negative values)
        const previousValue = previousAggregatedData.get(subType) || 0;
        
        // PERCENTAGE CHANGE CALCULATION:
        // Formula: ((current - previous) / |previous|) * 100
        // This shows the relative change from previous period
        // The sign of percentage should match the sign of the current value
        let percentageChange = 0;
        const hasPreviousData = previousDateRange !== null && previousDateRange !== undefined;
        
        if (hasPreviousData && previousValue !== 0) {
          // Standard calculation: change relative to previous period
          const change = totalValue - previousValue;
          const denominator = Math.abs(previousValue);
          const calculatedPercentage = (change / denominator) * 100;
          
          // Ensure percentage sign matches the value sign
          if (totalValue > 0) {
            percentageChange = Math.abs(calculatedPercentage);
          } else if (totalValue < 0) {
            percentageChange = -Math.abs(calculatedPercentage);
          } else {
            percentageChange = calculatedPercentage;
          }
        } else if (hasPreviousData && previousValue === 0 && totalValue !== 0) {
          // Edge case: previous was 0, now has value - show as 100% change
          percentageChange = totalValue > 0 ? 100 : -100;
        } else if (!hasPreviousData) {
          // No previous period data - cannot calculate percentage change
          percentageChange = 0;
        }
        // If both current and previous are 0, percentageChange remains 0

        const isPositive = totalValue >= 0;
        const valueColor: 'red' | 'green' = isPositive ? 'green' : 'red';
        const percentageColor: 'red' | 'green' = percentageChange >= 0 ? 'green' : 'red';
        const chartColor: 'red' | 'green' = isPositive ? 'green' : 'red';
        const borderColor = isPositive ? '#00bc7d' : '#fb2c36';

        // Generate unique ID
        const id = `${this.carouselDataType}-${this.carouselTimeHorizon.replace(/\s/g, '')}-${subType.replace(/\s/g, '-').replace(/\//g, '-')}`;

        // Format value
        const absValue = Math.abs(totalValue);
        const formattedValue = this.formatValue(absValue);

        // Format percentage
        const formattedPercentage = this.formatPercentage(Math.abs(percentageChange));

        // Determine AI confidence based on data quality
        const aiConfidence: 'high' | 'medium' | 'low' = data.count > 10 ? 'high' : data.count > 5 ? 'medium' : 'low';

        return {
          id,
          title: subType,
          value: isPositive ? `$${formattedValue}B` : `-$${formattedValue}B`,
          valueColor,
          percentageChange: percentageChange >= 0 ? `+${formattedPercentage}%` : `-${formattedPercentage}%`,
          percentageColor,
          metricLabel: 'Net Flow',
          aiConfidence,
          description: `${subType} showing ${isPositive ? 'positive' : 'negative'} market flow trends for ${this.carouselTimeHorizon}.`,
          chartColor,
          borderColor,
          timeHorizon: this.carouselTimeHorizon,
          dataType: this.carouselDataType,
          productSubType: subType
        };
      });

    // Sort cards: pinned cards first (in order of pinning), then others by absolute value
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
      
      // Neither pinned: sort by absolute value (descending - highest first)
      const aValue = this.parseValue(a.value);
      const bValue = this.parseValue(b.value);
      return Math.abs(bValue) - Math.abs(aValue);
    });
  }

  /**
   * Gets date range for a time horizon
   * @param timeHorizon - The selected time horizon (e.g., "Today", "+3 mo", "-6 mo")
   * @param dataType - 'historical' or 'forecasted'
   * @returns Date range object with start and end dates in "YYYY-MM" format, or null if not applicable
   */
  private getDateRangeForTimeHorizon(timeHorizon: string, dataType: 'historical' | 'forecasted'): { start: string; end: string } | null {
    // Get all unique dates from the data to determine available range
    const allDates = new Set<string>();
    this.rawAssetFlowsData.forEach(record => {
      if (record.Asset_Flow_Date) {
        allDates.add(record.Asset_Flow_Date);
      }
    });
    
    if (allDates.size === 0) return null;
    
    const sortedDates = Array.from(allDates).sort();
    
    // For simplicity, if time horizon is "Today" or forecasted, use most recent dates
    // For historical, use earlier dates
    // Since we're aggregating, we'll include all dates that match the period
    if (timeHorizon === 'Today' || (dataType === 'forecasted' && timeHorizon.startsWith('+'))) {
      // Use the most recent date(s) - for now, use all available dates
      // In a real scenario, you'd filter to specific months
      const latestDate = sortedDates[sortedDates.length - 1];
      return { start: latestDate, end: latestDate };
    } else if (dataType === 'historical' && timeHorizon.startsWith('-')) {
      // For historical, use earlier dates
      // For simplicity, use all dates up to the most recent
      const earliestDate = sortedDates[0];
      const latestDate = sortedDates[sortedDates.length - 1];
      return { start: earliestDate, end: latestDate };
    }
    
    // Default: use all available dates
    const earliestDate = sortedDates[0];
    const latestDate = sortedDates[sortedDates.length - 1];
    return { start: earliestDate, end: latestDate };
  }

  /**
   * Gets the previous period date range for comparison
   * @param timeHorizon - The current time horizon
   * @param dataType - 'historical' or 'forecasted'
   * @returns Previous period date range or null
   */
  private getPreviousPeriodDateRange(timeHorizon: string, dataType: 'historical' | 'forecasted'): { start: string; end: string } | null {
    const currentRange = this.getDateRangeForTimeHorizon(timeHorizon, dataType);
    if (!currentRange) return null;
    
    // Parse dates
    const [startYear, startMonth] = currentRange.start.split('-').map(Number);
    const [endYear, endMonth] = currentRange.end.split('-').map(Number);
    
    // Calculate period length in months
    const periodLength = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
    
    // Calculate previous period
    const prevEndDate = new Date(startYear, startMonth - 1 - 1, 1); // One month before start
    const prevStartDate = new Date(prevEndDate.getFullYear(), prevEndDate.getMonth() - periodLength + 1, 1);
    
    const prevStart = `${prevStartDate.getFullYear()}-${String(prevStartDate.getMonth() + 1).padStart(2, '0')}`;
    const prevEnd = `${prevEndDate.getFullYear()}-${String(prevEndDate.getMonth() + 1).padStart(2, '0')}`;
    
    return { start: prevStart, end: prevEnd };
  }

  /**
   * Formats a numeric value in billions with appropriate decimal places
   * @param value - The value in billions
   * @returns Formatted string (e.g., "124.8" or "5.2")
   */
  private formatValue(value: number): string {
    if (value === 0) return '0';
    if (value < 0.1) {
      return value.toFixed(2);
    } else if (value < 1) {
      return value.toFixed(1);
    } else {
      return value.toFixed(1);
    }
  }

  /**
   * Converts time horizon string to target date in YYYY-MM format
   * Returns null if time horizon is invalid
   * Uses today's date as the base for calculations
   * @param horizon - The time horizon string (e.g., "Today", "+3 mo", "-6 mo")
   */
  private convertTimeHorizonToDate(horizon: string): string | null {
    // If it's already in YYYY-MM format, return it directly
    if (/^\d{4}-\d{2}$/.test(horizon.trim())) {
      return horizon.trim();
    }
    
    // Use today's date as the base
    const today = new Date();
    const baseYear = today.getFullYear();
    const baseMonth = today.getMonth() + 1; // getMonth() returns 0-11, so add 1
    
    if (horizon === 'Today') {
      // For "Today", return the current month
      const monthStr = String(baseMonth).padStart(2, '0');
      return `${baseYear}-${monthStr}`;
    }
    
    // Parse time horizon string (e.g., "+3 mo", "+6 mo", "-3 mo", "6mo", "9mo")
    // Support both formats: with/without space and with/without + prefix
    const normalized = horizon.trim().toLowerCase();
    let match = normalized.match(/^([+-]?)(\d+)\s*mo$/i);
    
    // If no match, try without "mo" suffix (e.g., "6mo", "9mo")
    if (!match) {
      match = normalized.match(/^([+-]?)(\d+)$/);
    }
    
    if (!match) {
      console.warn('Could not parse time horizon:', horizon);
      return null;
    }
    
    const isNegative = match[1] === '-';
    const months = parseInt(match[2], 10);
    
    // Calculate target date by adding/subtracting months from today
    const targetDate = new Date(baseYear, baseMonth - 1, 1); // Create date object (month is 0-indexed)
    
    if (isNegative) {
      targetDate.setMonth(targetDate.getMonth() - months);
    } else {
      targetDate.setMonth(targetDate.getMonth() + months);
    }
    
    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth() + 1; // getMonth() returns 0-11, so add 1
    const monthStr = String(targetMonth).padStart(2, '0');
    
    return `${targetYear}-${monthStr}`;
  }

  /**
   * Formats a percentage value
   * @param value - The percentage value
   * @returns Formatted string (e.g., "12.3" or "5.1")
   */
  private formatPercentage(value: number): string {
    if (value === 0) return '0.0';
    if (value < 0.1) {
      return value.toFixed(2);
    } else {
      return value.toFixed(1);
    }
  }

  /**
   * Parses a value string to a number
   * @param valueStr - String like "$124.8B" or "-$98.4B"
   * @returns Numeric value
   */
  private parseValue(valueStr: string): number {
    const cleaned = valueStr.replace(/[$,B]/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }

  /**
   * Extracts the absolute numeric value from a percentage change string
   * @param percentageChange - String like "+3.5%" or "-2.1%"
   * @returns Absolute numeric value (e.g., 3.5 for "+3.5%" or "-3.5%")
   */
  private getAbsolutePercentageValue(percentageChange: string): number {
    // Remove the % sign and + or - sign, then parse as float
    const numericValue = parseFloat(percentageChange.replace(/[+\-%]/g, ''));
    return isNaN(numericValue) ? 0 : Math.abs(numericValue);
  }

  private getProductTypeFromSubType(subType: string): string | null {
    // Map sub-types to their product types
    const subTypeToProductType: Record<string, string> = {
      'US Equity Small Cap': 'Equity',
      'US Equity Large Cap': 'Equity',
      'Global Equity': 'Equity',
      'Emerging Markets': 'Equity',
      'Mid Cap Growth': 'Equity',
      'Core Investment Grade': 'Fixed Income',
      'Municipal Bond': 'Fixed Income',
      'Global Bonds': 'Fixed Income',
      'Short Duration': 'Fixed Income',
      'High Yield Bonds': 'Fixed Income',
      'Government/Sovereign': 'Fixed Income',
      'Credit Long Duration': 'Fixed Income',
      'Hedge Funds': 'Alternatives',
      'Crypto': 'Alternatives',
      'Commodities': 'Alternatives',
      'Money Market Funds': 'Cash',
      'Treasury Bills': 'Cash',
      'Bank Deposits/CDs': 'Cash',
      'Foreign Currency/FFX': 'Cash',
      'Private Credit': 'Private Markets',
      'Venture Capital': 'Private Markets',
      'Co-Investment': 'Private Markets',
      'Private Equity': 'Private Markets',
      'Single-family homes': 'Real Estate',
      'Multi-family homes': 'Real Estate',
      'Condominiums': 'Real Estate',
      'Townhouses': 'Real Estate',
      'Overlay Strategies': 'Other / Specialized',
      'Factor Based Investing': 'Other / Specialized',
      'Diversified Growth Funds': 'Multi-Asset',
      'Target Date Funds': 'Multi-Asset'
    };

    return subTypeToProductType[subType] || null;
  }

}


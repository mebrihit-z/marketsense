import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FiltersBarComponent } from '../../shared/components/filters/filters-bar/filters-bar.component';
import { FeaturedMarketFlowsCarouselComponent } from '../../shared/components/featured-market-flows-carousel/featured-market-flows-carousel.component';
import { MarketFlowCard } from '../../shared/components/featured-market-flows-carousel/market-flow-card/market-flow-card.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FiltersBarComponent, FeaturedMarketFlowsCarouselComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  marketFlowCards: MarketFlowCard[] = [
    {
      id: '1',
      title: 'Real Estate Headwinds',
      value: '-$8.2B',
      valueColor: 'red',
      percentageChange: '-6.8%',
      percentageColor: 'red',
      metricLabel: 'Net Outflow',
      aiConfidence: 'high',
      description: 'Commercial real estate facing pressure from elevated interest rates and hybrid work trends reducing office space demand.',
      chartColor: 'red',
      borderColor: '#fb2c36'
    },
    {
      id: '2',
      title: 'Private Equity Surge',
      value: '$124.8B',
      valueColor: 'green',
      percentageChange: '+12.3%',
      percentageColor: 'green',
      metricLabel: 'AUM',
      aiConfidence: 'high',
      description: 'Strong institutional inflows into PE funds driven by high-net-worth investors seeking alternative assets amid equity market volatility.',
      chartColor: 'green',
      borderColor: '#00bc7d'
    },
    {
      id: '3',
      title: 'Fixed Income Stability',
      value: '$3.4B',
      valueColor: 'green',
      percentageChange: '+2.1%',
      percentageColor: 'green',
      metricLabel: 'Net Flow',
      aiConfidence: 'medium',
      description: 'Duration positioning shifting as market anticipates potential rate cuts in late 2025, though timing remains uncertain.',
      chartColor: 'green',
      borderColor: '#00bc7d'
    },
    {
      id: '4',
      title: 'Equity Volatility',
      value: '-$15.3B',
      valueColor: 'red',
      percentageChange: '-4.2%',
      percentageColor: 'red',
      metricLabel: 'Net Outflow',
      aiConfidence: 'high',
      description: 'Institutional investors reducing equity exposure amid concerns over geopolitical tensions and slowing economic growth.',
      chartColor: 'red',
      borderColor: '#fb2c36'
    },
    {
      id: '5',
      title: 'Alternative Assets Growth',
      value: '$45.7B',
      valueColor: 'green',
      percentageChange: '+8.9%',
      percentageColor: 'green',
      metricLabel: 'AUM',
      aiConfidence: 'high',
      description: 'Hedge funds and private credit seeing increased allocations as investors diversify away from traditional asset classes.',
      chartColor: 'green',
      borderColor: '#00bc7d'
    },
    {
      id: '6',
      title: 'Emerging Markets Momentum',
      value: '$22.1B',
      valueColor: 'green',
      percentageChange: '+5.6%',
      percentageColor: 'green',
      metricLabel: 'Net Inflow',
      aiConfidence: 'medium',
      description: 'Growing interest in emerging market debt and equities as valuations become more attractive relative to developed markets.',
      chartColor: 'green',
      borderColor: '#00bc7d'
    },
  ];

  ngOnInit(): void {
    console.log('Dashboard component initialized');
  }

}


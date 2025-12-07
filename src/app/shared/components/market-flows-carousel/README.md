# Featured Market Flows Carousel Component

A comprehensive carousel component for displaying market flow insights with interactive data type and time horizon toggles.

## Overview

This component displays market flow cards in a responsive carousel layout, featuring:
- Data type toggle (Historical/Forecasted)
- Time horizon selection (+3mo, +6mo, +9mo, +12mo, +18mo)
- Interactive carousel with navigation arrows and pagination dots
- Detailed market flow cards with metrics, trends, and AI confidence indicators
- Optional "View More" card for navigating to full market flows page
- Responsive grid layout (3 columns on desktop, 2 on tablet, 1 on mobile)

## Usage

### Basic Implementation

```typescript
import { FeaturedMarketFlowsCarouselComponent, MarketFlowCard } from './shared/components/featured-market-flows-carousel/featured-market-flows-carousel.component';

@Component({
  selector: 'app-your-component',
  standalone: true,
  imports: [FeaturedMarketFlowsCarouselComponent],
  template: `
    <app-featured-market-flows-carousel 
      [cards]="marketFlowCards"
      [showViewMoreCard]="true">
    </app-featured-market-flows-carousel>
  `
})
export class YourComponent {
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
      description: 'Commercial real estate facing pressure...',
      chartColor: 'red',
      borderColor: '#fb2c36'
    },
    // Add more cards...
  ];
}
```

## API

### Inputs

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `cards` | `MarketFlowCard[]` | Yes | Array of market flow card data |
| `showViewMoreCard` | `boolean` | No | Whether to show the "View More" card at the end (default: `true`) |

### MarketFlowCard Interface

```typescript
interface MarketFlowCard {
  id: string;                          // Unique identifier
  title: string;                       // Card title
  value: string;                       // Main metric value (e.g., "$8.2B")
  valueColor: 'red' | 'green';        // Color for the value
  percentageChange: string;            // Percentage change (e.g., "+12.3%")
  percentageColor: 'red' | 'green';   // Color for the percentage
  metricLabel: string;                 // Label for the metric (e.g., "AUM", "Net Flow")
  aiConfidence: 'high' | 'medium' | 'low';  // AI confidence level
  description: string;                 // Detailed description
  chartColor: 'red' | 'green';        // Chart theme color
  borderColor: string;                 // Left border color (hex)
}
```

## Features

### 1. Data Type Toggle
Switch between "Historical" and "Forecasted" data views.

### 2. Time Horizon Selection
Choose from multiple time horizons:
- +3 months
- +6 months
- +9 months (default)
- +12 months
- +18 months

### 3. Carousel Navigation
- **Pagination Dots**: Visual indicators showing current slide
- **Arrow Buttons**: Navigate between slides
- **Keyboard Navigation**: Support for left/right arrow keys (if implemented)

### 4. Market Flow Cards
Each card displays:
- **Title**: Market flow name
- **Chart Section**: Visual representation with colored border
- **Metric Display**: 
  - Arrow icon (up/down)
  - Primary value
  - Percentage change badge
  - Metric label
- **Footer**:
  - AI confidence indicator (colored dot)
  - "Ask MarketSense" button
  - Detailed description
- **Actions**:
  - Download button
  - More options menu

### 5. View More Card
An optional call-to-action card that displays at the end of the carousel:
- **Design**: Clean white card with centered content
- **Icon**: Large circular plus button in primary blue
- **Title**: "View More Market Flows"
- **Subtitle**: "Explore additional market flows"
- **Behavior**: Clickable card that triggers navigation to full market flows page
- **Hover Effects**: Subtle lift animation and icon scale

## Styling

The component uses SCSS with custom variables for colors and spacing. Key color variables:

```scss
// Primary colors
$primary-blue: #0b41ad;
$text-primary: #030213;
$text-secondary: #717182;

// Status colors
$color-positive: #009966;
$color-negative: #e7000b;
$color-warning: #fe9a00;

// Border colors
$border-green: #00bc7d;
$border-red: #fb2c36;
```

## Responsive Behavior

- **Desktop (>1200px)**: 3 cards per slide
- **Tablet (768px - 1200px)**: 2 cards per slide
- **Mobile (<768px)**: 1 card per slide

## Methods

### Public Methods

| Method | Parameters | Description |
|--------|------------|-------------|
| `setDataType()` | `type: 'historical' \| 'forecasted'` | Change data type |
| `setTimeHorizon()` | `horizon: string` | Change time horizon |
| `nextSlide()` | - | Navigate to next slide |
| `previousSlide()` | - | Navigate to previous slide |
| `goToSlide()` | `index: number` | Jump to specific slide |

### Event Handlers

You can override these methods to add custom behavior:

```typescript
onViewAll(): void {
  // Handle "View All" button click in header
}

onViewMore(): void {
  // Handle "View More" card click
  // Navigate to full market flows page
}

onAskMarketSense(cardId: string): void {
  // Handle "Ask MarketSense" click
}

onDownload(cardId: string): void {
  // Handle download action
}

onMoreOptions(cardId: string): void {
  // Handle more options menu
}
```

## Customization

### Custom Styling

Override component styles in your global styles or component-specific styles:

```scss
app-featured-market-flows-carousel {
  .card {
    border-radius: 20px; // Custom border radius
  }
  
  .title {
    font-size: 24px; // Custom title size
  }
}
```

### Custom Colors

Pass custom border colors through the `MarketFlowCard` interface:

```typescript
{
  borderColor: '#custom-color'
}
```

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Accessibility

- ARIA labels on interactive elements
- Keyboard navigation support
- Focus management
- Screen reader friendly

## Examples

### Example 1: Basic Usage
See the dashboard component for a complete implementation example.

### Example 2: Dynamic Data
```typescript
// Load data from API
ngOnInit() {
  this.apiService.getMarketFlows().subscribe(data => {
    this.marketFlowCards = data.map(item => ({
      id: item.id,
      title: item.name,
      value: this.formatCurrency(item.value),
      valueColor: item.value >= 0 ? 'green' : 'red',
      // ... map other fields
    }));
  });
}
```

## Testing

Run unit tests:
```bash
ng test --include='**/featured-market-flows-carousel.component.spec.ts'
```

## Dependencies

- `@angular/common` - CommonModule
- Angular standalone components

## License

Internal use only - MarketSense project



# Asset Allocation Component

An interactive treemap visualization component that displays asset allocation data across different regions and asset classes, based on the Figma design.

## Overview

The Asset Allocation component provides a hierarchical visualization of asset distribution using a treemap layout. It shows asset allocation across three major regions (United States, Europe, and Asia Pacific) with drill-down capabilities into specific asset classes.

## Features

- **Treemap Visualization**: Interactive SVG-based treemap showing hierarchical asset allocation
- **Time Horizon Selection**: Toggle between different time periods (-12 mo, +3 mo, +6 mo, +9 mo, +12 mo, +18 mo)
- **Flow Dimensions**: Draggable filter chips to customize data dimensions
- **Product Sub-Types Toggle**: Switch to show/hide detailed product sub-categories
- **Color-Coded Performance**: Visual indicators for inflows (green), outflows (red), and neutral (gray)
- **Interactive Elements**: Clickable nodes for potential drill-down functionality
- **Responsive Design**: Adapts to different screen sizes

## Component Structure

```
asset-allocation/
├── asset-allocation.component.ts      # Component logic and data
├── asset-allocation.component.html    # Template with SVG treemap
├── asset-allocation.component.scss    # Styling
└── README.md                          # This file
```

## Usage

Import and use in your component:

```typescript
import { AssetAllocationComponent } from '../../shared/components/asset-allocation/asset-allocation.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [AssetAllocationComponent],
  // ...
})
```

In template:

```html
<app-asset-allocation></app-asset-allocation>
```

## Data Model

### TreemapNode Interface

```typescript
interface TreemapNode {
  id: string;              // Unique identifier
  label: string;           // Asset class name (e.g., "Equity", "Fixed Income")
  value: number;           // Dollar value in billions
  percentage: number;      // Percentage change
  color: 'green' | 'red' | 'neutral';  // Flow indicator
  x: number;               // X position (percentage)
  y: number;               // Y position (percentage)
  width: number;           // Width (percentage)
  height: number;          // Height (percentage)
}
```

### TreemapRegion Interface

```typescript
interface TreemapRegion {
  id: string;              // Region identifier
  name: string;            // Region name (e.g., "United States")
  x: number;               // X position (percentage)
  y: number;               // Y position (percentage)
  width: number;           // Width (percentage)
  height: number;          // Height (percentage)
  children: TreemapNode[]; // Asset classes in this region
}
```

## Customization

### Updating Data

Modify the `treemapRegions` array in `asset-allocation.component.ts`:

```typescript
treemapRegions: TreemapRegion[] = [
  {
    id: 'us',
    name: 'United States',
    x: 0.67,
    y: 1.6,
    width: 38.89,
    height: 96.8,
    children: [
      // Add your asset data here
    ]
  }
];
```

### Adding Time Horizons

Update the `timeHorizons` array:

```typescript
timeHorizons = ['-12 mo', '+3 mo', '+6 mo', '+9 mo', '+12 mo', '+18 mo', '+24 mo'];
```

### Modifying Colors

Edit the color getters in the component:

```typescript
getNodeColor(color: 'green' | 'red' | 'neutral'): string {
  switch (color) {
    case 'green':
      return '#86efac';  // Customize inflow color
    case 'red':
      return '#fca5a5';  // Customize outflow color
    case 'neutral':
      return '#e8e9eb';  // Customize neutral color
  }
}
```

## Styling

The component uses SCSS with the following key classes:

- `.asset-allocation-container`: Main container
- `.treemap-svg`: SVG visualization element
- `.region-group`: Region grouping
- `.node-group`: Individual asset node
- `.legend`: Color legend

### Responsive Breakpoints

- Desktop: Default layout
- Tablet (≤1200px): Stacked header controls
- Mobile (≤768px): Compact layout with wrapped elements

## Events and Interactions

### Node Click Event

```typescript
onNodeClick(node: TreemapNode): void {
  console.log('Node clicked:', node);
  // Implement drill-down or detail view
}
```

### Time Horizon Change

```typescript
setTimeHorizon(horizon: string): void {
  this.selectedTimeHorizon = horizon;
  // Fetch and update data for selected time horizon
}
```

### Toggle Product Sub-Types

```typescript
toggleProductSubTypes(): void {
  this.showProductSubTypes = !this.showProductSubTypes;
  // Update visualization to show/hide sub-types
}
```

## Design Specifications

Based on Figma design (node-id: 22650:10642):

- Container padding: 25px
- Gap between sections: 47px
- Border radius: 14px
- Border: 1px solid rgba(0,0,0,0.1)
- Shadow: 0px 1px 3px 0px rgba(0,0,0,0.1), 0px 1px 2px -1px rgba(0,0,0,0.1)

### Typography

- Title: Inter Medium, 20px, -0.45px letter-spacing
- Subtitle: Inter Regular, 14px, #717182
- Node Labels: Inter Bold, 11.843px
- Node Values: Inter Regular, 10.767px

### Colors

- Primary Blue: #0b41ad
- Inflow Green: #86efac
- Outflow Red: #fca5a5
- Neutral Gray: #e8e9eb
- Text Primary: #030213
- Text Secondary: #717182

## Future Enhancements

- [ ] Implement drag-and-drop for flow dimensions
- [ ] Add drill-down functionality for nested views
- [ ] Implement packing circles visualization mode
- [ ] Add animation transitions when data changes
- [ ] Export visualization as PNG/SVG
- [ ] Add tooltip on hover with detailed information
- [ ] Implement zoom and pan for large datasets

## Integration with Dashboard

The component is integrated into the dashboard at `src/app/pages/dashboard/dashboard.component.html`:

```html
<div class="asset-allocation-section">
  <app-asset-allocation></app-asset-allocation>
</div>
```

## Dependencies

- Angular CommonModule
- No external charting libraries required (pure SVG implementation)

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Responsive design for mobile browsers

## Performance Considerations

- SVG rendering is optimized for up to 50 nodes
- Consider implementing virtual scrolling for larger datasets
- Use `trackBy` functions for *ngFor loops to improve rendering performance

## Accessibility

- ARIA labels on interactive elements
- Keyboard navigation support
- Screen reader friendly text alternatives
- Color blind friendly color palette

## License

Part of the MarketSense application.


/* eslint-disable */
import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { DisclosureFooterData } from '../../utils/asset-flows-to-sankey.util';

export type InformationDisclosureTabId = 'about' | 'legal';

/** Which product area this modal describes; drives titles, tab labels, and body copy. */
export type InformationDisclosureVariant = 'market-flows' | 'asset-flows' | 'asset-allocation';

type InformationDisclosureIconId =
  | 'about-overview-market'
  | 'about-overview-asset-flows'
  | 'about-overview-asset-allocation'
  | 'about-reading-values'
  | 'about-reading-flows'
  | 'about-sample-size'
  | 'about-interpretation-market'
  | 'about-interpretation-asset-flows'
  | 'about-interpretation-asset-allocation'
  | 'about-breakdown-market'
  | 'about-breakdown-asset-flows'
  | 'about-breakdown-asset-allocation'
  | 'legal-data-sources'
  | 'legal-forward-looking'
  | 'legal-use-of-data'
  | 'legal-limitations-market'
  | 'legal-limitations-asset-flows'
  | 'legal-limitations-asset-allocation'
  | 'legal-no-investment-advice'
  | 'legal-no-guarantee';

type InformationDisclosureSection = {
  icon: InformationDisclosureIconId;
  title: string;
  text: string;
  iconBare?: boolean;
  isHero?: boolean;
};

@Component({
  selector: 'app-information-and-disclosure',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './information-and-disclosure.component.html',
  styleUrl: './information-and-disclosure.component.scss',
})
export class InformationAndDisclosureComponent implements OnChanges {
  @Input() isVisible = false;
  @Input() variant: InformationDisclosureVariant = 'market-flows';
  /** `Load_Date` / `Model_Version` from loaded asset flows (same pattern as the main disclosure modal). */
  @Input() footerData: DisclosureFooterData | null = null;

  @Output() close = new EventEmitter<void>();

  activeTab: InformationDisclosureTabId = 'about';

  get modelVersionDisplay(): string {
    return (this.footerData?.modelVersion ?? '').trim();
  }

  /** Human-readable `Load_Date` (UTC), aligned with pipeline dates. */
  get loadDateDisplay(): string {
    const raw = (this.footerData?.loadDate ?? '').trim();
    if (!raw) return '';
    const t = Date.parse(raw);
    if (!Number.isFinite(t)) return raw;
    try {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(t));
    } catch {
      return raw;
    }
  }

  get dialogTitle(): string {
    switch (this.variant) {
      case 'asset-flows':
        return 'Asset Flows: Information & Disclosures';
      case 'asset-allocation':
        return 'Cash Flow by Asset Allocation: Information & Disclosures';
      default:
        return 'Market Flows: Information & Disclosures';
    }
  }

  get aboutTabLabel(): string {
    switch (this.variant) {
      case 'asset-flows':
        return 'About Asset Flows';
      case 'asset-allocation':
        return 'About Asset Allocation';
      default:
        return 'About Market Flows';
    }
  }

  get aboutSections(): InformationDisclosureSection[] {
    switch (this.variant) {
      case 'asset-flows':
        return [
          {
            icon: 'about-overview-asset-flows',
            title: 'Overview',
            text: 'The Asset Flows diagram visualizes how capital is expected to move between asset groups, showing both inflows and outflows across selected dimensions.',
            iconBare: true,
            isHero: true,
          },
          {
            icon: 'about-reading-flows',
            title: 'Reading the Flows',
            text: 'Flows connect categories on the left (outflows) to categories on the right (inflows). The width of each flow represents the relative volume of capital moving between categories.',
          },
          {
            icon: 'about-sample-size',
            title: 'Sample Size & Prediction Interval',
            text: 'Sample size reflects the number of Mercer clients included. Prediction intervals indicate the expected range of outcomes — wider ranges reflect greater uncertainty.',
          },
          {
            icon: 'about-interpretation-asset-flows',
            title: 'Interpretation',
            text: 'Flows indicate directional trends in capital movement and should be interpreted alongside market context and professional judgment.',
          },
          {
            icon: 'about-breakdown-asset-flows',
            title: 'Breakdown Clarification',
            text: 'Dimensions determine how flows are grouped and organized. For example, selecting Investor Region → Product Type shows how capital moves from investor locations into different asset categories.',
          },
        ];
      case 'asset-allocation':
        return [
          {
            icon: 'about-overview-asset-allocation',
            title: 'Overview',
            text: 'The Asset Allocation treemap shows how capital is distributed across asset groups, sized by relative share within the selected dimensions.',
            iconBare: true,
            isHero: true,
          },
          {
            icon: 'about-reading-flows',
            title: 'Reading the Flows',
            text: 'Each rectangle represents a category, sized based on its relative share of total capital. Larger areas indicate a greater proportion within the selected view.',
          },
          {
            icon: 'about-sample-size',
            title: 'Sample Size & Prediction Interval',
            text: 'Sample size reflects the number of Mercer clients included. Prediction intervals indicate the expected range of outcomes — wider ranges reflect greater uncertainty.',
          },
          {
            icon: 'about-interpretation-asset-allocation',
            title: 'Interpretation',
            text: 'The treemap highlights relative distribution across categories and should be interpreted alongside market context and professional judgment.',
          },
          {
            icon: 'about-breakdown-asset-allocation',
            title: 'Breakdown Clarification',
            text: 'Dimensions define how the treemap is grouped and structured. Dimension 1 shows the top-level grouping, Dimension 2 breaks it down further, and Dimension 3 reveals more detailed levels.',
          },
        ];
      default:
        return [
          {
            icon: 'about-overview-market',
            title: 'Overview',
            text: 'Market Flow cards display projected inflows and outflows across asset classes, regions, and investor segments.',
            iconBare: true,
            isHero: true,
          },
          {
            icon: 'about-reading-values',
            title: 'Reading the Values',
            text: 'Positive values indicate expected inflows into the selected asset class or segment, while negative values indicate expected outflows. Net flow represents the balance between projected inflows and projected outflows over the selected time horizon.',
          },
          {
            icon: 'about-sample-size',
            title: 'Sample Size & Prediction Interval',
            text: 'Sample size reflects Mercer clients included. Intervals show expected range; wider = more uncertainty.',
          },
          {
            icon: 'about-interpretation-market',
            title: 'Interpretation',
            text: 'Results are directional; interpret with market context and professional judgment.',
          },
          {
            icon: 'about-breakdown-market',
            title: 'Breakdown Clarification',
            text: 'Investor Type breakdown shows which types of investors are expected to allocate capital, such as pension funds, insurers, or endowments. Product Region breakdown shows where capital is expected to be invested geographically, which may differ from where the investor is located.',
          },
        ];
    }
  }

  get legalSections(): InformationDisclosureSection[] {
    const dataSourcesText =
      this.variant === 'market-flows'
        ? 'Predictions based on Mercer client activity, historical allocation trends, Mercer Insight engagement, and macroeconomic indicators.'
        : 'Insights are derived from aggregated Mercer client data, historical allocation trends, Mercer Insights engagement, and selected macroeconomic indicators.';

    const forwardLookingText =
      this.variant === 'market-flows'
        ? 'Values shown are model-generated estimates based on historical patterns and observed signals. They are not predictions of actual outcomes and may change as new data becomes available.'
        : 'Flows shown are model-generated estimates based on historical patterns and observed signals. They are not predictions of actual outcomes and may change as new data becomes available.';

    const limitationsIcon: InformationDisclosureIconId =
      this.variant === 'market-flows'
        ? 'legal-limitations-market'
        : this.variant === 'asset-flows'
          ? 'legal-limitations-asset-flows'
          : 'legal-limitations-asset-allocation';

    const limitationsText =
      this.variant === 'market-flows'
        ? 'Coverage reflects available Mercer data and may not represent the full market. Certain asset classes, regions, or investor segments may have limited sample sizes.'
        : 'Coverage reflects available Mercer data and may not represent the full market. Certain asset classes, regions, or dimensions may have limited sample sizes.';

    return [
      {
        icon: 'legal-data-sources',
        title: 'Data Sources',
        text: dataSourcesText,
      },
      {
        icon: 'legal-forward-looking',
        title: 'Forward-Looking Estimates',
        text: forwardLookingText,
      },
      {
        icon: 'legal-use-of-data',
        title: 'Use of Data',
        text: 'Data is aggregated and anonymized. Individual client information is not identifiable.',
      },
      {
        icon: limitationsIcon,
        title: 'Limitations',
        text: limitationsText,
      },
      {
        icon: 'legal-no-investment-advice',
        title: 'No Investment Advice',
        text:
          this.variant === 'market-flows'
            ? 'This information is provided for general informational purposes only and does not constitute investment, legal, or financial advice.'
            : 'This information is provided for general informational purposes only and should not be relied upon as investment, legal, or financial advice.',
      },
      {
        icon: 'legal-no-guarantee',
        title: 'No Guarantee of Accuracy',
        text: 'While reasonable care has been taken, Mercer does not guarantee the accuracy, completeness, or timeliness of the information provided.',
      },
    ];
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['isVisible']) return;
    document.body.style.overflow = this.isVisible ? 'hidden' : '';
    if (this.isVisible) {
      this.activeTab = 'about';
    }
  }

  @HostListener('document:keydown.escape')
  handleEscape(): void {
    if (!this.isVisible) return;
    this.onClose();
  }

  setTab(tab: InformationDisclosureTabId): void {
    this.activeTab = tab;
  }

  onClose(): void {
    document.body.style.overflow = '';
    this.close.emit();
  }
}

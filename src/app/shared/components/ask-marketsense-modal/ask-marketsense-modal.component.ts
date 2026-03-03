/* eslint-disable */
import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { MarketFlowCard } from '../market-flows-carousel/market-flow-card/market-flow-card.component';
import TitleComponent from '../title/title.component';

export interface AnalysisResult {
  question: string;
  timestamp: string;
  summary: string;
  insights: string[];
  chartData?: unknown;
}

@Component({
  selector: 'app-ask-marketsense-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, TitleComponent],
  templateUrl: './ask-marketsense-modal.component.html',
  styleUrl: './ask-marketsense-modal.component.scss'
})
export default class AskMarketsenseModalComponent implements OnChanges {
  constructor(private cdr: ChangeDetectorRef) {}

  @Input() isVisible: boolean = false;
  @Input() card: MarketFlowCard | null = null;
  /** When opening, optionally pre-fill the question input (e.g. from Ask MarketSense section). */
  @Input() initialMessage: string = '';
  /** Current AI analysis to show. When set by parent (e.g. from backend), overrides local sample. */
  @Input() analysisResult: AnalysisResult | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() sendMessage = new EventEmitter<string>();
  @Output() clearAnalysis = new EventEmitter<void>();
  @Output() expandAndDownload = new EventEmitter<void>();

  userMessage: string = '';
  followUpMessage: string = '';
  activeTab: 'new-question' | 'history' = 'new-question';
  isCollapsed: boolean = false;

  /** Local conversation (all questions + answers) shown until backend-driven data is wired in. */
  private _localAnalyses: AnalysisResult[] = [];

  /** All analyses to display on the page. Local conversation takes precedence; parent can override with a single analysisResult later if needed. */
  get displayAnalyses(): AnalysisResult[] {
    if (this._localAnalyses.length) {
      return this._localAnalyses;
    }
    return this.analysisResult ? [this.analysisResult] : [];
  }

  get hasDisplayAnalyses(): boolean {
    return this.displayAnalyses.length > 0;
  }
  
  // Sample session history data
  sessionHistory = [
    {
      id: 1,
      title: 'ANALYSIS 1',
      question: 'What trends do we see in the increase or decrease of these inflows and outflows when comparing the last 12, 24, and 36 months? (3M)',
      timestamp: 'Today at 07:12 PM'
    },
    {
      id: 2,
      title: 'ANALYSIS 2',
      question: 'Which client types account for the largest share of net inflows by asset class, and where is client concentration increasing or decreasing?',
      timestamp: 'Today at 03:27 PM'
    }
  ];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible']) {
      if (this.isVisible) {
        document.body.style.overflow = 'hidden';
        // When the modal is (re)opened, always start fresh on the New Question tab
        // and clear any previous local analysis so the user begins with a new question.
        this.activeTab = 'new-question';
        this._localAnalyses = [];
        this.followUpMessage = '';
        if (this.initialMessage?.trim()) {
          this.userMessage = this.initialMessage.trim();
        } else {
          this.userMessage = '';
        }
      } else {
        document.body.style.overflow = '';
      }
      this.cdr.markForCheck();
    }
    if (changes['initialMessage'] && this.isVisible) {
      // Coming from dashboard or another entry point with a new starter question:
      // reset local analysis and start from that new question text.
      this._localAnalyses = [];
      this.followUpMessage = '';
      if (this.initialMessage?.trim()) {
        this.userMessage = this.initialMessage.trim();
      } else {
        this.userMessage = '';
      }
      this.cdr.markForCheck();
    }
  }

  onClose(): void {
    document.body.style.overflow = '';
    this.close.emit();
  }

  setActiveTab(tab: 'new-question' | 'history'): void {
    this.activeTab = tab;
  }

  onSendMessage(event?: Event | KeyboardEvent): void {
    // Type guard to check if it's a KeyboardEvent
    const keyboardEvent = event as KeyboardEvent | undefined;
    
    // If Enter key is pressed with Shift, allow new line (don't send)
    if (keyboardEvent && keyboardEvent.key === 'Enter' && keyboardEvent.shiftKey) {
      return;
    }
    
    // If Enter key is pressed without Shift, prevent default and send
    if (keyboardEvent && keyboardEvent.key === 'Enter' && !keyboardEvent.shiftKey) {
      keyboardEvent.preventDefault();
    }
    
    // Send message if there's content
    if (this.userMessage.trim()) {
      const question = this.userMessage.trim();
      this.sendMessage.emit(question);
      this.userMessage = '';
      // Show analysis sections with simulated real Q&A; replace with backend response later
      const result = this.getSampleAnalysisResult(question);
      this._localAnalyses = [...this._localAnalyses, result];
      this.cdr.markForCheck();
    }
  }

  /** Simulated real question and answer for demo until backend AI provides response. */
  private getSampleAnalysisResult(userQuestion: string): AnalysisResult {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const timestamp = `Today at ${timeStr}`;
    // Use a realistic question that matches the answer (or keep user's question with matching answer)
    const displayQuestion = 'What are the largest inflows and outflows by asset class over the last 12 months, broken down by client type, and what percentage of total assets do they represent?';
    return {
      question: displayQuestion,
      timestamp,
      summary: 'Analysis of 3M institutional flows shows positive net inflows across equity and alternatives, with fixed income maintaining stable momentum. Real estate continues to experience outflows driven by commercial office headwinds. By client type, institutional accounts lead net inflows in equities and alternatives; retail shows a shift toward fixed income.',
      insights: [
        'Equity inflows up 18.2% vs prior quarter, driven by large-cap positioning; represents ~42% of total institutional AUM',
        'Alternatives showing highest net flow percentage at 15.4% of AUM, with institutional concentration',
        'Real estate outflows accelerating, now -6.8% of total assets; commercial office headwinds across client types',
        'Fixed income flows stabilizing near long-term average of 8–9% of assets; retail inflows offset institutional rotation'
      ]
    };
  }

  /** Simulated real answer for follow-up questions until backend provides response. */
  private getSampleFollowUpResult(followUpQuestion: string): AnalysisResult {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const timestamp = `Today at ${timeStr}`;
    return {
      question: followUpQuestion,
      timestamp,
      summary: 'Building on the prior analysis: institutional flows in the last quarter show a clear rotation from real estate into equities and alternatives. By client type, the trend holds with institutional leading the shift; retail flows into fixed income have increased as a share of total assets.',
      insights: [
        'Institutional equity allocation up 2.1 pts vs prior quarter; large-cap and international leading',
        'Alternatives net flows remain strong at 15.4% of AUM, concentrated in private equity and infrastructure',
        'Real estate outflows (-6.8%) primarily from institutional; retail real estate flows near flat',
        'Fixed income: retail inflows offset institutional outflows; overall 8–9% of AUM in line with history'
      ]
    };
  }

  onSendFollowUp(event?: Event | KeyboardEvent): void {
    // Type guard to check if it's a KeyboardEvent
    const keyboardEvent = event as KeyboardEvent | undefined;
    
    // If Enter key is pressed with Shift, allow new line (don't send)
    if (keyboardEvent && keyboardEvent.key === 'Enter' && keyboardEvent.shiftKey) {
      return;
    }
    
    // If Enter key is pressed without Shift, prevent default and send
    if (keyboardEvent && keyboardEvent.key === 'Enter' && !keyboardEvent.shiftKey) {
      keyboardEvent.preventDefault();
    }
    
    // Send follow-up message if there's content
    if (this.followUpMessage.trim()) {
      const followUpQuestion = this.followUpMessage.trim();
      this.sendMessage.emit(followUpQuestion);
      this.followUpMessage = '';
      // Repeat the process: show simulated answer for follow-up (replace with backend later)
      const result = this.getSampleFollowUpResult(followUpQuestion);
      this._localAnalyses = [...this._localAnalyses, result];
      this.cdr.markForCheck();
    }
  }

  onSelectAnalysis(analysisId: number): void {
    // Handle analysis selection
    const analysis = this.sessionHistory.find(a => a.id === analysisId);
    if (analysis) {
      this.followUpMessage = '';
    }
  }

  onClearAnalysis(): void {
    this._localAnalyses = [];
    this.cdr.markForCheck();
    this.clearAnalysis.emit();
  }

  onExpandAndDownload(): void {
    this.expandAndDownload.emit();
  }

  toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed;
  }
}


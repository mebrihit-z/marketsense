/* eslint-disable */
import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { MarketFlowCard } from '../market-flows-carousel/market-flow-card/market-flow-card.component';
import TitleComponent from '../title/title.component';
import { AiChatService, type AiChatResponse } from '../../../core/services/ai-chat.service';

export interface AnalysisResult {
  question: string;
  timestamp: string;
  summary: string;
  key_points: string[];
  visualization_image_base64?: string;
}

@Component({
  selector: 'app-ask-marketsense-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, TitleComponent],
  templateUrl: './ask-marketsense-modal.component.html',
  styleUrl: './ask-marketsense-modal.component.scss'
})
export default class AskMarketsenseModalComponent implements OnChanges {
  constructor(
    private cdr: ChangeDetectorRef,
    private aiChatService: AiChatService
  ) {}

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
  isVisualizationModalOpen: boolean = false;
  /** True while waiting for AI response. */
  isWaitingForResponse: boolean = false;
  /** Last error message from AI chat, if any. */
  errorMessage: string | null = null;

  /** Local conversation (all questions + answers) shown until backend-driven data is wired in. */
  private _localAnalyses: AnalysisResult[] = [];

  /** All analyses to display on the page. Local conversation takes precedence; parent can override with a single analysisResult later if needed. */
  get displayAnalyses(): AnalysisResult[] {
    if (this._localAnalyses.length) {
      return this._localAnalyses;
    }
    return this.analysisResult ? [this.analysisResult] : [];
  }

  /** The visualization image to use for the expanded modal (default: most recent analysis with an image). */
  get expandedVisualizationImageBase64(): string | null {
    const analyses = this.displayAnalyses;
    if (!analyses.length) {
      return null;
    }
    // Prefer the last analysis that has a visualization image
    for (let i = analyses.length - 1; i >= 0; i--) {
      if (analyses[i].visualization_image_base64) {
        return analyses[i].visualization_image_base64!;
      }
    }
    return null;
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
        this.isVisualizationModalOpen = false;
      } else {
        document.body.style.overflow = '';
        this.isVisualizationModalOpen = false;
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
    this.isVisualizationModalOpen = false;
    this.close.emit();
  }

  setActiveTab(tab: 'new-question' | 'history'): void {
    this.activeTab = tab;
  }

  onSendMessage(event?: Event | KeyboardEvent): void {
    const keyboardEvent = event as KeyboardEvent | undefined;
    if (keyboardEvent?.key === 'Enter' && keyboardEvent.shiftKey) return;
    if (keyboardEvent?.key === 'Enter' && !keyboardEvent.shiftKey) keyboardEvent.preventDefault();

    if (!this.userMessage.trim() || this.isWaitingForResponse) return;

    const question = this.userMessage.trim();
    this.sendMessage.emit(question);
    this.userMessage = '';
    this.errorMessage = null;
    this.isWaitingForResponse = true;
    this.cdr.markForCheck();

    this.aiChatService.sendQuestion(question, { isFollowUp: false }).subscribe({
      next: (result: AiChatResponse) => {
        console.log('==== AskMarketsenseModal initial AiChatResponse ====:', result);
        this._localAnalyses = [...this._localAnalyses, this.toAnalysisResult(result)];
        this.isWaitingForResponse = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.errorMessage = err?.error?.message ?? err?.message ?? 'Failed to get AI response. Please try again.';
        this.isWaitingForResponse = false;
        this.cdr.markForCheck();
      },
    });
  }

  private toAnalysisResult(res: AiChatResponse): AnalysisResult {
    const ts = res.timestamp ?? '';
    return {
      question: res.question,
      timestamp: ts.includes('Today') ? ts : `Today at ${ts}`,
      summary: res.summary,
      key_points: res.key_points ?? [],
      visualization_image_base64: res.visualization_image_base64,
    };
  }

  onSendFollowUp(event?: Event | KeyboardEvent): void {
    const keyboardEvent = event as KeyboardEvent | undefined;
    if (keyboardEvent?.key === 'Enter' && keyboardEvent.shiftKey) return;
    if (keyboardEvent?.key === 'Enter' && !keyboardEvent.shiftKey) keyboardEvent.preventDefault();

    if (!this.followUpMessage.trim() || this.isWaitingForResponse) return;

    const followUpQuestion = this.followUpMessage.trim();
    this.sendMessage.emit(followUpQuestion);
    this.followUpMessage = '';
    this.errorMessage = null;
    this.isWaitingForResponse = true;
    this.cdr.markForCheck();

    this.aiChatService.sendQuestion(followUpQuestion, { isFollowUp: true }).subscribe({
      next: (result: AiChatResponse) => {
        console.log('==== AskMarketsenseModal follow-up AiChatResponse ====:', result);
        this._localAnalyses = [...this._localAnalyses, this.toAnalysisResult(result)];
        this.isWaitingForResponse = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.errorMessage = err?.error?.message ?? err?.message ?? 'Failed to get AI response. Please try again.';
        this.isWaitingForResponse = false;
        this.cdr.markForCheck();
      },
    });
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
    this.isVisualizationModalOpen = true;
    this.expandAndDownload.emit();
  }

  closeVisualizationModal(): void {
    this.isVisualizationModalOpen = false;
  }

  toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed;
  }
}


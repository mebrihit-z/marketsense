/* eslint-disable */
import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { MarketFlowCard } from '../market-flows-carousel/market-flow-card/market-flow-card.component';
import TitleComponent from '../title/title.component';
import { AiChatService, type AiChatResponse } from '../../../core/services/ai-chat.service';
import { loadImageFromDataUrl } from '../../utils/chart-dom-export.util';
import {
  coerceVisualizationImageBase64Payload,
  pickVisualizationImageBase64FromResponseBody,
} from '../../utils/visualization-image-base64.util';
import { formatFlowCurrencyUsd } from '../../utils/flow-currency-format.util';
import { jsPDF } from 'jspdf';

export interface AnalysisResult {
  question: string;
  timestamp: string;
  summary: string;
  key_points: string[];
  key_drivers: string[];
  visualization_image_base64?: string;
  /** Message from backend when no visualization image is available. */
  visualization_message?: string | null;
  /** Table data for Query Results */
  row_count?: number;
  columns?: string[];
  rows?: Record<string, unknown>[];
  /** Backend `route === "fallback"`: only {@link summary} (from `message`) is shown; no chart/table/insights. */
  isFallbackResponse?: boolean;
  /** From first (or any) turn’s API response; follow-ups use the first turn’s id. */
  conversation_id?: string;
}

/** jsPDF body text — matches `$text-midnight-blue` / `#00113F` */
const PDF_TEXT_MIDNIGHT_RGB: [number, number, number] = [0, 17, 63];

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
  /** Analysis whose chart is shown in the expanded visualization modal (the one that was clicked). */
  expandedAnalysis: AnalysisResult | null = null;
  /** Query Results expanded modal: analysis whose table is shown. */
  isQueryResultsModalOpen: boolean = false;
  expandedTableAnalysis: AnalysisResult | null = null;
  /** True while waiting for AI response. */
  isWaitingForResponse: boolean = false;
  /** Last error message from AI chat, if any. */
  errorMessage: string | null = null;

  /** Local conversation (all questions + answers) shown until backend-driven data is wired in. */
  private _localAnalyses: AnalysisResult[] = [];
  /**
   * After "New Question" or "Clear Analysis" we still show {@link analysisResult} from the parent, but
   * its `conversation_id` must not be used for the next in-modal follow-up; only fresh `_localAnalyses[0]`
   * (or a non-cleared parent) provides the id.
   */
  private conversationThreadCleared: boolean = false;

  /** Cache: which query-result column keys are numeric (right-aligned), per {@link AnalysisResult} instance. */
  private readonly queryTableNumericColumnKeys = new WeakMap<AnalysisResult, Set<string>>();

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

  /** `conversation_id` to send with a follow-up: first in-modal turn, else parent if current thread is not reset. */
  private get followUpConversationIdFromFirstTurn(): string | undefined {
    if (this._localAnalyses.length > 0) {
      return this._localAnalyses[0].conversation_id;
    }
    if (this.conversationThreadCleared) {
      return undefined;
    }
    return this.analysisResult?.conversation_id;
  }
  
  // Sample session history data
  sessionHistory = [
    {
      id: 1,
      title: 'ANALYSIS 1',
      question: 'What trends do we see in the increase or decrease of these inflows and outflows when comparing the last 12, 24, and 36 months? (3M)',
      timestamp: 'Mar 15, 2025, 7:12 PM'
    },
    {
      id: 2,
      title: 'ANALYSIS 2',
      question: 'Which client types account for the largest share of net inflows by asset class, and where is client concentration increasing or decreasing?',
      timestamp: 'Mar 15, 2025, 3:27 PM'
    }
  ];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible']) {
      if (this.isVisible) {
        document.body.style.overflow = 'hidden';
        // Reopen on the New Question tab; keep the in-modal conversation across close/reopen
        // (e.g. X or overlay) so the thread is not cleared until Clear Analysis or a new starter question.
        this.activeTab = 'new-question';
        this.followUpMessage = '';
        if (this.initialMessage?.trim()) {
          this.userMessage = this.initialMessage.trim();
        } else {
          this.userMessage = '';
        }
        this.isVisualizationModalOpen = false;
        this.expandedAnalysis = null;
        this.isQueryResultsModalOpen = false;
        this.expandedTableAnalysis = null;
      } else {
        document.body.style.overflow = '';
        this.isVisualizationModalOpen = false;
        this.expandedAnalysis = null;
        this.isQueryResultsModalOpen = false;
        this.expandedTableAnalysis = null;
      }
      this.cdr.markForCheck();
    }
    if (changes['initialMessage'] && this.isVisible) {
      // Coming from dashboard or another entry point with a new starter question:
      // reset local analysis and start from that new question text.
      this._localAnalyses = [];
      this.conversationThreadCleared = true;
      this.followUpMessage = '';
      if (this.initialMessage?.trim()) {
        this.userMessage = this.initialMessage.trim();
      } else {
        this.userMessage = '';
      }
      this.cdr.markForCheck();
    }

    if (this.shouldAutoSubmitInitialFromChanges(changes)) {
      setTimeout(() => {
        if (!this.isVisible || !this.userMessage.trim() || this.isWaitingForResponse) return;
        this.onSendMessage();
      }, 0);
    }
  }

  /**
   * When the modal opens with {@link initialMessage} (e.g. Ask MarketSense section "Let's Go"),
   * submit immediately so the user does not need to click "Ask Question".
   */
  private shouldAutoSubmitInitialFromChanges(changes: SimpleChanges): boolean {
    if (!this.initialMessage?.trim() || !this.isVisible) return false;
    const vis = changes['isVisible'];
    const init = changes['initialMessage'];
    if (vis?.currentValue === true && vis.previousValue !== true) return true;
    if (init && !vis) return true;
    return false;
  }

  onClose(): void {
    document.body.style.overflow = '';
    this.isVisualizationModalOpen = false;
    this.expandedAnalysis = null;
    this.isQueryResultsModalOpen = false;
    this.expandedTableAnalysis = null;
    this.close.emit();
  }

  setActiveTab(tab: 'new-question' | 'history'): void {
    this.activeTab = tab;
    if (tab !== 'new-question') {
      return;
    }
    this._localAnalyses = [];
    this.conversationThreadCleared = true;
    this.userMessage = '';
    this.followUpMessage = '';
    this.errorMessage = null;
    this.isWaitingForResponse = false;
    this.isVisualizationModalOpen = false;
    this.expandedAnalysis = null;
    this.isQueryResultsModalOpen = false;
    this.expandedTableAnalysis = null;
    this.clearAnalysis.emit();
    this.cdr.markForCheck();
  }

  onSendMessage(event?: Event | KeyboardEvent): void {
    const keyboardEvent = event as KeyboardEvent | undefined;
    if (keyboardEvent?.key === 'Enter' && keyboardEvent.shiftKey) return;
    if (keyboardEvent?.key === 'Enter' && !keyboardEvent.shiftKey) keyboardEvent.preventDefault();

    if (!this.userMessage.trim() || this.isWaitingForResponse) return;

    const question = this.userMessage.trim();
    this.sendMessage.emit(question);
    this.errorMessage = null;
    this.isWaitingForResponse = true;
    this.cdr.markForCheck();

    this.aiChatService.sendQuestion(question, { isFollowUp: false }).subscribe({
      next: (result: AiChatResponse) => {
        console.log('==== AskMarketsenseModal initial AiChatResponse ====:', result);
        console.log('[AskMarketsenseModal] conversation_id (first turn response):', result.conversation_id);
        this._localAnalyses = [...this._localAnalyses, this.toAnalysisResult(result)];
        this.isWaitingForResponse = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.errorMessage = this.resolveAiChatErrorMessage(err);
        this.isWaitingForResponse = false;
        this.cdr.markForCheck();
      },
    });
  }

  /** HTTP errors and service-thrown failures: nested `error.message` (API envelope) or flat message. */
  private resolveAiChatErrorMessage(err: unknown): string {
    const e = err as {
      error?: { message?: string; error?: { message?: string } };
      message?: string;
    };
    const nested = e?.error?.error?.message;
    if (typeof nested === 'string' && nested.trim()) return nested.trim();
    const flat = e?.error?.message;
    if (typeof flat === 'string' && flat.trim()) return flat.trim();
    const top = e?.message;
    if (typeof top === 'string' && top.trim()) return top.trim();
    return 'Failed to get AI response. Please try again.';
  }

  /** Shown under each question: calendar date and time (not "Today at …"). */
  private formatLocaleDateTime(d: Date): string {
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  /**
   * Prefer a parseable datetime from the API; otherwise use the moment the response is applied
   * (service often sends time-only — clock time matches receive time within a few seconds).
   */
  private formatAnalysisTimestamp(res: AiChatResponse): string {
    const raw = (res.timestamp ?? '').trim();
    if (raw) {
      if (/^\d{4}-\d{2}-\d{2}T/.test(raw) || /^\d{4}-\d{2}-\d{2}\s+\d/.test(raw)) {
        const parsed = new Date(raw);
        if (!Number.isNaN(parsed.getTime())) {
          return this.formatLocaleDateTime(parsed);
        }
      }
      if (/^\d{13}$/.test(raw)) {
        const parsed = new Date(Number(raw));
        if (!Number.isNaN(parsed.getTime())) {
          return this.formatLocaleDateTime(parsed);
        }
      }
    }
    return this.formatLocaleDateTime(new Date());
  }

  private toAnalysisResult(res: AiChatResponse): AnalysisResult {
    const routeNorm = res.route?.toString().trim().toLowerCase();
    const fallbackText = (res.message == null ? '' : String(res.message)).trim();
    const vizMessage = res.visualization_message;
    const hasVizMessage = typeof vizMessage === 'string' && vizMessage.trim().length > 0;

    if (routeNorm === 'fallback') {
      return {
        question: res.question,
        timestamp: this.formatAnalysisTimestamp(res),
        summary: fallbackText,
        key_points: [],
        key_drivers: [],
        visualization_image_base64: undefined,
        visualization_message: null,
        row_count: undefined,
        columns: [],
        rows: [],
        isFallbackResponse: true,
        conversation_id: res.conversation_id,
      };
    }

    const summaryTrimmed = (res.summary == null ? '' : String(res.summary)).trim();
    /** e.g. genie + intent data with `message: "No data is available for this query."` and empty summary */
    const useBackendMessageAsSummary = !summaryTrimmed && !!fallbackText;
    const summary = summaryTrimmed || fallbackText || '';
    const cols = (res.columns ?? []) as string[];
    const rows = (res.rows ?? []) as Record<string, unknown>[];
    const hasTable = cols.length > 0 && rows.length > 0;
    /**
     * Match fallback UX (section label "Message", hide empty blocks) only when there is no results table
     * and nothing to show under Visualization (image or backend visualization_message).
     */
    const useFallbackLayout = useBackendMessageAsSummary && !hasTable && !hasVizMessage;

    return {
      question: res.question,
      timestamp: this.formatAnalysisTimestamp(res),
      summary,
      key_points: res.key_points ?? [],
      key_drivers: res.key_drivers ?? [],
      visualization_image_base64: pickVisualizationImageBase64FromResponseBody(res),
      visualization_message: vizMessage ?? null,
      row_count: res.row_count,
      columns: cols,
      rows: rows,
      conversation_id: res.conversation_id,
      ...(useFallbackLayout ? { isFallbackResponse: true } : {}),
    };
  }

  /**
   * Set of column keys for which every non-empty cell is numeric; those columns are right-aligned in the table.
   * Result is cached per `analysis` reference.
   */
  numericColumnKeysForAnalysis(analysis: AnalysisResult | null | undefined): Set<string> {
    if (!analysis?.columns?.length) {
      return new Set();
    }
    let set = this.queryTableNumericColumnKeys.get(analysis);
    if (!set) {
      set = this.buildNumericColumnKeySet(analysis.columns, analysis.rows ?? []);
      this.queryTableNumericColumnKeys.set(analysis, set);
    }
    return set;
  }

  private buildNumericColumnKeySet(columns: string[], rows: Record<string, unknown>[]): Set<string> {
    const out = new Set<string>();
    for (const key of columns) {
      let seen = 0;
      let allNumeric = true;
      for (const row of rows) {
        const v = row[key];
        if (v == null) continue;
        if (typeof v === 'string' && v.trim() === '') continue;
        seen++;
        if (!this.isQueryTableNumericCellValue(v)) {
          allNumeric = false;
          break;
        }
      }
      if (seen > 0 && allNumeric) {
        out.add(key);
      }
    }
    return out;
  }

  private isQueryTableNumericCellValue(value: unknown): boolean {
    if (typeof value === 'number') {
      return Number.isFinite(value);
    }
    if (typeof value === 'bigint') {
      return true;
    }
    if (typeof value === 'string') {
      if (this.toDate(value)) {
        return false;
      }
      const t = value.trim();
      if (t === '' || /^(n\/a|na|—|-)$/i.test(t)) {
        return false;
      }
      const normalized = t.replace(/,/g, '');
      if (!/^-?\d*(?:\.\d+)?(?:[eE][-+]?\d+)?$/.test(normalized)) {
        return false;
      }
      return Number.isFinite(Number(normalized));
    }
    return false;
  }

  /** Display label for a column key (e.g. total_inflow -> Total Inflow) */
  formatColumnLabel(key: string): string {
    return key
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  /** Format cell value for display (e.g. large numbers as $XX.XB, dates as readable format) */
  formatCellValue(key: string, value: unknown): string {
    if (value == null) return '—';
    if (typeof value === 'number') {
      const keyLower = key.toLowerCase();
      // Match flow amounts: inflow/outflow, net_flow, cash_flow, and totals (e.g. total_inflow) that include "flow"
      if (keyLower.includes('flow') || keyLower.includes('total')) {
        return formatFlowCurrencyUsd(value);
      }
      if (Number.isInteger(value)) return String(value);
      return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
    const date = this.toDate(value);
    if (date) {
      return this.formatQueryTableDateString(key, date);
    }
    return String(value);
  }

  /** Same date presentation in the table and in CSV (year columns vs day/month/year). */
  private formatQueryTableDateString(key: string, date: Date): string {
    const keyLower = key.toLowerCase();
    const isYearColumn = keyLower === 'year' || keyLower.includes('year');
    if (isYearColumn) {
      return String(date.getUTCFullYear());
    }
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  /** Coerce value to Date if it's an ISO string or Date instance; otherwise null */
  private toDate(value: unknown): Date | null {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    const str = typeof value === 'string' ? value.trim() : '';
    if (!str || !/^\d{4}-\d{2}-\d{2}/.test(str)) return null;
    const date = new Date(str);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  onSendFollowUp(event?: Event | KeyboardEvent): void {
    const keyboardEvent = event as KeyboardEvent | undefined;
    if (keyboardEvent?.key === 'Enter' && keyboardEvent.shiftKey) return;
    if (keyboardEvent?.key === 'Enter' && !keyboardEvent.shiftKey) keyboardEvent.preventDefault();

    if (!this.followUpMessage.trim() || this.isWaitingForResponse) return;

    const followUpQuestion = this.followUpMessage.trim();
    this.sendMessage.emit(followUpQuestion);
    this.errorMessage = null;
    this.isWaitingForResponse = true;
    this.cdr.markForCheck();

    const firstTurnConversationId = this.followUpConversationIdFromFirstTurn;
    console.log('[AskMarketsenseModal] follow-up: sending with conversation_id (from first turn):', firstTurnConversationId);
    this.aiChatService
      .sendQuestion(followUpQuestion, {
        isFollowUp: true,
        ...(firstTurnConversationId ? { conversation_id: firstTurnConversationId } : {}),
      })
      .subscribe({
      next: (result: AiChatResponse) => {
        console.log('==== AskMarketsenseModal follow-up AiChatResponse ====:', result);
        console.log('[AskMarketsenseModal] conversation_id (follow-up response):', result.conversation_id);
        this._localAnalyses = [...this._localAnalyses, this.toAnalysisResult(result)];
        this.isWaitingForResponse = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.errorMessage = this.resolveAiChatErrorMessage(err);
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
    this.conversationThreadCleared = true;
    this.cdr.markForCheck();
    this.clearAnalysis.emit();
  }

  onExpandAndDownload(analysis: AnalysisResult): void {
    this.expandedAnalysis = analysis;
    this.isVisualizationModalOpen = true;
    this.expandAndDownload.emit();
  }

  /** Download chart PNG without opening the expanded visualization modal. */
  exportVisualizationPngInline(analysis: AnalysisResult): void {
    const clean = this.cleanVisualizationBase64ForPdf(analysis.visualization_image_base64);
    if (!clean) return;
    const dataUrl = this.buildVisualizationDataUrlForPdf(clean);
    const filename = this.safeVizFilename(analysis, 'png');
    void loadImageFromDataUrl(dataUrl)
      .then((img) => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        if (canvas.toBlob) {
          canvas.toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
          }, 'image/png');
        } else {
          const link = document.createElement('a');
          link.href = canvas.toDataURL('image/png');
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      })
      .catch(() => this.downloadVisualizationRawBlobFallback(clean, filename, 'image/png'));
  }

  /** Download chart as a single-page PDF without opening the expanded modal. */
  exportVisualizationPdfInline(analysis: AnalysisResult): void {
    const clean = this.cleanVisualizationBase64ForPdf(analysis.visualization_image_base64);
    if (!clean) return;
    const dataUrl = this.buildVisualizationDataUrlForPdf(clean);
    const filename = this.safeVizFilename(analysis, 'pdf');
    void loadImageFromDataUrl(dataUrl)
      .then((img) => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0);
        const pngDataUrl = canvas.toDataURL('image/png');
        const pdf = new jsPDF({
          orientation: w > h ? 'landscape' : 'portrait',
          unit: 'px',
          format: [w, h],
        });
        pdf.addImage(pngDataUrl, 'PNG', 0, 0, w, h);
        pdf.save(filename);
      })
      .catch(() => {
        try {
          const mime = this.sniffImageMimeFromBase64(clean);
          const fmt = mime === 'image/jpeg' ? 'JPEG' : 'PNG';
          const dataUrl = `${mime};base64,${clean}`;
          const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'px',
            format: [800, 600],
          });
          pdf.addImage(dataUrl, fmt, 0, 0, 800, 600);
          pdf.save(filename);
        } catch {
          /* ignore */
        }
      });
  }

  private safeVizFilename(analysis: AnalysisResult, ext: string): string {
    const safeQuestion = (analysis.question ?? 'chart')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${safeQuestion || 'chart'}.${ext}`;
  }

  private downloadVisualizationRawBlobFallback(clean: string, filename: string, mimeFallback: string): void {
    try {
      const bin = atob(clean);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const mime = this.sniffImageMimeFromBase64(clean);
      const blob = new Blob([bytes], { type: mime || mimeFallback });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }

  onExpandQueryResults(analysis: AnalysisResult): void {
    this.expandedTableAnalysis = analysis;
    this.isQueryResultsModalOpen = true;
    this.expandAndDownload.emit();
  }

  closeQueryResultsModal(): void {
    this.isQueryResultsModalOpen = false;
    this.expandedTableAnalysis = null;
  }

  onDownloadQueryResultsCsv(): void {
    this.exportQueryResultsToCsv(this.expandedTableAnalysis);
  }

  /**
   * Value as written to CSV: raw data (unformatted) so Excel and similar tools can treat numeric columns as numbers.
   * Differs from {@link formatCellValue}, which uses currency and human-readable dates for on-screen display.
   */
  /**
   * CSV cell: raw numbers (Excel-friendly) and human-readable dates matching {@link formatCellValue} / the table.
   */
  private serializeQueryResultCsvValue(key: string, value: unknown): string {
    if (value == null) {
      return '';
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? String(value) : '';
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    const date = this.toDate(value);
    if (date) {
      return this.formatQueryTableDateString(key, date);
    }
    if (typeof value === 'string') {
      return value;
    }
    return String(value);
  }

  /** Export query results to CSV (inline table or expanded modal). */
  exportQueryResultsToCsv(analysis: AnalysisResult | null | undefined): void {
    const columns = analysis?.columns ?? [];
    const rows = analysis?.rows ?? [];
    if (!columns.length || !rows.length) return;

    const escape = (v: string): string => {
      const s = String(v);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const headerRow = columns.map((col) => escape(this.formatColumnLabel(col))).join(',');
    const dataRows = rows.map((row) =>
      columns.map((col) => escape(this.serializeQueryResultCsvValue(col, row[col]))).join(',')
    );
    const csv = [headerRow, ...dataRows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const safeQuestion = (analysis?.question ?? 'query-results')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const filename = safeQuestion ? `${safeQuestion}.csv` : 'query-results.csv';
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Question block in conversation PDF: matches in-app `.question-card` (neutral-250 background, padding, label + body). Timestamp omitted from PDF.
   */
  private drawQuestionCardInConversationPdf(
    doc: jsPDF,
    o: {
      cursorY: number;
      marginLeft: number;
      maxWidth: number;
      marginTop: number;
      marginBottom: number;
      pageHeight: () => number;
      questionTitle: string;
      question: string;
    }
  ): number {
    const pad = 16;
    const gap = 8;
    const innerW = o.maxWidth - pad * 2;
    const cardX = o.marginLeft;
    const labelLineH = 14;
    const qLineH = 16;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    const labelLines = doc.splitTextToSize(o.questionTitle.toUpperCase(), innerW) as string[];

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const qWrapped = doc.splitTextToSize(o.question, innerW) as string[];

    const firstBaseline = 9;
    let h =
      pad +
      firstBaseline +
      labelLines.length * labelLineH +
      gap +
      qWrapped.length * qLineH +
      pad +
      6;

    let y = o.cursorY;
    if (y + h > o.pageHeight() - o.marginBottom) {
      doc.addPage();
      y = o.marginTop;
    }

    doc.setFillColor(245, 241, 235);
    doc.rect(cardX, y, o.maxWidth, h, 'F');

    let ty = y + pad + firstBaseline;

    doc.setTextColor(...PDF_TEXT_MIDNIGHT_RGB);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    labelLines.forEach((line) => {
      doc.text(line, cardX + pad, ty);
      ty += labelLineH;
    });

    ty += gap;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    qWrapped.forEach((line) => {
      doc.text(line, cardX + pad, ty);
      ty += qLineH;
    });

    doc.setTextColor(...PDF_TEXT_MIDNIGHT_RGB);
    return y + h + 16;
  }

  /**
   * Exports the full visible conversation (all questions and analyses) to PDF.
   * Visualizations are rasterized to a canvas before addImage so they appear reliably in A4/pt layouts.
   */
  async exportConversationToPdf(): Promise<void> {
    const analyses = this.displayAnalyses;
    if (!analyses.length) {
      return;
    }

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4',
    });

    const marginLeft = 40;
    const marginTop = 40;
    const marginBottom = 40;
    const lineHeight = 16;
    const pageHeight = () => doc.internal.pageSize.getHeight();
    const maxWidth = doc.internal.pageSize.getWidth() - marginLeft * 2;
    let cursorY = marginTop;

    const addTextBlock = (label: string, text: string | string[] | undefined): void => {
      if (!text || (Array.isArray(text) && text.length === 0)) return;
      const content = Array.isArray(text) ? text.join('\n') : text;

      if (label) {
        if (cursorY + lineHeight > pageHeight() - marginTop) {
          doc.addPage();
          cursorY = marginTop;
        }
        doc.setTextColor(...PDF_TEXT_MIDNIGHT_RGB);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(label, marginLeft, cursorY);
        cursorY += lineHeight;
      }

      doc.setTextColor(...PDF_TEXT_MIDNIGHT_RGB);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      const wrapped = doc.splitTextToSize(content, maxWidth);
      wrapped.forEach((line: string) => {
        if (cursorY + lineHeight > pageHeight() - marginTop) {
          doc.addPage();
          cursorY = marginTop;
        }
        doc.text(line, marginLeft, cursorY);
        cursorY += lineHeight;
      });
      cursorY += lineHeight / 2;
    };

    /** Key Insights / Key Drivers: gold bullet ($secondary-colors-gold-750) + midnight body text like `.insights-list` */
    const addGoldBulletListBlock = (label: string, items: string[]): void => {
      if (!items.length) return;
      const goldR = 255;
      const goldG = 183;
      const goldB = 14;
      const bodyR = 0;
      const bodyG = 17;
      const bodyB = 63;

      if (label) {
        if (cursorY + lineHeight > pageHeight() - marginTop) {
          doc.addPage();
          cursorY = marginTop;
        }
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...PDF_TEXT_MIDNIGHT_RGB);
        doc.text(label, marginLeft, cursorY);
        cursorY += lineHeight;
      }

      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      const bullet = '\u2022';
      const gapAfterBullet = 4;
      const bulletColW = doc.getTextWidth(`${bullet} `) + gapAfterBullet;
      const textStartX = marginLeft + bulletColW;
      const textInnerW = maxWidth - bulletColW;

      for (const raw of items) {
        const item = String(raw).replace(/^\s*[•\u2022\-*]\s*/, '');
        const lines = doc.splitTextToSize(item, textInnerW) as string[];
        lines.forEach((line, lineIdx) => {
          if (cursorY + lineHeight > pageHeight() - marginTop) {
            doc.addPage();
            cursorY = marginTop;
          }
          if (lineIdx === 0) {
            doc.setTextColor(goldR, goldG, goldB);
            doc.text(bullet, marginLeft, cursorY);
          }
          doc.setTextColor(bodyR, bodyG, bodyB);
          doc.text(line, textStartX, cursorY);
          cursorY += lineHeight;
        });
      }

      doc.setTextColor(...PDF_TEXT_MIDNIGHT_RGB);
      cursorY += lineHeight / 2;
    };

    doc.setTextColor(...PDF_TEXT_MIDNIGHT_RGB);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('MarketSense AI Conversation', marginLeft, cursorY);
    cursorY += lineHeight * 2;

    for (let index = 0; index < analyses.length; index++) {
      const analysis = analyses[index];
      if (index > 0 && cursorY + lineHeight * 4 > pageHeight() - marginTop) {
        doc.addPage();
        cursorY = marginTop;
      }

      const questionTitle = index === 0 ? 'Question' : `Follow-up Question ${index}`;
      cursorY = this.drawQuestionCardInConversationPdf(doc, {
        cursorY,
        marginLeft,
        maxWidth,
        marginTop,
        marginBottom,
        pageHeight,
        questionTitle,
        question: analysis.question,
      });
      addTextBlock(
        analysis.isFallbackResponse ? 'Message' : 'AI-Generated Summary',
        analysis.summary
      );

      if (analysis.key_points.length) {
        addGoldBulletListBlock('Key Insights', analysis.key_points);
      }

      if (analysis.key_drivers.length) {
        addGoldBulletListBlock('Key Drivers', analysis.key_drivers);
      }

      if (analysis.columns?.length && analysis.rows?.length) {
        const columns = analysis.columns;
        const rows = analysis.rows;

        if (cursorY + lineHeight * 4 > pageHeight() - marginTop) {
          doc.addPage();
          cursorY = marginTop;
        }

        doc.setTextColor(...PDF_TEXT_MIDNIGHT_RGB);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Query Results', marginLeft, cursorY);
        cursorY += lineHeight;

        doc.setTextColor(...PDF_TEXT_MIDNIGHT_RGB);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');

        const maxPreviewRows = 10;
        const previewRows = rows.slice(0, maxPreviewRows);
        const colCount = columns.length;
        const colWidth = maxWidth / colCount;

        const headerY = cursorY;
        columns.forEach((col, colIndex) => {
          const x = marginLeft + colIndex * colWidth;
          const headerLabel = this.formatColumnLabel(col);
          doc.setFont('helvetica', 'bold');
          doc.text(headerLabel, x, headerY);
        });
        cursorY += lineHeight;

        doc.setDrawColor(200);
        doc.setLineWidth(0.5);
        doc.line(
          marginLeft,
          cursorY - lineHeight / 2,
          marginLeft + colWidth * colCount,
          cursorY - lineHeight / 2
        );

        doc.setFont('helvetica', 'normal');

        previewRows.forEach((row) => {
          if (cursorY + lineHeight > pageHeight() - marginTop) {
            doc.addPage();
            cursorY = marginTop;
            const newHeaderY = cursorY;
            columns.forEach((col, colIndex) => {
              const x = marginLeft + colIndex * colWidth;
              const headerLabel = this.formatColumnLabel(col);
              doc.setFont('helvetica', 'bold');
              doc.text(headerLabel, x, newHeaderY);
            });
            cursorY += lineHeight;
            doc.setDrawColor(200);
            doc.setLineWidth(0.5);
            doc.line(
              marginLeft,
              cursorY - lineHeight / 2,
              marginLeft + colWidth * colCount,
              cursorY - lineHeight / 2
            );
            doc.setFont('helvetica', 'normal');
          }

          const wrappedPerColumn: string[][] = columns.map((col) => {
            const cellText = this.formatCellValue(col, row[col]);
            return doc.splitTextToSize(cellText, colWidth - 4) as string[];
          });

          const maxLines = wrappedPerColumn.reduce(
            (max, arr) => Math.max(max, arr.length),
            1
          );

          for (let lineIndex = 0; lineIndex < maxLines; lineIndex++) {
            if (cursorY + lineHeight > pageHeight() - marginTop) {
              doc.addPage();
              cursorY = marginTop;
              const newHeaderY2 = cursorY;
              columns.forEach((col, colIndex) => {
                const x = marginLeft + colIndex * colWidth;
                const headerLabel = this.formatColumnLabel(col);
                doc.setFont('helvetica', 'bold');
                doc.text(headerLabel, x, newHeaderY2);
              });
              cursorY += lineHeight;
              doc.setDrawColor(200);
              doc.setLineWidth(0.5);
              doc.line(
                marginLeft,
                cursorY - lineHeight / 2,
                marginLeft + colWidth * colCount,
                cursorY - lineHeight / 2
              );
              doc.setFont('helvetica', 'normal');
            }

            columns.forEach((_, colIndex) => {
              const x = marginLeft + colIndex * colWidth;
              const linesForCol = wrappedPerColumn[colIndex];
              const lineText = linesForCol[lineIndex] ?? '';
              if (lineText) {
                doc.text(lineText, x, cursorY);
              }
            });

            cursorY += lineHeight;
          }
        });

        if (rows.length > maxPreviewRows) {
          if (cursorY + lineHeight > pageHeight() - marginTop) {
            doc.addPage();
            cursorY = marginTop;
          }
          doc.setTextColor(...PDF_TEXT_MIDNIGHT_RGB);
          doc.text(`(+${rows.length - maxPreviewRows} more rows in app)`, marginLeft, cursorY);
          cursorY += lineHeight;
        }
      }

      const vizB64Clean = this.cleanVisualizationBase64ForPdf(analysis.visualization_image_base64);
      if (vizB64Clean) {
        const dataUrl = this.buildVisualizationDataUrlForPdf(vizB64Clean);
        try {
          let iw: number;
          let ih: number;
          try {
            const props = doc.getImageProperties(dataUrl);
            iw = props.width;
            ih = props.height;
          } catch {
            const img = await loadImageFromDataUrl(dataUrl);
            iw = img.naturalWidth || 1;
            ih = img.naturalHeight || 1;
          }
          if (iw < 1 || ih < 1 || !Number.isFinite(iw) || !Number.isFinite(ih)) {
            throw new Error('invalid image dimensions');
          }
          const headerH = lineHeight * 1.5;
          const availH = () => pageHeight() - cursorY - marginBottom - headerH;
          /** Allow modest upscaling so small backend thumbnails fill the content width (was capped at 1, which kept charts fuzzy/small). */
          const maxScaleUp = 6;
          let scale = Math.min(maxWidth / iw, Math.max(80, availH()) / ih, maxScaleUp);
          let imgW = iw * scale;
          let imgH = ih * scale;
          if (cursorY + headerH + imgH > pageHeight() - marginBottom) {
            doc.addPage();
            cursorY = marginTop;
          }
          scale = Math.min(maxWidth / iw, Math.max(80, availH()) / ih, maxScaleUp);
          imgW = iw * scale;
          imgH = ih * scale;
          const imgWpt = Math.max(1, Math.round(imgW));
          const imgHpt = Math.max(1, Math.round(imgH));
          const canvas = await this.rasterizeDataUrlToCanvasForPdf(dataUrl, imgWpt, imgHpt);
          doc.setTextColor(...PDF_TEXT_MIDNIGHT_RGB);
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.text('Visualization', marginLeft, cursorY);
          cursorY += headerH;
          const imgY = Math.round(cursorY);
          doc.addImage(canvas, 'PNG', marginLeft, imgY, imgWpt, imgHpt);
          cursorY += imgHpt + lineHeight;
        } catch (e) {
          console.warn('Ask MarketSense: conversation PDF visualization embed failed', e);
          addTextBlock(
            'Visualization',
            'A chart was available for this answer but could not be embedded in the PDF. Use PNG/PDF export from Expand & Download if needed.'
          );
        }
      } else if (analysis.visualization_message?.trim()) {
        addTextBlock('Visualization', analysis.visualization_message.trim());
      }

      cursorY += lineHeight;
    }

    doc.save('marketsense-conversation.pdf');
  }

  /** Strip whitespace and data-URL wrapper so backend payloads embed reliably in PDFs. */
  private cleanVisualizationBase64ForPdf(raw: string | undefined): string {
    const coerced = coerceVisualizationImageBase64Payload(raw);
    const s = (coerced ?? String(raw ?? '').replace(/^data:image\/\w+;base64,/i, '')).replace(/\s/g, '');
    return s.trim();
  }

  private buildVisualizationDataUrlForPdf(base64Clean: string): string {
    const mime = this.sniffImageMimeFromBase64(base64Clean);
    return `data:${mime};base64,${base64Clean}`;
  }

  private sniffImageMimeFromBase64(b64: string): string {
    try {
      const mod = b64.length % 4;
      const pad = mod ? '='.repeat(4 - mod) : '';
      const bin = atob(b64.slice(0, 48) + pad);
      const u0 = bin.charCodeAt(0);
      const u1 = bin.charCodeAt(1);
      if (u0 === 0xff && u1 === 0xd8) return 'image/jpeg';
      if (u0 === 0x89 && u1 === 0x50) return 'image/png';
      if (u0 === 0x47 && u1 === 0x49) return 'image/gif';
    } catch {
      /* ignore */
    }
    return 'image/png';
  }

  /**
   * Rasterize chart for PDF at higher pixel density than the final pt size so viewers/prints look sharp
   * (1 canvas px per 1 PDF pt ≈ 72 PPI — too soft; 3× gives ~216 PPI equivalent when scaled in the PDF).
   */
  private rasterizeDataUrlToCanvasForPdf(
    dataUrl: string,
    destWPt: number,
    destHPt: number
  ): Promise<HTMLCanvasElement> {
    const wPt = Math.max(1, Math.round(destWPt));
    const hPt = Math.max(1, Math.round(destHPt));
    const maxCanvasDim = 6144;
    let pixelRatio = 3;
    let pxW = Math.max(1, Math.round(wPt * pixelRatio));
    let pxH = Math.max(1, Math.round(hPt * pixelRatio));
    if (pxW > maxCanvasDim || pxH > maxCanvasDim) {
      pixelRatio = Math.min(maxCanvasDim / wPt, maxCanvasDim / hPt, pixelRatio);
      pxW = Math.max(1, Math.round(wPt * pixelRatio));
      pxH = Math.max(1, Math.round(hPt * pixelRatio));
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = pxW;
        canvas.height = pxH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('canvas 2d'));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, pxW, pxH);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, pxW, pxH);
        resolve(canvas);
      };
      img.onerror = () => reject(new Error('visualization image decode failed'));
      img.src = dataUrl;
    });
  }

  onDownloadPng(): void {
    // Try exporting from the rendered <img> element first (works for both backend and placeholder images)
    const imgEl = document.querySelector('.visualization-modal .visualization-chart-large img.chart-large-placeholder-img') as
      | HTMLImageElement
      | null;

    const safeQuestion = (this.expandedAnalysis?.question ?? 'chart')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const filename = safeQuestion ? `${safeQuestion}.png` : 'chart.png';

    if (imgEl && imgEl.naturalWidth && imgEl.naturalHeight) {
      const canvas = document.createElement('canvas');
      canvas.width = imgEl.naturalWidth;
      canvas.height = imgEl.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return;
      }
      ctx.drawImage(imgEl, 0, 0);

      if (canvas.toBlob) {
        canvas.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }, 'image/png');
      } else {
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      return;
    }

    // Fallback: use base64 data from the analysis if available
    const base64 = this.expandedAnalysis?.visualization_image_base64;
    if (!base64) {
      return;
    }

    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/png' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  onDownloadPdf(): void {
    const imgEl = document.querySelector('.visualization-modal .visualization-chart-large img.chart-large-placeholder-img') as
      | HTMLImageElement
      | null;

    const safeQuestion = (this.expandedAnalysis?.question ?? 'chart')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const filename = safeQuestion ? `${safeQuestion}.pdf` : 'chart.pdf';

    const getImageData = (): { dataUrl: string; width: number; height: number } | null => {
      if (imgEl && imgEl.naturalWidth && imgEl.naturalHeight) {
        const canvas = document.createElement('canvas');
        canvas.width = imgEl.naturalWidth;
        canvas.height = imgEl.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(imgEl, 0, 0);
        return {
          dataUrl: canvas.toDataURL('image/png'),
          width: canvas.width,
          height: canvas.height,
        };
      }
      const base64 = this.expandedAnalysis?.visualization_image_base64;
      if (!base64) return null;
      const dataUrl = `data:image/png;base64,${base64}`;
      return { dataUrl, width: 800, height: 600 };
    };

    const imageData = getImageData();
    if (!imageData) return;

    const { dataUrl, width, height } = imageData;
    const pdf = new jsPDF({
      orientation: width > height ? 'landscape' : 'portrait',
      unit: 'px',
      format: [width, height],
    });
    pdf.addImage(dataUrl, 'PNG', 0, 0, width, height);
    pdf.save(filename);
  }

  closeVisualizationModal(): void {
    this.isVisualizationModalOpen = false;
    this.expandedAnalysis = null;
  }

  toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed;
  }
}


/* eslint-disable */
import {
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';

export interface MinFlowRange {
  startIndex: number;
  endIndex: number;
}

@Component({
  selector: 'app-min-flow-range-slider',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './min-flow-range-slider.component.html',
  styleUrl: './min-flow-range-slider.component.scss',
})
export class MinFlowRangeSliderComponent implements OnChanges {
  private static readonly DEFAULT_TRACK_WIDTH = 320;

  @Input({ required: true }) options!: { value: number; label: string }[];
  @Input() range: MinFlowRange = { startIndex: 0, endIndex: 0 };
  /** When false, hides the summary row (e.g. filters bar — match Time Horizon card height). */
  @Input() showFlowSummary = true;
  @Output() rangeChange = new EventEmitter<MinFlowRange>();

  @HostBinding('class.min-flow-range--filters-compact')
  get filtersCompactClass(): boolean {
    return !this.showFlowSummary;
  }

  @ViewChild('sliderContainer', { static: false }) sliderContainer?: ElementRef<HTMLElement>;

  private isDragging = false;
  private dragType: 'start' | 'end' | null = null;
  private hasDragged = false;
  private dragContainer: HTMLElement | null = null;
  private lastTrackMousedownAt: number | null = null;
  /** Snapshot while dragging so handle positions stay in sync before parent CD runs. */
  private dragSnapshot: MinFlowRange | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['options'] && this.options.length > 0) {
      this.clampAndEmitRangeIfNeeded();
    }
  }

  get numSteps(): number {
    const n = this.options.length;
    return Math.max(1, n - 1);
  }

  private get activeRange(): MinFlowRange {
    return this.dragSnapshot ?? this.range;
  }

  /** For template / ARIA while dragging before parent input updates. */
  get displayStartIndex(): number {
    return this.activeRange.startIndex;
  }

  get displayEndIndex(): number {
    return this.activeRange.endIndex;
  }

  get startLabel(): string {
    const raw = this.options[this.activeRange.startIndex]?.label ?? '';
    return this.formatMinLabel(raw);
  }

  /**
   * Upper-bound copy for the end handle: chart filtering uses this as max ($B inclusive),
   * so we show ≤… / “No max”, not the option’s “≥ …” minimum-threshold wording.
   */
  get endLabel(): string {
    const opts = this.options;
    const endIdx = this.activeRange.endIndex;
    if (!opts.length) return '';
    const last = opts.length - 1;
    if (endIdx >= last) return 'Max';
    const val = opts[endIdx]?.value;
    if (val == null || !Number.isFinite(val)) return '';
    return this.formatUpperBoundLabel(val);
  }

  private formatUpperBoundLabel(valueBn: number): string {
    if (valueBn <= 0) return 'Max';
    if (valueBn < 1) {
      const m = valueBn * 1000;
      const s = Number.isInteger(m) ? String(m) : m.toFixed(0);
      return `$${s}M`;
    }
    const s = Number.isInteger(valueBn)
      ? valueBn.toLocaleString('en-US')
      : valueBn.toLocaleString('en-US', { maximumFractionDigits: 2 });
    return `$${s}B`;
  }

  getHandlePosition(type: 'start' | 'end'): number {
    const idx = type === 'start' ? this.activeRange.startIndex : this.activeRange.endIndex;
    const w = this.getTrackWidth();
    return (idx / this.numSteps) * w;
  }

  getActiveTrackLeft(): number {
    return this.getHandlePosition('start');
  }

  getActiveTrackWidth(): number {
    return Math.max(0, this.getHandlePosition('end') - this.getHandlePosition('start'));
  }

  dotLeftPercent(i: number): number {
    return (i / this.numSteps) * 100;
  }

  get labelStops(): Array<{ index: number; label: string; leftPercent: number }> {
    const opts = this.options;
    if (!opts.length) return [];

    const last = opts.length - 1;
    if (last <= 0) {
      return [
        {
          index: 0,
          label: opts[0]?.label ?? '',
          leftPercent: this.dotLeftPercent(0),
        },
      ];
    }

    // Min flow has many steps; show a small, evenly spaced set (similar vibe to Time Horizon).
    const maxLabels = 5;
    const desired = Math.min(maxLabels, opts.length);
    const indices = new Set<number>();
    indices.add(0);
    indices.add(last);

    if (desired >= 3) indices.add(Math.round(last / 2));
    if (desired >= 4) indices.add(Math.round(last / 4));
    if (desired >= 5) indices.add(Math.round((last * 3) / 4));

    return Array.from(indices)
      .filter((i) => i >= 0 && i <= last)
      .sort((a, b) => a - b)
      .map((i) => ({
        index: i,
        label: this.formatMinLabel(opts[i]?.label ?? ''),
        leftPercent: this.dotLeftPercent(i),
      }));
  }

  private formatMinLabel(raw: string): string {
    // Options are authored like "≥ $50M". For this slider's UI we want "$50M".
    const cleaned = (raw ?? '').replace(/^\s*≥\s*/u, '').trim();
    if (cleaned.toLowerCase() === 'all flows') return '$0';
    return cleaned;
  }

  startDrag(event: MouseEvent | TouchEvent, type: 'start' | 'end'): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
    this.hasDragged = false;
    this.dragType = type;
    const target = event.target as HTMLElement;
    this.dragContainer =
      this.sliderContainer?.nativeElement ??
      target?.closest('.min-flow-range-container') ??
      null;
    this.dragSnapshot = {
      startIndex: this.range.startIndex,
      endIndex: this.range.endIndex,
    };
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.add('min-flow-range-dragging');
    }
    this.handleDrag(event);
  }

  onTrackClick(event: MouseEvent | TouchEvent): void {
    if (this.hasDragged || this.isDragging) return;
    const target = event.target as HTMLElement;
    if (target?.closest?.('.min-flow-range-handle')) return;

    if (event.type === 'click' && (event as MouseEvent).detail === 1) {
      const now = Date.now();
      if (this.lastTrackMousedownAt != null && now - this.lastTrackMousedownAt < 300) {
        return;
      }
    }
    if (event.type === 'mousedown') {
      this.lastTrackMousedownAt = Date.now();
    }

    event.preventDefault();
    event.stopPropagation();

    const container =
      this.sliderContainer?.nativeElement ?? (event.currentTarget as HTMLElement);
    if (!container) return;

    const rect = container.getBoundingClientRect();
    let clientX: number;
    if ('touches' in event || 'changedTouches' in event) {
      const te = event as TouchEvent;
      clientX = te.changedTouches?.[0]?.clientX ?? te.touches?.[0]?.clientX ?? 0;
    } else {
      clientX = (event as MouseEvent).clientX;
    }

    const trackWidth = rect.width > 0 ? rect.width : MinFlowRangeSliderComponent.DEFAULT_TRACK_WIDTH;
    const x = Math.max(0, Math.min(trackWidth, clientX - rect.left));
    const percentage = (x / trackWidth) * 100;
    const stepIndex = Math.round((percentage / 100) * this.numSteps);
    const clickedIndex = Math.max(0, Math.min(this.numSteps, stepIndex));

    const startDistance = Math.abs(clickedIndex - this.range.startIndex);
    const endDistance = Math.abs(clickedIndex - this.range.endIndex);

    const r = this.activeRange;
    if (startDistance <= endDistance) {
      this.emitRange({
        startIndex: Math.min(clickedIndex, r.endIndex),
        endIndex: r.endIndex,
      });
    } else {
      this.emitRange({
        startIndex: r.startIndex,
        endIndex: Math.max(clickedIndex, r.startIndex),
      });
    }
  }

  @HostListener('document:mousemove', ['$event'])
  @HostListener('document:touchmove', ['$event'])
  onDocumentMove(event: MouseEvent | TouchEvent): void {
    if (!this.isDragging) return;
    if (event.cancelable) event.preventDefault();
    this.handleDrag(event);
  }

  @HostListener('document:mouseup')
  @HostListener('document:touchend')
  onDocumentUp(): void {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.dragType = null;
    this.dragContainer = null;
    this.dragSnapshot = null;
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('min-flow-range-dragging');
    }
    setTimeout(() => {
      this.hasDragged = false;
    }, 100);
  }

  private handleDrag(event: MouseEvent | TouchEvent): void {
    const container = this.dragContainer ?? this.sliderContainer?.nativeElement;
    if (!this.dragType || !container) return;

    const rect = container.getBoundingClientRect();
    const clientX =
      'touches' in event && event.touches?.length
        ? event.touches[0].clientX
        : (event as MouseEvent).clientX;
    if (clientX == null) return;

    const trackWidth = rect.width > 0 ? rect.width : MinFlowRangeSliderComponent.DEFAULT_TRACK_WIDTH;
    const x = Math.max(0, Math.min(trackWidth, clientX - rect.left));
    const percentage = (x / trackWidth) * 100;
    const stepIndex = Math.round((percentage / 100) * this.numSteps);
    const clampedIndex = Math.max(0, Math.min(this.numSteps, stepIndex));
    const r = this.dragSnapshot ?? this.range;

    if (this.dragType === 'start') {
      const next = {
        startIndex: Math.min(clampedIndex, r.endIndex),
        endIndex: r.endIndex,
      };
      this.dragSnapshot = next;
      this.emitRange(next);
    } else {
      const next = {
        startIndex: r.startIndex,
        endIndex: Math.max(clampedIndex, r.startIndex),
      };
      this.dragSnapshot = next;
      this.emitRange(next);
    }

    this.hasDragged = true;
  }

  private getTrackWidth(): number {
    const el = this.sliderContainer?.nativeElement;
    if (!el) return MinFlowRangeSliderComponent.DEFAULT_TRACK_WIDTH;
    const w = el.getBoundingClientRect().width;
    return w > 0 ? w : MinFlowRangeSliderComponent.DEFAULT_TRACK_WIDTH;
  }

  private clampAndEmitRangeIfNeeded(): void {
    const max = this.options.length - 1;
    if (max < 0) return;
    let start = Math.max(0, Math.min(max, this.range.startIndex));
    let end = Math.max(0, Math.min(max, this.range.endIndex));
    if (start > end) {
      const t = start;
      start = end;
      end = t;
    }
    if (start !== this.range.startIndex || end !== this.range.endIndex) {
      this.emitRange({ startIndex: start, endIndex: end });
    }
  }

  private emitRange(next: MinFlowRange): void {
    const max = Math.max(0, this.options.length - 1);
    const startIndex = Math.max(0, Math.min(max, next.startIndex));
    const endIndex = Math.max(0, Math.min(max, next.endIndex));
    const safeStart = Math.min(startIndex, endIndex);
    const safeEnd = Math.max(startIndex, endIndex);
    this.rangeChange.emit({ startIndex: safeStart, endIndex: safeEnd });
  }
}

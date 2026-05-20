import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  UNIFIED_TIME_HORIZONS,
  TIME_HORIZONS_SHORT_LABELS,
} from '../../constants/time-horizons.constants';
import formatTimeHorizonSliderHandleDate from '../../utils/time-horizon-slider-tooltip-date.util';
import { AssetFlowHistoricAnchorService } from '../../../core/services/asset-flow-historic-anchor.service';

export interface TimeHorizonRangeIndices {
  startIndex: number;
  endIndex: number;
}

@Component({
  selector: 'app-time-horizon-slider',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './time-horizon-slider.component.html',
  styleUrl: './time-horizon-slider.component.scss',
})
export class TimeHorizonSliderComponent
  implements OnInit, AfterViewInit, OnDestroy, OnChanges
{
  /**
   * @param {import('../../../core/services/asset-flow-historic-anchor.service').AssetFlowHistoricAnchorService} historicAnchor - Historic anchor used for handle tooltip dates
   * @param {import('@angular/core').ChangeDetectorRef} cdr - Change detector for layout-driven slider updates
   * @param {import('@angular/core').NgZone} ngZone - Zone used to run drag handlers outside full-app change detection
   */
  constructor(
    private readonly historicAnchor: AssetFlowHistoricAnchorService,
    private readonly cdr: ChangeDetectorRef,
    private readonly ngZone: NgZone
  ) {}

  private static readonly AXIS_INSET_DESKTOP_PX = 14;
  private static readonly AXIS_INSET_MOBILE_PX = 8;
  /**
   * Keep in sync with SCSS breakpoints:
   * `time-horizon-slider.component.scss` switches inset at max-width: 768px.
   */
  private static readonly AXIS_INSET_MOBILE_MAX_WIDTH_PX = 768;
  /** Viewports at or below this width use short tick labels and compact axis math (e.g. iPad portrait, tablets). */
  private static readonly COMPACT_AXIS_MAX_INNER_WIDTH_PX = 1024;

  readonly horizons = [...UNIFIED_TIME_HORIZONS];

  @Input({ alias: 'range', required: true }) rangeInput!: TimeHorizonRangeIndices;

  @Input() infoTooltipOpen = false;
  @Input() infoTooltipText = '';

  @Output() rangeChange = new EventEmitter<TimeHorizonRangeIndices>();
  @Output() timeHorizonChange = new EventEmitter<string>();
  @Output() timeHorizonRangeChange = new EventEmitter<{ start: string; end: string }>();
  @Output() inferredDataTypeChange = new EventEmitter<'historical' | 'forecasted'>();
  @Output() infoToggle = new EventEmitter<Event>();

  @ViewChild('timeHorizonSliderFull', { static: false }) sliderContainerRef!: ElementRef<HTMLElement>;

  private range: TimeHorizonRangeIndices = { startIndex: 6, endIndex: 7 };

  compactAxis =
    typeof window !== 'undefined' &&
    window.innerWidth <= TimeHorizonSliderComponent.COMPACT_AXIS_MAX_INNER_WIDTH_PX;
  private sliderTrackWidthFallback = 620;
  /** Set from the slider container in a microtask so layout + dev-mode CD see a stable width (NG0100). */
  private sliderOuterWidthCache = 620;
  private isDragging = false;
  private dragType: 'start' | 'end' | null = null;
  private hasDragged = false;
  private dragContainer: HTMLElement | null = null;
  private lastTrackMousedownAt: number | null = null;
  private documentCaptureListener = (e: MouseEvent | TouchEvent) => this.onDocumentCapture(e);

  get todayIndex(): number {
    return this.horizons.indexOf('0');
  }

  ngOnInit(): void {
    this.applyRangeInput();
    if (typeof document !== 'undefined') {
      document.addEventListener('mousedown', this.documentCaptureListener, true);
      document.addEventListener('touchstart', this.documentCaptureListener, true);
    }
    this.refreshCompactAxis();
  }

  /**
   * @returns {void}
   */
  ngAfterViewInit(): void {
    // Reading getBoundingClientRect in the same CD pass as the first paint can differ between
    // dev-mode’s double check; defer the first real measure until after the current turn.
    queueMicrotask(() => {
      this.syncSliderOuterWidthFromElement();
      this.cdr.markForCheck();
    });
  }

  /**
   * Applies parent range input when it changes.
   *
   * @param {import('@angular/core').SimpleChanges} changes - Current and previous input property values
   * @returns {void}
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['rangeInput']) {
      this.applyRangeInput();
    }
  }

  ngOnDestroy(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener('mousedown', this.documentCaptureListener, true);
      document.removeEventListener('touchstart', this.documentCaptureListener, true);
      if (document.body) document.body.classList.remove('time-horizon-dragging');
    }
  }

  private applyRangeInput(): void {
    const r = this.rangeInput;
    if (!r || typeof r.startIndex !== 'number' || typeof r.endIndex !== 'number') return;
    this.range = { startIndex: r.startIndex, endIndex: r.endIndex };
  }

  /**
   * @param {Event} ev - Click event from the info button
   * @returns {void}
   */
  onInfoButtonClick(ev: Event): void {
    ev.stopPropagation();
    this.infoToggle.emit(ev);
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.refreshCompactAxis();
    this.syncSliderOuterWidthFromElement();
    this.cdr.markForCheck();
  }

  /**
   * @returns {void}
   */
  private refreshCompactAxis(): void {
    if (typeof window === 'undefined') return;
    const next = window.innerWidth <= TimeHorizonSliderComponent.COMPACT_AXIS_MAX_INNER_WIDTH_PX;
    if (next !== this.compactAxis) this.compactAxis = next;
  }

  /**
   * @param {number} index - Horizon milestone index on the axis
   * @returns {string} Full or short tick label for the milestone
   */
  tickLabel(index: number): string {
    const full = this.horizons[index];
    if (full == null) return '';
    // The anchor marker is drawn via CSS for perfect centering; keep label text empty.
    if (full === '0') return '';
    if (!this.compactAxis) return full;
    return TIME_HORIZONS_SHORT_LABELS[index] ?? full;
  }

  /**
   * CSS transform for axis tick labels. Last and second-to-last milestones are nudged right
   * so labels sit slightly inside the card; compact mode uses a right-anchored transform for the last tick.
   *
   * @param {number} index - Horizon milestone index on the axis
   * @returns {string} CSS transform value for the tick label
   */
  axisLabelTransform(index: number): string {
    const last = this.horizons.length - 1;
    const secondToLast = last - 1;
    const nudgeSecondToLast = last >= 2 && index === secondToLast;
    if (this.compactAxis) {
      if (index === 0) return 'translateX(0)';
      if (index === last) return 'translateX(calc(-100% + 8px))';
      if (nudgeSecondToLast) return 'translateX(calc(-50% + 5px))';
      return 'translateX(-50%)';
    }
    if (index === last) return 'translateX(calc(-50% + 8px))';
    if (nudgeSecondToLast) return 'translateX(calc(-50% + 5px))';
    return 'translateX(-50%)';
  }

  /**
   * @param {number} index - Horizon milestone index on the axis
   * @returns {boolean} Whether the tick label matches the start or end handle
   */
  isLabelActive(index: number): boolean {
    return index === this.range.startIndex || index === this.range.endIndex;
  }

  /**
   * @param {number} index - Horizon milestone index on the axis
   * @returns {boolean} Whether the tick lies between the selected start and end indices
   */
  isTickInActiveRange(index: number): boolean {
    const { startIndex, endIndex } = this.range;
    return index >= startIndex && index <= endIndex;
  }

  /**
   * @returns {boolean} Whether start and end handle tooltips would overlap
   */
  tooltipsTooClose(): boolean {
    const { startIndex, endIndex } = this.range;
    if (startIndex === endIndex) return false;
    const a = this.milestoneCenterPx(startIndex);
    const b = this.milestoneCenterPx(endIndex);
    return Math.abs(a - b) < 120;
  }

  /**
   * @param {number} index - Horizon milestone index on the axis
   * @returns {number} Horizontal center position of the milestone in pixels
   */
  milestoneCenterPx(index: number): number {
    const numSteps = this.horizons.length - 1;
    if (numSteps <= 0) return 0;
    const outer = this.getSliderOuterWidthPx();
    const { inset, trackWidth } = this.getAxisMetrics(outer);
    return inset + (index / numSteps) * trackWidth;
  }

  /**
   * @returns {void}
   */
  private syncSliderOuterWidthFromElement(): void {
    const el = this.sliderContainerRef?.nativeElement;
    if (!el) return;
    const w = el.getBoundingClientRect().width;
    if (w > 0) this.sliderOuterWidthCache = w;
  }

  /**
   * @returns {number} Cached outer width of the slider container in pixels
   */
  private getSliderOuterWidthPx(): number {
    return this.sliderOuterWidthCache;
  }

  /**
   * @param {number} containerWidth - Outer width of the slider container in pixels
   * @returns {{ inset: number; trackWidth: number }} Axis inset and usable track width
   */
  private getAxisMetrics(containerWidth: number): { inset: number; trackWidth: number } {
    // IMPORTANT: Inset breakpoint must match the CSS track inset breakpoint (768px),
    // not the compact-axis label breakpoint (1024px), otherwise labels drift vs tick marks.
    const useMobileInset =
      typeof window !== 'undefined' &&
      window.innerWidth <= TimeHorizonSliderComponent.AXIS_INSET_MOBILE_MAX_WIDTH_PX;
    const inset = useMobileInset
      ? TimeHorizonSliderComponent.AXIS_INSET_MOBILE_PX
      : TimeHorizonSliderComponent.AXIS_INSET_DESKTOP_PX;
    const trackWidth = Math.max(0, containerWidth - 2 * inset);
    return { inset, trackWidth };
  }

  /**
   * @returns {number} Usable inner track width in pixels
   */
  private getTrackInnerWidthPx(): number {
    return this.getAxisMetrics(this.getSliderOuterWidthPx()).trackWidth;
  }

  /**
   * @param {'start' | 'end'} type - Which range handle to format for the tooltip
   * @returns {string} Formatted date label for the handle tooltip
   */
  handleTooltipDate(type: 'start' | 'end'): string {
    const idx = type === 'start' ? this.range.startIndex : this.range.endIndex;
    const label = this.horizons[idx];
    return label ? formatTimeHorizonSliderHandleDate(label, this.historicAnchor.getAnchor()) : '';
  }

  /**
   * @param {'start' | 'end'} type - Which range handle to position
   * @returns {number} Horizontal position of the handle in pixels
   */
  getHandlePosition(type: 'start' | 'end'): number {
    const index = type === 'start' ? this.range.startIndex : this.range.endIndex;
    return this.milestoneCenterPx(index);
  }

  /**
   * @returns {number} Left offset of the active range segment in pixels
   */
  getActiveTrackLeft(): number {
    const numSteps = this.horizons.length - 1;
    const inner = this.getTrackInnerWidthPx();
    return (this.range.startIndex / numSteps) * inner;
  }

  /**
   * @returns {number} Width of the active range segment in pixels
   */
  getActiveTrackWidth(): number {
    const numSteps = this.horizons.length - 1;
    const span = this.range.endIndex - this.range.startIndex;
    const inner = this.getTrackInnerWidthPx();
    return (span / numSteps) * inner;
  }

  /**
   * @param {MouseEvent | TouchEvent} event - Pointer event that started the drag
   * @param {'start' | 'end'} type - Which range handle is being dragged
   * @returns {void}
   */
  startDrag(event: MouseEvent | TouchEvent, type: 'start' | 'end'): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
    this.hasDragged = false;
    this.dragType = type;
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.add('time-horizon-dragging');
    }
    if (this.sliderContainerRef?.nativeElement) {
      this.dragContainer = this.sliderContainerRef.nativeElement;
    } else {
      const target = event.target as HTMLElement;
      this.dragContainer =
        target?.closest('.time-horizon-slider-container, .time-horizon-slider-container-full') ??
        target?.parentElement ??
        null;
    }
    this.handlePointerDrag(event);
  }

  /**
   * @param {MouseEvent | TouchEvent} event - Pointer event on the slider track
   * @returns {void}
   */
  onTrackClick(event: MouseEvent | TouchEvent): void {
    if (this.hasDragged || this.isDragging) return;
    const target = event.target as HTMLElement;
    if (target?.closest?.('.time-horizon-handle')) return;
    if (target?.closest?.('.time-horizon-labels')) return;

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
      this.sliderContainerRef?.nativeElement ?? (event.currentTarget as HTMLElement);
    if (!container) return;
    this.applyTrackClick(event, container);
  }

  /**
   * @param {MouseEvent | TouchEvent} event - Pointer event on the slider track
   * @param {HTMLElement} container - Slider container element used for position math
   * @returns {void}
   */
  private applyTrackClick(event: MouseEvent | TouchEvent, container: HTMLElement): void {
    const rect = container.getBoundingClientRect();
    let clientX: number;
    if ('touches' in event || 'changedTouches' in event) {
      const te = event as TouchEvent;
      clientX = te.changedTouches?.[0]?.clientX ?? te.touches?.[0]?.clientX ?? 0;
    } else {
      clientX = (event as MouseEvent).clientX;
    }
    const x = clientX - rect.left;
    const { inset, trackWidth } = this.getAxisMetrics(
      rect.width > 0 ? rect.width : this.sliderTrackWidthFallback
    );
    const xAdjusted = Math.max(0, Math.min(x - inset, trackWidth));
    const percentage = trackWidth > 0 ? Math.max(0, Math.min(100, (xAdjusted / trackWidth) * 100)) : 0;
    const numSteps = this.horizons.length - 1;
    const stepIndex = Math.round((percentage / 100) * numSteps);
    const clickedIndex = Math.max(0, Math.min(numSteps, stepIndex));
    const startDistance = Math.abs(clickedIndex - this.range.startIndex);
    const endDistance = Math.abs(clickedIndex - this.range.endIndex);

    if (startDistance <= endDistance) {
      this.range = {
        startIndex: Math.min(clickedIndex, this.range.endIndex),
        endIndex: this.range.endIndex,
      };
    } else {
      this.range = {
        startIndex: this.range.startIndex,
        endIndex: Math.max(clickedIndex, this.range.startIndex),
      };
    }
    this.publishRange();
  }

  /**
   * @param {number} index - Horizon milestone index clicked on the axis
   * @param {Event} [event] - Optional DOM event to stop propagation
   * @returns {void}
   */
  onLabelClick(index: number, event?: Event): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (this.hasDragged || this.isDragging) return;

    const numSteps = this.horizons.length - 1;
    const clickedIndex = Math.max(0, Math.min(numSteps, index));
    const startDistance = Math.abs(clickedIndex - this.range.startIndex);
    const endDistance = Math.abs(clickedIndex - this.range.endIndex);

    if (startDistance <= endDistance) {
      this.range = {
        startIndex: Math.min(clickedIndex, this.range.endIndex),
        endIndex: this.range.endIndex,
      };
    } else {
      this.range = {
        startIndex: this.range.startIndex,
        endIndex: Math.max(clickedIndex, this.range.startIndex),
      };
    }
    this.publishRange();
  }

  @HostListener('document:mousemove', ['$event'])
  @HostListener('document:touchmove', ['$event'])
  /**
   * @param {MouseEvent | TouchEvent} event - Document-level pointer move while dragging
   * @returns {void}
   */
  onDocumentMove(event: MouseEvent | TouchEvent): void {
    if (!this.isDragging) return;
    if (event.cancelable) event.preventDefault();
    // Avoid running full-app change detection on every pointer move (filters bar + charts).
    this.ngZone.runOutsideAngular(() => {
      this.handlePointerDrag(event);
      this.cdr.detectChanges();
    });
  }

  @HostListener('document:mouseup')
  @HostListener('document:touchend')
  /**
   * @returns {void}
   */
  onDocumentUp(): void {
    if (!this.isDragging) return;
    const rangeAtEnd = { ...this.range };
    this.isDragging = false;
    this.dragType = null;
    this.dragContainer = null;
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('time-horizon-dragging');
    }
    // During drag we skipped rangeChange so parent CD did not run every frame; sync indices once.
    this.rangeChange.emit(rangeAtEnd);
    // Heavy outputs (dashboard / Sankey) were deferred from every mousemove for the same reason.
    this.emitHeavyTimeHorizonOutputs(rangeAtEnd);
    setTimeout(() => {
      this.hasDragged = false;
    }, 100);
  }

  /**
   * @param {MouseEvent | TouchEvent} event - Pointer event during an active drag
   * @returns {void}
   */
  private handlePointerDrag(event: MouseEvent | TouchEvent): void {
    const container =
      this.dragContainer ??
      this.sliderContainerRef?.nativeElement ??
      null;
    if (!this.dragType || !container) return;

    const rect = container.getBoundingClientRect();
    const clientX =
      'touches' in event && event.touches?.length
        ? event.touches[0].clientX
        : (event as MouseEvent).clientX;
    if (clientX == null) return;
    const x = clientX - rect.left;
    const { inset, trackWidth } = this.getAxisMetrics(
      rect.width > 0 ? rect.width : this.sliderTrackWidthFallback
    );
    const xAdjusted = Math.max(0, Math.min(x - inset, trackWidth));
    const percentage = trackWidth > 0 ? Math.max(0, Math.min(100, (xAdjusted / trackWidth) * 100)) : 0;
    const numSteps = this.horizons.length - 1;
    const stepIndex = Math.round((percentage / 100) * numSteps);
    const clampedIndex = Math.max(0, Math.min(numSteps, stepIndex));

    if (this.dragType === 'start') {
      this.range = {
        startIndex: Math.min(clampedIndex, this.range.endIndex),
        endIndex: this.range.endIndex,
      };
    } else {
      this.range = {
        startIndex: this.range.startIndex,
        endIndex: Math.max(clampedIndex, this.range.startIndex),
      };
    }
    this.hasDragged = true;
    this.publishRange();
  }

  /**
   * @returns {void}
   */
  private publishRange(): void {
    const next = { ...this.range };
    if (!this.isDragging) {
      this.rangeChange.emit(next);
    }
    if (this.isDragging) {
      return;
    }
    this.emitHeavyTimeHorizonOutputs(next);
  }

  /**
   * Emits dashboard / chart-driving outputs. Deferred during handle drag so asset flows
   * (Sankey rebuild) runs once per interaction instead of on every pointer move.
   *
   * @param {TimeHorizonRangeIndices} next - Selected start/end indices to emit
   * @returns {void}
   */
  private emitHeavyTimeHorizonOutputs(next: TimeHorizonRangeIndices): void {
    const h = this.horizons;
    const endHorizon = h[next.endIndex];
    const startHorizon = h[next.startIndex];
    if (endHorizon == null || startHorizon == null) {
      return;
    }
    const anchorIndex = h.indexOf('0');
    if (anchorIndex >= 0) {
      const inferred: 'historical' | 'forecasted' =
        next.endIndex > anchorIndex ? 'forecasted' : 'historical';
      this.inferredDataTypeChange.emit(inferred);
    }
    this.timeHorizonChange.emit(endHorizon);
    this.timeHorizonRangeChange.emit({ start: startHorizon, end: endHorizon });
  }

  private shouldIgnoreCaptureTarget(targetEl: HTMLElement): boolean {
    return !!targetEl?.closest?.(
      '.filters-sticky-minimize-btn, .filters-bar-sticky-expand-btn'
    );
  }

  private getCaptureClientCoords(
    event: MouseEvent | TouchEvent
  ): { clientX: number; clientY: number } | null {
    const clientX =
      'touches' in event ? (event as TouchEvent).touches[0]?.clientX : (event as MouseEvent).clientX;
    const clientY =
      'touches' in event ? (event as TouchEvent).touches[0]?.clientY : (event as MouseEvent).clientY;
    if (clientX == null || clientY == null) return null;
    return { clientX, clientY };
  }

  private isPointInRect(clientX: number, clientY: number, rect: DOMRect): boolean {
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  private resolveCaptureHandle(
    container: HTMLElement,
    target: HTMLElement,
    clientX: number,
    clientY: number
  ): HTMLElement | null {
    const fromTarget = target?.closest?.('.time-horizon-handle') as HTMLElement | null;
    if (fromTarget) return fromTarget;

    const startHandle = container.querySelector('.time-horizon-handle-start') as HTMLElement;
    const endHandle = container.querySelector('.time-horizon-handle-end') as HTMLElement;
    if (startHandle && this.isPointInRect(clientX, clientY, startHandle.getBoundingClientRect())) {
      return startHandle;
    }
    if (endHandle && this.isPointInRect(clientX, clientY, endHandle.getBoundingClientRect())) {
      return endHandle;
    }
    return null;
  }

  private isPointInsideContainer(
    container: HTMLElement,
    clientX: number,
    clientY: number
  ): boolean {
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return x >= 0 && x <= rect.width && y >= 0 && y <= rect.height;
  }

  /**
   * @param {MouseEvent | TouchEvent} event - Document capture-phase pointer event
   * @returns {void}
   */
  private onDocumentCapture(event: MouseEvent | TouchEvent): void {
    const targetEl = event.target as HTMLElement;
    if (this.shouldIgnoreCaptureTarget(targetEl)) return;

    const container = this.sliderContainerRef?.nativeElement;
    if (!container) return;

    const coords = this.getCaptureClientCoords(event);
    if (!coords) return;

    const handleEl = this.resolveCaptureHandle(
      container,
      targetEl,
      coords.clientX,
      coords.clientY
    );
    if (handleEl) {
      const isStart = handleEl.classList.contains('time-horizon-handle-start');
      this.startDrag(event, isStart ? 'start' : 'end');
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (targetEl?.closest?.('.time-horizon-labels')) return;
    if (this.hasDragged || this.isDragging) return;
    if (!this.isPointInsideContainer(container, coords.clientX, coords.clientY)) return;

    this.lastTrackMousedownAt = Date.now();
    this.applyTrackClick(event, container);
    event.preventDefault();
    event.stopPropagation();
  }
}

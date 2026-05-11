/* eslint-disable */
import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { DisclosureFooterData } from '../../utils/asset-flows-to-sankey.util';

@Component({
  selector: 'app-disclosure-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './disclosure-modal.component.html',
  styleUrl: './disclosure-modal.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export default class DisclosureModalComponent implements OnChanges, OnDestroy {
  @Input() isVisible = false;
  /** When false, user has already acknowledged; only review actions (e.g. Print, Close) remain. */
  @Input() showAcknowledgeButton = true;
  /** Asset-flow footer line: formatted `Load_Date` and `Model_Version` from the dashboard. */
  @Input() footerData: DisclosureFooterData | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() acknowledge = new EventEmitter<void>();

  /** Capture-phase guard so clicks / taps do not reach the page behind the overlay until acknowledged. */
  private readonly blockingCaptureHandler = (ev: Event): void => {
    if (!this.isVisible || !this.showAcknowledgeButton) return;
    const t = ev.target;
    const el = t instanceof Element ? t : (t as Node)?.parentElement;
    if (el?.closest('.disclosure-modal')) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
  };

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible']) {
      document.body.style.overflow = this.isVisible ? 'hidden' : '';
    }
    this.syncBlockingPointerCapture();
  }

  ngOnDestroy(): void {
    this.detachBlockingPointerCapture();
    document.body.style.overflow = '';
  }

  private syncBlockingPointerCapture(): void {
    this.detachBlockingPointerCapture();
    if (typeof document === 'undefined') return;
    if (!this.isVisible || !this.showAcknowledgeButton) return;
    document.addEventListener('pointerdown', this.blockingCaptureHandler, true);
    document.addEventListener('click', this.blockingCaptureHandler, true);
    document.addEventListener('mousedown', this.blockingCaptureHandler, true);
    document.addEventListener('touchstart', this.blockingCaptureHandler, true);
  }

  private detachBlockingPointerCapture(): void {
    if (typeof document === 'undefined') return;
    document.removeEventListener('pointerdown', this.blockingCaptureHandler, true);
    document.removeEventListener('click', this.blockingCaptureHandler, true);
    document.removeEventListener('mousedown', this.blockingCaptureHandler, true);
    document.removeEventListener('touchstart', this.blockingCaptureHandler, true);
  }

  @HostListener('document:keydown.escape')
  handleEscape(): void {
    if (!this.isVisible) return;
    if (this.showAcknowledgeButton) return;
    this.onClose();
  }

  /** Backdrop closes only when acknowledgment is not required (X is available). */
  onBackdropClick(): void {
    if (this.showAcknowledgeButton) return;
    this.onClose();
  }

  onClose(): void {
    document.body.style.overflow = '';
    this.close.emit();
  }

  onPrint(): void {
    const root = document.documentElement;
    const cls = 'print-disclosure-only';
    root.classList.add(cls);

    let done = false;
    /** Browser `setTimeout` ids are numeric (distinct from Node's `Timer` type). */
    let fallbackId: number | undefined;

    const finish = (): void => {
      if (done) return;
      done = true;
      root.classList.remove(cls);
      window.removeEventListener('afterprint', finish);
      if (fallbackId !== undefined) {
        window.clearTimeout(fallbackId);
      }
    };

    window.addEventListener('afterprint', finish);
    fallbackId = window.setTimeout(finish, 120_000);

    queueMicrotask(() => {
      window.print();
    });
  }

  onAcknowledge(): void {
    document.body.style.overflow = '';
    this.acknowledge.emit();
  }

  get modelVersionDisplay(): string {
    return (this.footerData?.modelVersion ?? '').trim();
  }

  /** Human-readable calendar date from `loadDate` (UTC) for stable alignment with pipeline dates. */
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
}

import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import AskMarketsenseModalComponent from '../ask-marketsense-modal/ask-marketsense-modal.component';
import { AskMarketsenseCardContextService } from '../../../core/services/ask-marketsense-card-context.service';

const SCROLL_THRESHOLD_PX = 150;

@Component({
  selector: 'app-ask-marketsense-sticky-button',
  standalone: true,
  imports: [CommonModule, AskMarketsenseModalComponent],
  templateUrl: './ask-marketsense-sticky-button.component.html',
  styleUrl: './ask-marketsense-sticky-button.component.scss'
})
export default class AskMarketsenseStickyButtonComponent implements OnInit {
  showModal = false;
  initialMessage = '';
  showButton = false;

  constructor(private askMarketsenseCardContext: AskMarketsenseCardContextService) {}

  /** Reserved for future AI service integration. */
  private pendingSendMessage: string | null = null;

  ngOnInit(): void {
    this.onWindowScroll();
  }

  @HostListener('window:scroll', [])
  onWindowScroll(): void {
    const scrollY = window.scrollY ?? document.documentElement.scrollTop;
    this.showButton = scrollY > SCROLL_THRESHOLD_PX;
  }

  onOpenModal(): void {
    this.askMarketsenseCardContext.clear();
    this.initialMessage = '';
    this.showModal = true;
  }

  onCloseModal(): void {
    this.showModal = false;
    this.initialMessage = '';
  }

  /**
   * Placeholder handler for sending a message to the AI service.
   * @param {string} message - The message text to send
   */
  onSendMessage(message: string): void {
    this.pendingSendMessage = message;
    // TODO: send to AI service when implemented
  }
}

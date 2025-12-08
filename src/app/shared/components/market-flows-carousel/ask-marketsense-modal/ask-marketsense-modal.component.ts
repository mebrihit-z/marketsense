import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { MarketFlowCard } from '../market-flow-card/market-flow-card.component';

@Component({
  selector: 'app-ask-marketsense-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ask-marketsense-modal.component.html',
  styleUrl: './ask-marketsense-modal.component.scss'
})
export class AskMarketsenseModalComponent implements OnChanges {
  @Input() isVisible: boolean = false;
  @Input() card: MarketFlowCard | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() sendMessage = new EventEmitter<string>();

  userMessage: string = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible']) {
      if (this.isVisible) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }
    }
  }

  onClose(): void {
    document.body.style.overflow = '';
    this.close.emit();
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
      this.sendMessage.emit(this.userMessage.trim());
      this.userMessage = '';
    }
  }
}


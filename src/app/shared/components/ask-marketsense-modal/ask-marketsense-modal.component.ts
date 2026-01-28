/* eslint-disable */
import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { MarketFlowCard } from '../market-flows-carousel/market-flow-card/market-flow-card.component';

@Component({
  selector: 'app-ask-marketsense-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ask-marketsense-modal.component.html',
  styleUrl: './ask-marketsense-modal.component.scss'
})
export default class AskMarketsenseModalComponent implements OnChanges {
  @Input() isVisible: boolean = false;
  @Input() card: MarketFlowCard | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() sendMessage = new EventEmitter<string>();

  userMessage: string = '';
  followUpMessage: string = '';
  activeTab: 'new-question' | 'history' = 'new-question';
  isCollapsed: boolean = false;
  
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
      } else {
        document.body.style.overflow = '';
      }
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
      this.sendMessage.emit(this.userMessage.trim());
      this.userMessage = '';
    }
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
      this.sendMessage.emit(this.followUpMessage.trim());
      this.followUpMessage = '';
    }
  }

  onSelectAnalysis(analysisId: number): void {
    // Handle analysis selection
    const analysis = this.sessionHistory.find(a => a.id === analysisId);
    if (analysis) {
      this.followUpMessage = '';
    }
  }

  toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed;
  }
}


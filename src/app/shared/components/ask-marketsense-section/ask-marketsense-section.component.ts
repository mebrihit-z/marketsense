import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import AskMarketsenseModalComponent from '../ask-marketsense-modal/ask-marketsense-modal.component';

@Component({
  selector: 'app-ask-marketsense-section',
  standalone: true,
  imports: [CommonModule, FormsModule, AskMarketsenseModalComponent],
  templateUrl: './ask-marketsense-section.component.html',
  styleUrl: './ask-marketsense-section.component.scss'
})
export default class AskMarketsenseSectionComponent {
  query = '';
  showModal = false;
  initialMessage = '';

  tryAskingSuggestions = [
    'What are the top performing asset classes this quarter?',
    'Show me client flow trends in Fixed Income',
    'Which regions have the highest growth?'
  ];

  onSubmit(): void {
    const text = this.query.trim();
    if (text) {
      this.initialMessage = text;
      this.showModal = true;
      this.query = '';
    }
  }

  /**
   * Opens the modal with the clicked suggestion as the initial message.
   * @param {string} suggestion - The suggestion text to use as the initial message
   */
  onSuggestionClick(suggestion: string): void {
    this.initialMessage = suggestion;
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

  /** Reserved for future AI service integration. */
  private pendingSendMessage: string | null = null;
}

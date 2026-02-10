import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type TitleLevel = 'h1' | 'h2' | 'h3' | 'h4';

@Component({
  selector: 'app-title',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './title.component.html',
  styleUrl: './title.component.scss'
})
export default class TitleComponent {
  /** Main title text */
  @Input() title = '';

  /** Optional subtitle shown below the title */
  @Input() subtitle?: string;

  /** Semantic heading level: h1, h2, h3, or h4 */
  @Input() level: TitleLevel = 'h2';

  /** Optional CSS class for custom styling */
  @Input() class = '';
}

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, map, catchError, delay } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Response shape from backend AI chat or mock JSON */
export interface AiChatResponse {
  question: string;
  timestamp: string;
  summary: string;
  insights: string[];
  chartData?: unknown;
}

/** Request payload for AI chat (backend API shape) */
export interface AiChatRequest {
  question: string;
  space_id: string;
  use_cache: boolean;
  include_visualization: boolean;
  graph_type: string;
}

/**
 * Service for MarketSense AI chat.
 * - On VDI (production/staging): POSTs to backend AI chat API.
 * - On local: fetches mock responses from JSON file to simulate responses.
 */
@Injectable({
  providedIn: 'root',
})
export class AiChatService {
  
  private readonly useMock = !environment.aiChatApiUrl;
  private readonly mockUrl = environment.aiChatMockUrl ?? 'assets/data/ai-chat-mock.json';
  private cachedMockResponses: AiChatResponse[] | null = null;

  constructor(private http: HttpClient) {}

  /**
   * Send a question to the AI chat.
   * @param question User's question text
   * @param options space_id, use_cache, include_visualization, graph_type; isFollowUp only used for mock
   * @returns Observable of the AI response
   */
  sendQuestion(
    question: string,
    options?: {
      isFollowUp?: boolean;
      space_id?: string;
      use_cache?: boolean;
      include_visualization?: boolean;
      graph_type?: string;
    }
  ): Observable<AiChatResponse> {
    if (this.useMock) {
      return this.getMockResponse(question, options?.isFollowUp ?? false);
    }
    return this.postToBackend({
      question,
      space_id: options?.space_id ?? '',
      use_cache: options?.use_cache ?? true,
      include_visualization: options?.include_visualization ?? true,
      graph_type: options?.graph_type ?? 'bar',
    });
  }

  private postToBackend(req: AiChatRequest): Observable<AiChatResponse> {
    const url = `${environment.aiChatApiUrl}`.replace(/\/$/, '');
    return this.http
      .post<AiChatResponse>(url, req)
      .pipe(
        map((res) => this.normalizeResponse(res, req.question)),
        catchError((err) => {
          console.error('AI Chat API error:', err);
          throw err;
        })
      );
  }

  private getMockResponse(question: string, isFollowUp: boolean): Observable<AiChatResponse> {
    return this.loadMockResponses().pipe(
      map((responses) => {
        const idx = isFollowUp
          ? Math.min(1, responses.length - 1)
          : 0;
        const template = responses[idx] ?? responses[0];
        if (!template) {
          return this.fallbackMock(question);
        }
        return {
          ...template,
          question,
          timestamp: this.formatTimestamp(),
        };
      }),
      delay(400) // Simulate network latency
    );
  }

  private loadMockResponses(): Observable<AiChatResponse[]> {
    if (this.cachedMockResponses) {
      return of(this.cachedMockResponses);
    }
    return this.http.get<AiChatResponse[] | { responses: AiChatResponse[] }>(this.mockUrl).pipe(
      map((data) => {
        const arr = Array.isArray(data)
          ? data
          : (data as { responses: AiChatResponse[] }).responses ?? [];
        this.cachedMockResponses = arr;
        return arr;
      }),
      catchError(() => of([]))
    );
  }

  private normalizeResponse(res: AiChatResponse, question: string): AiChatResponse {
    return {
      question: res.question ?? question,
      timestamp: res.timestamp ?? this.formatTimestamp(),
      summary: res.summary ?? '',
      insights: Array.isArray(res.insights) ? res.insights : [],
      chartData: res.chartData,
    };
  }

  private fallbackMock(question: string): AiChatResponse {
    return {
      question,
      timestamp: this.formatTimestamp(),
      summary: 'Analysis of flows shows positive net inflows across equity and alternatives, with fixed income maintaining stable momentum.',
      insights: [
        'Equity inflows up vs prior quarter',
        'Alternatives showing highest net flow percentage',
        'Fixed income flows stabilizing near long-term average',
      ],
    };
  }

  private formatTimestamp(): string {
    const now = new Date();
    return now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }
}

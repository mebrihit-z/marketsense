import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, map, catchError, delay, mergeMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { pickVisualizationImageBase64FromResponseBody } from '../../shared/utils/visualization-image-base64.util';

/** Response shape from backend AI chat or mock JSON */
export interface AiChatResponse {
  /** Route used by backend (e.g. "genie") */
  route?: string;
  /** High-level intent of the request (e.g. "data") */
  intent?: string;
  /** Original user question */
  question: string;
  /** Optional backend message (may be null) */
  message?: string | null;
  /** Conversation identifier from backend */
  conversation_id?: string;
  /** Space identifier used in the request */
  space_id?: string;
  /** Whether the response was served from cache */
  from_cache?: boolean;
  /** Backend response time in milliseconds */
  response_time_ms?: number;
  /** Natural language summary of the analysis */
  summary: string;
  /** Key points list from backend */
  key_points?: string[];
  /** Key drivers list from backend */
  key_drivers?: string[];
  /** Number of data rows returned */
  row_count?: number;
  /** Column metadata for tabular data */
  columns?: unknown[];
  /** Row data, typically matching the columns definition */
  rows?: unknown[];
  /** Optional base64-encoded image for visualization */
  visualization_image_base64?: string;
  /** Text shown when there is no chart image (passed through from backend). */
  visualization_message?: string | null;

  /**
   * Client-side convenience fields used by the UI.
   * These are not part of the raw backend contract but are
   * populated in the service for easier rendering.
   */
  timestamp?: string;
}

/** Backend may return HTTP 200 with this envelope when the query fails (e.g. gateway timeout). */
interface AiChatFailureEnvelope {
  success: false;
  error?: { code?: string; message?: string };
  message?: string;
}

/** Optional UI/flow context (e.g. which market flow card the user asked from). */
export interface AiChatCardContext {
  title: string;
}

/** Request payload for AI chat (backend API shape) */
export interface AiChatRequest {
  question: string;
  space_id: string;
  use_cache: boolean;
  include_visualization: boolean;
  graph_type: string;
  /** Set on follow-up turns to continue the same server-side conversation. */
  conversation_id?: string;
  /**
   * When the user opens Ask MarketSense from a card, the client sends this so the model
   * can ground answers (e.g. `{ "card_context": { "title": "Emerging Markets Equity" } }`).
   */
  card_context?: AiChatCardContext;
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
   * @param options space_id, use_cache, include_visualization, graph_type, conversation_id; isFollowUp only used for mock
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
      conversation_id?: string;
      card_context?: AiChatCardContext;
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
      conversation_id: options?.conversation_id,
      ...(options?.card_context ? { card_context: options.card_context } : {}),
    });
  }

  private postToBackend(req: AiChatRequest): Observable<AiChatResponse> {
    const url = `${environment.aiChatApiUrl}`.replace(/\/$/, '');
    return this.http.post<AiChatResponse | AiChatFailureEnvelope>(url, req).pipe(
      mergeMap((res) => {
        if (this.isAiChatFailureEnvelope(res)) {
          const message = this.extractAiChatApiErrorMessage(res);
          return throwError(() => ({
            error: { message, code: res.error?.code },
          }));
        }
        return of(res as AiChatResponse);
      }),
      map((res) => this.normalizeResponse(res, req.question)),
      catchError((err) => {
        console.error('AI Chat API error:', err);
        throw err;
      })
    );
  }

  private isAiChatFailureEnvelope(res: unknown): res is AiChatFailureEnvelope {
    return (
      typeof res === 'object' &&
      res !== null &&
      (res as AiChatFailureEnvelope).success === false
    );
  }

  private extractAiChatApiErrorMessage(res: AiChatFailureEnvelope): string {
    const fromNested = res.error?.message;
    if (typeof fromNested === 'string' && fromNested.trim()) {
      return fromNested.trim();
    }
    const top = res.message;
    if (typeof top === 'string' && top.trim()) {
      return top.trim();
    }
    return 'Request failed. Please try again.';
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
    // Spread first so backend-only fields (route, message, intent, etc.) are preserved for the UI.
    return {
      ...res,
      question: res.question ?? question,
      timestamp: res.timestamp ?? this.formatTimestamp(),
      summary: res.summary ?? '',
      key_points: Array.isArray(res.key_points) ? res.key_points : [],
      key_drivers: Array.isArray(res.key_drivers) ? res.key_drivers : [],
      visualization_image_base64: pickVisualizationImageBase64FromResponseBody(res),
      row_count: res.row_count,
      columns: Array.isArray(res.columns) ? res.columns : [],
      rows: Array.isArray(res.rows) ? res.rows : [],
    };
  }

  private fallbackMock(question: string): AiChatResponse {
    return {
      question,
      timestamp: this.formatTimestamp(),
      summary: 'Analysis of flows shows positive net inflows across equity and alternatives, with fixed income maintaining stable momentum.',
      key_points: [
        'Equity inflows up vs prior quarter',
        'Alternatives showing highest net flow percentage',
        'Fixed income flows stabilizing near long-term average',
      ],
      key_drivers: [
        'Institutional reallocation into large-cap equity',
        'Private market allocations supporting alternatives growth',
        'Rate outlook improving fixed income sentiment',
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

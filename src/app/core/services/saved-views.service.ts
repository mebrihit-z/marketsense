/* eslint-disable */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface SavedViewState {
  investorRegion: string[];
  investorType: string[];
  productRegion: string[];
  productType: string[];
  productSubType: string[];
}

export interface SavedView {
  id?: string;
  name: string;
  savedAt?: string;
  isDefault?: boolean;
  /** Creator identifier (if provided by backend / caller). */
  userId?: string;
  /** Creator display name (if provided by backend / caller). */
  userName?: string;
  state: SavedViewState;
  dataType?: 'historical' | 'forecasted';
  timeHorizonRange?: { startIndex: number; endIndex: number };
  timeHorizonRangeLabels?: { start: string; end: string };
  selectedTimeHorizon?: string;
  aiConfidenceRange?: { min: number; max: number };
}

/**
 * Central service for "Saved Views".
 *
 * - On local/dev: persists to window.localStorage using the same key as the
 *   filters bar / welcome section.
 * - On VDI (or any environment where environment.savedViewsApiUrl is set):
 *   performs HTTP GET/POST/DELETE against the configured backend endpoint.
 */
@Injectable({
  providedIn: 'root',
})
export class SavedViewsService {
  private readonly storageKey = 'marketsense.savedViews';
  /** When true, use localStorage instead of backend API (local/dev). */
  private readonly useLocalStorage = !('savedViewsApiUrl' in environment) || !environment['savedViewsApiUrl'];

  constructor(private http: HttpClient) {}

  /**
   * Normalize creator identity fields from various backend payload shapes.
   * (Backend may return `userId/userName` or nested/underscored equivalents.)
   */
  private normalizeSavedView(view: SavedView): SavedView {
    const anyView = view as any;
    const userId =
      anyView.userId ??
      anyView.user_id ??
      anyView.user?.id ??
      anyView.user?.sub ??
      anyView.user?.userId ??
      undefined;

    const userName =
      anyView.userName ??
      anyView.user_name ??
      anyView.user?.name ??
      anyView.user?.given_name ??
      anyView.user?.preferred_username ??
      anyView.user?.userName ??
      undefined;

    return {
      ...view,
      ...(userId != null ? { userId } : {}),
      ...(userName != null ? { userName } : {}),
    };
  }

  /**
   * Load all saved views.
   * - Local: read from localStorage.
   * - VDI:   GET from backend.
   */
  getSavedViews(): Observable<SavedView[]> {
    if (this.useLocalStorage) {
      return of(this.readFromLocalStorage().map((v) => this.normalizeSavedView(v)));
    }

    const url = String((environment as any).savedViewsApiUrl).replace(/\/$/, '');
    return this.http.get<SavedView[] | { items: SavedView[] }>(url).pipe(
      map((res) => {
        if (Array.isArray(res)) {
          return res.map((v) => this.normalizeSavedView(v));
        }
        const items = (res as { items?: SavedView[] }).items;
        return Array.isArray(items) ? items.map((v) => this.normalizeSavedView(v)) : [];
      }),
      catchError((err) => {
        console.error('Failed to load saved views from backend', err);
        return of<SavedView[]>([]);
      })
    );
  }

  /**
   * Persist a saved view.
   * Caller is responsible for constructing the SavedView payload.
   */
  saveView(view: SavedView): Observable<void> {
    if (this.useLocalStorage) {
      const existing = this.readFromLocalStorage();
      const now = new Date();
      const withMeta: SavedView = {
        ...view,
        id: view.id ?? `${now.getTime()}`,
        savedAt: view.savedAt ?? now.toISOString(),
      };
      if (withMeta.isDefault) {
        // Ensure only one default view per user (same userId) in local/dev.
        const targetUserId = withMeta.userId ?? null;
        existing.forEach((v) => {
          const vUserId = v.userId ?? null;
          if (vUserId === targetUserId) {
            v.isDefault = false;
          }
        });
      }
      existing.push(withMeta);
      this.writeToLocalStorage(existing);
      return of(void 0);
    }

    const url = String((environment as any).savedViewsApiUrl).replace(/\/$/, '');
    return this.http.post<void>(url, view).pipe(
      catchError((err) => {
        console.error('Failed to save view to backend', err);
        throw err;
      })
    );
  }

  /**
   * Delete a saved view by id or name.
   */
  deleteView(identifier: { id?: string; name?: string }): Observable<void> {
    if (this.useLocalStorage) {
      const existing = this.readFromLocalStorage();
      const updated = existing.filter((item) => {
        if (identifier.id != null) {
          return item.id !== identifier.id;
        }
        if (identifier.name) {
          return item.name !== identifier.name;
        }
        return true;
      });
      this.writeToLocalStorage(updated);
      return of(void 0);
    }

    const urlBase = String((environment as any).savedViewsApiUrl).replace(/\/$/, '');
    const query =
      identifier.id != null
        ? `id=${encodeURIComponent(identifier.id)}`
        : identifier.name
        ? `name=${encodeURIComponent(identifier.name)}`
        : '';
    const url = query ? `${urlBase}?${query}` : urlBase;

    return this.http.delete<void>(url).pipe(
      catchError((err) => {
        console.error('Failed to delete view from backend', err);
        throw err;
      })
    );
  }

  /**
   * Mark a specific saved view as default (or unset it).
   * - Local/dev: updates localStorage in-place and ensures only one default per user.
   * - Backend/VDI: best-effort persists the flag (other defaults are not forcibly cleared here).
   */
  setDefaultView(view: SavedView, isDefault: boolean): Observable<void> {
    if (this.useLocalStorage) {
      const existing = this.readFromLocalStorage();
      const targetUserId = view.userId ?? null;
      const targetId = view.id ?? null;
      const targetName = view.name ?? null;

      // Update in-place rather than appending duplicates.
      const updated = existing.map((v) => {
        const matchesTarget =
          (targetId != null && v.id === targetId) ||
          (targetId == null && targetName != null && v.name === targetName);

        if (isDefault) {
          // Clear default for all views of the same user except the target.
          const vUserId = v.userId ?? null;
          if (vUserId === targetUserId) {
            return matchesTarget ? { ...v, isDefault: true } : { ...v, isDefault: false };
          }
        }

        // Unset default only for the target.
        if (!isDefault && matchesTarget) {
          return { ...v, isDefault: false };
        }

        return v;
      });

      this.writeToLocalStorage(updated);
      return of(void 0);
    }

    // Backend path: best-effort persist. Backend may enforce uniqueness.
    return this.saveView({ ...view, isDefault });
  }

  private readFromLocalStorage(): SavedView[] {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return [];
    }
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as SavedView[]) : [];
    } catch (e) {
      console.error('Failed to read saved views from localStorage', e);
      return [];
    }
  }

  private writeToLocalStorage(views: SavedView[]): void {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(views));
    } catch (e) {
      console.error('Failed to write saved views to localStorage', e);
    }
  }
}


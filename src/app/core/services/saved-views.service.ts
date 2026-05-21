/* eslint-disable */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  MIN_FLOW_VALUE_OPTIONS_VERSION,
  migrateMinFlowRangeIndicesV1ToV2,
} from '../../shared/utils/min-flow-value-options.util';

export interface SavedViewState {
  investorRegion: string[];
  investorType: string[];
  productRegion: string[];
  productType: string[];
  productSubType: string[];
}

/** Three-level hierarchy (Sankey / treemap), stored by dimension id (e.g. `none` for no third level). */
export interface SavedChartHierarchyDimensions {
  dimension1: string;
  dimension2: string;
  dimension3: string;
}

export interface SavedViewChartDimensions {
  assetFlows?: SavedChartHierarchyDimensions;
  assetAllocation?: SavedChartHierarchyDimensions;
}

export interface SavedView {
  id?: string;
  name: string;
  savedAt?: string;
  isDefault?: boolean;
  state: SavedViewState;
  dataType?: 'historical' | 'forecasted';
  timeHorizonRange?: { startIndex: number; endIndex: number };
  timeHorizonRangeLabels?: { start: string; end: string };
  /** `2` = indices are for the current extended axis (incl. ±15 mo). Omit/`1` = legacy 11-point axis. */
  timeHorizonAxisVersion?: number;
  selectedTimeHorizon?: string;
  aiConfidenceRange?: { min: number; max: number };
  /** Flow value band for Sankey/Treemap (indices into MIN_FLOW_VALUE_OPTIONS). */
  minFlowRange?: { startIndex: number; endIndex: number };
  /** `2` = indices include the ≥ $10M stop at index 1. Omit/`1` = migrate on load. */
  minFlowValueOptionsVersion?: number;
  /** When present, restoring the view also applies these hierarchy selections. */
  chartDimensions?: SavedViewChartDimensions;
}

export interface UserPreference {
  /** Mongo (or API) document id — must be sent back on update so the server does not insert a duplicate row. */
  _id?: string;
  userId: string;
  userName?: string;
  role?: string;
  lastLogin?: string;
  savedViews: SavedView[];
  /** User has acknowledged the Data Methodology disclosure (persisted with saved views / user preference). */
  disclosureAcknowledged?: boolean;
}

export interface UserPreferenceProfile {
  userId?: string;
  userName?: string;
  role?: string;
  lastLogin?: string;
}

interface UserPreferenceStoreV2 {
  version: 2;
  users: UserPreference[];
}

/**
 * Central service for "Saved Views".
 *
 * - On local/dev: persists to window.localStorage using the same key as the
 *   filters bar / welcome section.
 * - On VDI (or any environment where environment.savedViewsApiUrl is set):
 *   saved views live on the user-preference document (`POST/GET .../user-preference`).
 *   The base `savedViewsApiUrl` is only used as a legacy fallback when no user id is available.
 */
@Injectable({
  providedIn: 'root',
})
export class SavedViewsService {
  private readonly storageKey = 'marketsense.savedViews';
  private readonly anonymousUserId = 'anonymous';
  /** When true, use localStorage instead of backend API (local/dev). */
  private readonly useLocalStorage = !('savedViewsApiUrl' in environment) || !environment['savedViewsApiUrl'];

  constructor(private http: HttpClient) {}

  /** True when saved views / preference sync target the HTTP API (e.g. VDI). */
  isSavedViewsBackendEnabled(): boolean {
    return !this.useLocalStorage;
  }

  private normalizeSavedView(view: SavedView): SavedView {
    const anyView = view as any;
    const backendId = anyView?._id ?? anyView?.id;
    let normalized: SavedView = {
      ...view,
      // Backend often returns Mongo-style `_id`; normalize to `id` so the app can
      // set defaults / delete consistently.
      id: (view as any)?.id ?? (backendId != null ? String(backendId) : undefined),
    };

    const mfVer = normalized.minFlowValueOptionsVersion;
    const mfr = normalized.minFlowRange;
    if (
      mfr &&
      typeof mfr.startIndex === 'number' &&
      typeof mfr.endIndex === 'number' &&
      (mfVer == null || mfVer < MIN_FLOW_VALUE_OPTIONS_VERSION)
    ) {
      normalized = {
        ...normalized,
        minFlowRange: migrateMinFlowRangeIndicesV1ToV2(mfr),
        minFlowValueOptionsVersion: MIN_FLOW_VALUE_OPTIONS_VERSION,
      };
    }

    return normalized;
  }

  /**
   * Backend/local may use camelCase, snake_case, or string booleans for disclosure acknowledgment.
   */
  private coerceDisclosureAcknowledged(raw: unknown): boolean {
    if (raw == null) {
      return false;
    }
    if (typeof raw !== 'object') {
      const v = raw as unknown;
      if (v === true) return true;
      if (v === false) return false;
      if (typeof v === 'string') {
        return ['true', '1', 'yes'].includes(v.toLowerCase().trim());
      }
      if (typeof v === 'number') return v === 1;
      return false;
    }
    const o = raw as Record<string, unknown>;
    let v: unknown =
      o['disclosureAcknowledged'] ?? o['disclosure_acknowledged'] ?? o['DisclosureAcknowledged'];
    if (v == null) {
      for (const k of Object.keys(o)) {
        if (
          /^disclosure.*acknowledg/i.test(k) ||
          k.replace(/_/g, '').toLowerCase() === 'disclosureacknowledged'
        ) {
          v = o[k];
          break;
        }
      }
    }
    if (v === true) return true;
    if (v === false || v == null) return false;
    if (typeof v === 'string') {
      return ['true', '1', 'yes'].includes(v.toLowerCase().trim());
    }
    if (typeof v === 'number') return v === 1;
    return false;
  }

  private applyDisclosureAcknowledgedNormalization(pref: UserPreference): UserPreference {
    return {
      ...pref,
      disclosureAcknowledged: this.coerceDisclosureAcknowledged(pref),
    };
  }

  /** Name-slug bucket (legacy) may hold acknowledgment while OAuth `sub` row does not. */
  private disclosureAcknowledgedFromNameSlugBucket(
    store: UserPreferenceStoreV2,
    primaryUserId: string,
    userName?: string
  ): boolean {
    const name = (userName ?? '').trim();
    if (!name) return false;
    const slug = this.slugifyUserName(name);
    if (!slug || slug === primaryUserId) return false;
    const alt = store.users.find((u) => u.userId === slug);
    return this.coerceDisclosureAcknowledged(alt);
  }

  /** Acknowledgment may have been saved under `anonymous` before OAuth profile was ready. */
  private disclosureAcknowledgedFromAnonymousWhenLoggedIn(
    store: UserPreferenceStoreV2,
    resolvedUserId: string | null
  ): boolean {
    if (!resolvedUserId || resolvedUserId === this.anonymousUserId) return false;
    const anon = store.users.find((u) => u.userId === this.anonymousUserId);
    return this.coerceDisclosureAcknowledged(anon);
  }

  private normalizeText(value?: string): string | undefined {
    if (value == null) return undefined;
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private resolveLastLogin(lastLogin?: string): string {
    return this.normalizeText(lastLogin) ?? new Date().toISOString();
  }

  /** VDI/Mongo may use camelCase, snake_case, or `{ $date }` for last login. */
  private normalizeLastLoginFromPreference(pref: Record<string, unknown>): string | undefined {
    const raw = pref['lastLogin'] ?? pref['last_login'] ?? pref['LastLogin'];
    if (raw == null) return undefined;
    if (typeof raw === 'string') return this.normalizeText(raw);
    if (typeof raw === 'object' && raw !== null && '$date' in raw) {
      const dateVal = (raw as { $date: string }).$date;
      return this.normalizeText(dateVal != null ? String(dateVal) : undefined);
    }
    return undefined;
  }

  private resolveUserId(userId?: string): string | null {
    if (!userId) return null;
    const normalized = String(userId).trim();
    return normalized.length > 0 ? normalized : null;
  }

  private userPreferenceApiUrl(): string {
    const base = String((environment as any).savedViewsApiUrl).replace(/\/$/, '');
    return `${base}/user-preference`;
  }

  /**
   * Normalize GET response: body may be one doc, `{ item | data }`, or an array / `{ items: [] }`.
   * Prefer the document whose `userId` matches the requested id.
   */
  private parseUserPreferenceGetResponse(res: unknown, requestedUserId: string): UserPreference | null {
    if (res == null) return null;
    const anyRes = res as any;
    let candidates: any[] = [];
    if (Array.isArray(anyRes)) {
      candidates = anyRes;
    } else if (Array.isArray(anyRes.items)) {
      candidates = anyRes.items;
    } else if (Array.isArray(anyRes.results)) {
      candidates = anyRes.results;
    } else if (anyRes.userId) {
      candidates = [anyRes];
    } else {
      const one = anyRes.item ?? anyRes.data ?? anyRes.preference;
      if (one) candidates = [one];
    }
    if (candidates.length === 0) return null;
    const normalizedRequested = String(requestedUserId).trim();
    const pref =
      candidates.find((p) => p && String(p.userId ?? '').trim() === normalizedRequested) ?? candidates[0];
    if (!pref || !pref.userId) return null;
    const docId = pref._id != null ? String(pref._id) : undefined;
    return {
      ...pref,
      _id: docId,
      userId: String(pref.userId).trim(),
      lastLogin: this.normalizeLastLoginFromPreference(pref),
      savedViews: Array.isArray(pref.savedViews) ? pref.savedViews.map((v: SavedView) => this.normalizeSavedView(v)) : [],
      disclosureAcknowledged: this.coerceDisclosureAcknowledged(pref),
    };
  }

  /**
   * GET user preference from VDI. Errors propagate — callers decide whether to swallow.
   */
  private getUserPreferenceFromBackend(userId: string): Observable<UserPreference | null> {
    const base = this.userPreferenceApiUrl();
    const encoded = encodeURIComponent(userId);

    // Different backends expose different GET shapes; try a few common patterns.
    const candidates = [
      `${base}?userId=${encoded}`,
      `${base}/${encoded}`,
      `${base}/by-user/${encoded}`,
      `${base}/user/${encoded}`,
    ];

    const tryNext = (i: number): Observable<UserPreference | null> => {
      if (i >= candidates.length) {
        // Let caller decide whether to swallow; surface a consistent error.
        throw new Error(`No user preference GET route matched for userId=${userId}`);
      }
      return this.http.get<unknown>(candidates[i]).pipe(
        map((res) => this.parseUserPreferenceGetResponse(res, userId)),
        switchMap((pref) => {
          // If route responded but didn't return a matching doc, try next.
          if (!pref) return tryNext(i + 1);
          return of(pref);
        }),
        catchError(() => tryNext(i + 1))
      );
    };

    return tryNext(0);
  }

  private upsertUserPreferenceToBackend(pref: UserPreference): Observable<void> {
    // Important: never send `_id` from the browser.
    // If the server stores Mongo ObjectId `_id`, sending it back as a string can create a *second*
    // document where `_id` is a string (duplicate user rows as seen on VDI).
    // Backend should upsert by `userId` (unique) instead.
    const body: any = { ...pref };
    delete body._id;
    return this.http.post<void>(this.userPreferenceApiUrl(), body as UserPreference).pipe(
      catchError((err) => {
        console.error('Failed to upsert user preference to backend', err);
        throw err;
      })
    );
  }

  private slugifyUserName(userName: string): string {
    return userName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /** Match a stored row to the view being updated (id first, then name). */
  private sameSavedViewIdentity(stored: SavedView, target: SavedView): boolean {
    const tid = target.id;
    if (tid != null && tid !== '' && stored.id != null && String(stored.id) === String(tid)) {
      return true;
    }
    const tName = this.normalizeText(target.name);
    const sName = this.normalizeText(stored.name);
    return tName != null && sName === tName;
  }

  /** Find which local user bucket actually holds this view (for setDefault when profile id is missing). */
  private findUserIdOwningView(store: UserPreferenceStoreV2, view: SavedView): string | null {
    for (const u of store.users) {
      if ((u.savedViews || []).some((v) => this.sameSavedViewIdentity(v, view))) {
        return u.userId;
      }
    }
    return null;
  }

  /**
   * Where to persist updates for this view: profile-scoped id if resolvable, else the bucket that already
   * contains the row, else anonymous (same idea as {@link saveView}).
   */
  private resolveLocalStorageUserIdForView(
    store: UserPreferenceStoreV2,
    profileUserId: string | undefined,
    profileUserName: string | undefined,
    view: SavedView
  ): string {
    const fromLegacyUserName = this.userNameForSavedViewHeuristic(view);
    const effectiveName = this.normalizeText(profileUserName) ?? fromLegacyUserName;
    const fromProfile = this.resolveEffectiveUserId(store, profileUserId, effectiveName);
    if (fromProfile) {
      return fromProfile;
    }
    const owning = this.findUserIdOwningView(store, view);
    if (owning) {
      return owning;
    }
    return this.anonymousUserId;
  }

  private resolveEffectiveUserId(
    store: UserPreferenceStoreV2,
    userId?: string,
    userName?: string
  ): string | null {
    const resolvedFromId = this.resolveUserId(userId);
    if (resolvedFromId) {
      return resolvedFromId;
    }
    const normalizedUserName = (userName ?? '').trim();
    if (!normalizedUserName) {
      return null;
    }
    const existing = store.users.find(
      (u) => (u.userName ?? '').trim().toLowerCase() === normalizedUserName.toLowerCase()
    );
    if (existing?.userId) {
      return existing.userId;
    }
    const slug = this.slugifyUserName(normalizedUserName);
    return slug || null;
  }

  private isRemovableAnonymousUser(pref: UserPreference): boolean {
    return (
      pref.userId === this.anonymousUserId &&
      !pref.userName &&
      !pref.role &&
      !pref.lastLogin &&
      (!pref.savedViews || pref.savedViews.length === 0)
    );
  }

  private getLegacyOwner(view: any): { userId: string; userName?: string } {
    const userIdRaw =
      view?.userId ??
      view?.user_id ??
      view?.user?.id ??
      view?.user?.sub ??
      view?.user?.userId ??
      this.anonymousUserId;
    const userName =
      view?.userName ??
      view?.user_name ??
      view?.user?.name ??
      view?.user?.given_name ??
      view?.user?.preferred_username ??
      view?.user?.userName ??
      undefined;
    const userId = String(userIdRaw ?? this.anonymousUserId).trim() || this.anonymousUserId;
    return { userId, userName };
  }

  /**
   * Load all saved views.
   * - Local: read from localStorage.
   * - VDI:   GET from backend.
   */
  getSavedViews(): Observable<SavedView[]> {
    if (this.useLocalStorage) {
      const store = this.readPreferenceStoreFromLocalStorage();
      const allViews = store.users.flatMap((u) => u.savedViews || []);
      return of(allViews.map((v) => this.normalizeSavedView(v)));
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

  getSavedViewsForUser(userId?: string): Observable<SavedView[]> {
    if (!this.useLocalStorage) {
      const apiUserId = this.resolveUserId(userId);
      if (!apiUserId || apiUserId === this.anonymousUserId) {
        return of<SavedView[]>([]);
      }
      return this.getUserPreferenceFromBackend(apiUserId).pipe(
        switchMap((pref) => {
          const views = pref?.savedViews ?? [];
          return of(views.map((v) => this.normalizeSavedView(v)));
        })
      );
    }
    const targetUserId = this.resolveUserId(userId);
    if (!targetUserId) {
      // Fallback: when profile isn't ready yet, do not hide existing saved views.
      return this.getSavedViews();
    }
    const store = this.readPreferenceStoreFromLocalStorage();
    const pref = store.users.find((u) => u.userId === targetUserId) ?? null;
    if (!pref) {
      // First hit for this user: create an empty preference bucket so future
      // saved views and metadata are trivially user-scoped.
      this.getOrCreateUserPreference(store, targetUserId);
      this.writePreferenceStoreToLocalStorage(store);
      return of<SavedView[]>([]);
    }
    return of((pref?.savedViews ?? []).map((v) => this.normalizeSavedView(v)));
  }

  /**
   * Persist a saved view.
   * Caller is responsible for constructing the SavedView payload.
   */
  saveView(
    view: SavedView,
    userId?: string,
    userName?: string,
    metadata?: Pick<UserPreferenceProfile, 'role' | 'lastLogin'>
  ): Observable<void> {
    if (this.useLocalStorage) {
      const store = this.readPreferenceStoreFromLocalStorage();
      const targetUserId = this.resolveEffectiveUserId(store, userId, userName) ?? this.anonymousUserId;
      const now = new Date();
      const userPref = this.getOrCreateUserPreference(store, targetUserId);
      if (!userPref.userName && userName) {
        userPref.userName = userName;
      }
      userPref.role = this.normalizeText(metadata?.role) ?? userPref.role;
      userPref.lastLogin = this.resolveLastLogin(metadata?.lastLogin);
      const withMeta: SavedView = {
        ...view,
        id: view.id ?? `${now.getTime()}`,
        savedAt: view.savedAt ?? now.toISOString(),
      };
      if (withMeta.isDefault) {
        // Ensure only one default view per user in local/dev.
        userPref.savedViews.forEach((v) => {
          v.isDefault = false;
        });
      }
      const idx = userPref.savedViews.findIndex((v) => this.sameSavedViewIdentity(v, withMeta));
      if (idx >= 0) {
        userPref.savedViews[idx] = { ...userPref.savedViews[idx], ...withMeta };
      } else {
        userPref.savedViews.push(withMeta);
      }
      this.writePreferenceStoreToLocalStorage(store);
      return of(void 0);
    }

    const apiUserId = this.resolveUserId(userId);

    // VDI: single source of truth — persist only inside the user-preference document (savedViews[]).
    // Avoid POST to the standalone saved-views collection so each view is not stored twice.
    if (apiUserId && apiUserId !== this.anonymousUserId) {
      const now = new Date();
      const withMeta: SavedView = {
        ...view,
        id: view.id ?? `${now.getTime()}`,
        savedAt: view.savedAt ?? now.toISOString(),
      };

      return this.getUserPreferenceFromBackend(apiUserId).pipe(
        switchMap((existing) => {
          const seed = Array.isArray(existing?.savedViews) ? [...existing!.savedViews] : [];
          const next: UserPreference = {
            ...(existing ?? {}),
            userId: apiUserId,
            userName: this.normalizeText(userName) ?? existing?.userName,
            role: this.normalizeText(metadata?.role) ?? existing?.role,
            lastLogin: this.resolveLastLogin(metadata?.lastLogin ?? existing?.lastLogin),
            savedViews: seed,
          };

          const idx = next.savedViews.findIndex((v) => this.sameSavedViewIdentity(v, withMeta));
          if (idx >= 0) {
            next.savedViews[idx] = { ...next.savedViews[idx], ...withMeta };
          } else {
            next.savedViews.push(withMeta);
          }

          if (withMeta.isDefault) {
            next.savedViews = next.savedViews.map((v) =>
              this.sameSavedViewIdentity(v, withMeta) ? { ...v, isDefault: true } : { ...v, isDefault: false }
            );
          }

          return this.upsertUserPreferenceToBackend(next);
        }),
        catchError((err) => {
          console.error('Failed to save view via user preference on backend', err);
          throw err;
        })
      );
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
   * @param userId - On VDI, pass authenticated user id so the view is removed from `user-preference.savedViews`.
   */
  deleteView(identifier: { id?: string; name?: string }, userId?: string): Observable<void> {
    if (this.useLocalStorage) {
      const store = this.readPreferenceStoreFromLocalStorage();
      store.users = store.users.map((user) => {
        const updatedViews = user.savedViews.filter((item) => {
          if (identifier.id != null) {
            return item.id !== identifier.id;
          }
          if (identifier.name) {
            return item.name !== identifier.name;
          }
          return true;
        });
        return { ...user, savedViews: updatedViews };
      });
      this.writePreferenceStoreToLocalStorage(store);
      return of(void 0);
    }

    const apiUserId = this.resolveUserId(userId);
    if (apiUserId && apiUserId !== this.anonymousUserId) {
      const idTarget = identifier.id != null ? String(identifier.id) : null;
      const nameTarget = identifier.name?.trim() || null;

      return this.getUserPreferenceFromBackend(apiUserId).pipe(
        switchMap((existing) => {
          if (!existing) {
            return of(void 0);
          }
          const shouldRemove = (item: SavedView): boolean => {
            if (idTarget != null) {
              const norm = this.normalizeSavedView(item);
              const itemId = norm.id != null ? String(norm.id) : '';
              const legacy = item as any;
              const mongoId = legacy?._id != null ? String(legacy._id) : '';
              if (itemId === idTarget || mongoId === idTarget) {
                return true;
              }
            }
            if (nameTarget) {
              return (item.name ?? '').trim() === nameTarget;
            }
            return false;
          };

          const next: UserPreference = {
            ...existing,
            savedViews: (existing.savedViews || []).filter((item) => !shouldRemove(item)),
          };
          return this.upsertUserPreferenceToBackend(next);
        }),
        catchError((err) => {
          console.error('Failed to delete view from user preference on backend', err);
          throw err;
        })
      );
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
   * - Backend/VDI: clears other defaults first, then persists the new default.
   *
   * @param userName - Display / given name from profile (same as saveView) when `userId` is missing.
   */
  setDefaultView(
    view: SavedView,
    isDefault: boolean,
    userId?: string,
    userName?: string
  ): Observable<void> {
    if (this.useLocalStorage) {
      const store = this.readPreferenceStoreFromLocalStorage();
      const targetUserId = this.resolveLocalStorageUserIdForView(store, userId, userName, view);
      const userPref = this.getOrCreateUserPreference(store, targetUserId);

      const updated = userPref.savedViews.map((v) => {
        const matchesTarget = this.sameSavedViewIdentity(v, view);

        if (isDefault) {
          return matchesTarget ? { ...v, isDefault: true } : { ...v, isDefault: false };
        }

        if (!isDefault && matchesTarget) {
          return { ...v, isDefault: false };
        }

        return v;
      });

      userPref.savedViews = updated;
      this.writePreferenceStoreToLocalStorage(store);
      return of(void 0);
    }

    const apiUserId = this.resolveUserId(userId);
    if (!apiUserId || apiUserId === this.anonymousUserId) {
      // Without a stable user id on VDI, we cannot reliably update a user preference doc.
      // Fall back to the legacy saved-views behavior.
      return this.saveView({ ...view, isDefault });
    }

    return this.getUserPreferenceFromBackend(apiUserId).pipe(
      switchMap((existing) => {
        const seed = Array.isArray(existing?.savedViews) ? [...existing!.savedViews] : [];
        const next: UserPreference = {
          ...(existing ?? {}),
          userId: apiUserId,
          userName: this.normalizeText(userName) ?? existing?.userName,
          role: existing?.role,
          lastLogin: this.resolveLastLogin(existing?.lastLogin),
          savedViews: seed,
        };

        next.savedViews = next.savedViews.map((v) => {
          const matchesTarget = this.sameSavedViewIdentity(v, view);
          if (isDefault) {
            return matchesTarget ? { ...v, isDefault: true } : { ...v, isDefault: false };
          }
          return matchesTarget ? { ...v, isDefault: false } : v;
        });

        return this.upsertUserPreferenceToBackend(next);
      }),
      catchError(() => this.saveView({ ...view, isDefault }, userId, userName))
    );
  }

  /**
   * Update user profile preferences (userName/role/lastLogin).
   * - Local/dev: reads/writes the v2 store in localStorage.
   * - VDI: POST JSON to `{savedViewsApiUrl}/user-preference` (backend should accept UserPreferenceProfile).
   *   Only runs when `profile.userId` is set to the authenticated subject (never slug/name or "anonymous"),
   *   so the backend does not create duplicate users before OAuth profile is ready.
   */
  syncUserPreference(profile: UserPreferenceProfile): Observable<void> {
    if (this.useLocalStorage) {
      const store = this.readPreferenceStoreFromLocalStorage();
      const userId = this.resolveEffectiveUserId(store, profile.userId, profile.userName) ?? this.anonymousUserId;
      const userPref = this.getOrCreateUserPreference(store, userId);
      userPref.userName = this.normalizeText(profile.userName) ?? userPref.userName;
      userPref.role = this.normalizeText(profile.role) ?? userPref.role;
      userPref.lastLogin = this.resolveLastLogin(profile.lastLogin);
      this.writePreferenceStoreToLocalStorage(store);
      return of(void 0);
    }

    const apiUserId = this.resolveUserId(profile.userId);
    if (!apiUserId || apiUserId === this.anonymousUserId) {
      return of(void 0);
    }

    const payload: UserPreferenceProfile = {
      userId: apiUserId,
      userName: this.normalizeText(profile.userName),
      role: this.normalizeText(profile.role),
      lastLogin: this.resolveLastLogin(profile.lastLogin),
    };

    // Load existing doc so we never overwrite `savedViews` with [] on profile-only sync.
    return this.getUserPreferenceFromBackend(apiUserId).pipe(
      switchMap((existing) => {
        if (existing) {
          const toUpsert: UserPreference = {
            ...existing,
            userName: this.normalizeText(profile.userName) ?? existing.userName,
            role: this.normalizeText(profile.role) ?? existing.role,
            lastLogin: this.resolveLastLogin(profile.lastLogin),
            savedViews: Array.isArray(existing.savedViews)
              ? existing.savedViews.map((v) => this.normalizeSavedView(v))
              : [],
          };
          return this.upsertUserPreferenceToBackend(toUpsert);
        }
        const fresh: UserPreference = {
          userId: apiUserId,
          userName: payload.userName,
          role: payload.role,
          lastLogin: payload.lastLogin,
          savedViews: [],
        };
        return this.upsertUserPreferenceToBackend(fresh);
      }),
      // GET failed (e.g. no GET endpoint): profile-only POST must not send savedViews
      catchError((err) => {
        console.error('Failed to merge user preference on sync; sending profile-only payload', err);
        return this.http.post<void>(this.userPreferenceApiUrl(), payload).pipe(
          catchError((postErr) => {
            console.error('Failed to sync user preference to backend', postErr);
            throw postErr;
          })
        );
      })
    );
  }

  /**
   * Persists disclosure acknowledgment on the same user-preference document as saved views.
   * Local/dev: `marketsense.savedViews` store; VDI: `upsert` user-preference.
   */
  setDisclosureAcknowledged(userId?: string, userName?: string): Observable<void> {
    if (this.useLocalStorage) {
      const store = this.readPreferenceStoreFromLocalStorage();
      const targetUserId =
        this.resolveEffectiveUserId(store, userId, userName) ?? this.anonymousUserId;
      const userPref = this.getOrCreateUserPreference(store, targetUserId);
      userPref.disclosureAcknowledged = true;
      this.writePreferenceStoreToLocalStorage(store);
      return of(void 0);
    }

    const apiUserId = this.resolveUserId(userId);
    if (!apiUserId || apiUserId === this.anonymousUserId) {
      return of(void 0);
    }

    return this.getUserPreferenceFromBackend(apiUserId).pipe(
      switchMap((existing) => {
        const seed = Array.isArray(existing?.savedViews) ? [...existing!.savedViews] : [];
        const next: UserPreference = {
          ...(existing ?? {}),
          userId: apiUserId,
          userName: this.normalizeText(userName) ?? existing?.userName,
          role: existing?.role,
          lastLogin: this.resolveLastLogin(existing?.lastLogin),
          savedViews: seed.map((v) => this.normalizeSavedView(v)),
          disclosureAcknowledged: true,
        };
        return this.upsertUserPreferenceToBackend(next);
      }),
      catchError((err) => {
        console.error('Failed to persist disclosure acknowledgment', err);
        return of(void 0);
      })
    );
  }

  private userNameForSavedViewHeuristic(view: SavedView): string | undefined {
    const legacy = this.getLegacyOwner(view as any);
    return legacy.userName;
  }

  /**
   * @param userName - Optional; when combined with `userId`, resolves the same preference bucket as
   *   {@link #setDisclosureAcknowledged} / {@link #saveView} via {@link #resolveEffectiveUserId}.
   */
  getUserPreference(userId?: string, userName?: string): Observable<UserPreference | null> {
    if (!this.useLocalStorage) {
      const apiUserId = this.resolveUserId(userId);
      if (!apiUserId || apiUserId === this.anonymousUserId) {
        return of(null);
      }
      return this.getUserPreferenceFromBackend(apiUserId).pipe(
        map((pref) =>
          pref ? this.applyDisclosureAcknowledgedNormalization(pref) : null
        ),
        catchError((err) => {
          console.error('Failed to load user preference from backend', err);
          return of<UserPreference | null>(null);
        })
      );
    }

    const resolvedId = this.resolveUserId(userId);
    const trimmedName = (userName ?? '').trim();

    // No OAuth/profile id yet: still read `anonymous` row (same bucket as first-time acknowledge before sub is set).
    if (!resolvedId && !trimmedName) {
      const store = this.readPreferenceStoreFromLocalStorage();
      const anon = store.users.find((u) => u.userId === this.anonymousUserId);
      if (!anon) {
        return of({
          userId: this.anonymousUserId,
          savedViews: [],
          disclosureAcknowledged: false,
        });
      }
      const normalized = this.applyDisclosureAcknowledgedNormalization(anon);
      return of({
        ...normalized,
        disclosureAcknowledged: normalized.disclosureAcknowledged === true,
      });
    }

    const store = this.readPreferenceStoreFromLocalStorage();
    const targetUserId =
      this.resolveEffectiveUserId(store, userId, userName) ?? this.anonymousUserId;

    let pref = store.users.find((u) => u.userId === targetUserId) ?? null;
    if (!pref) {
      pref = this.getOrCreateUserPreference(store, targetUserId);
      this.writePreferenceStoreToLocalStorage(store);
    }
    const normalized = this.applyDisclosureAcknowledgedNormalization(pref);
    const mergedAck =
      normalized.disclosureAcknowledged === true ||
      this.disclosureAcknowledgedFromNameSlugBucket(store, targetUserId, userName) ||
      this.disclosureAcknowledgedFromAnonymousWhenLoggedIn(store, resolvedId);

    return of({
      ...normalized,
      disclosureAcknowledged: mergedAck,
    });
  }

  private readPreferenceStoreFromLocalStorage(): UserPreferenceStoreV2 {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return { version: 2, users: [] };
    }
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) {
        return { version: 2, users: [] };
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Legacy v1 format: a flat saved views array.
        const migrated = this.migrateLegacyViews(parsed as SavedView[]);
        this.writePreferenceStoreToLocalStorage(migrated);
        return migrated;
      }
      const maybeStore = parsed as Partial<UserPreferenceStoreV2>;
      if (maybeStore?.version === 2 && Array.isArray(maybeStore.users)) {
        const normalizedUsers = maybeStore.users
          .map((u) => ({
            userId: (u.userId ?? this.anonymousUserId).trim() || this.anonymousUserId,
            userName: u.userName ?? (u as any).name,
            role: u.role,
            lastLogin: u.lastLogin,
            savedViews: Array.isArray(u.savedViews) ? u.savedViews.map((v) => this.normalizeSavedView(v)) : [],
            disclosureAcknowledged: this.coerceDisclosureAcknowledged(u),
          }))
          .filter((u) => !this.isRemovableAnonymousUser(u));
        return {
          version: 2,
          users: normalizedUsers,
        };
      }
      return { version: 2, users: [] };
    } catch (e) {
      console.error('Failed to read user preferences from localStorage', e);
      return { version: 2, users: [] };
    }
  }

  private writePreferenceStoreToLocalStorage(store: UserPreferenceStoreV2): void {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(store));
    } catch (e) {
      console.error('Failed to write user preferences to localStorage', e);
    }
  }

  private getOrCreateUserPreference(store: UserPreferenceStoreV2, userId: string): UserPreference {
    const existing = store.users.find((u) => u.userId === userId);
    if (existing) {
      if (!Array.isArray(existing.savedViews)) {
        existing.savedViews = [];
      }
      return existing;
    }
    const created: UserPreference = {
      userId,
      savedViews: [],
    };
    store.users.push(created);
    return created;
  }

  private migrateLegacyViews(legacyViews: SavedView[]): UserPreferenceStoreV2 {
    const usersById = new Map<string, UserPreference>();
    legacyViews.forEach((view) => {
      const normalized = this.normalizeSavedView(view);
      const { userId, userName } = this.getLegacyOwner(view as any);
      let pref = usersById.get(userId);
      if (!pref) {
        pref = { userId, userName, savedViews: [] };
        usersById.set(userId, pref);
      }
      pref.savedViews.push({ ...normalized });
      if (!pref.userName && userName) {
        pref.userName = userName;
      }
    });
    return {
      version: 2,
      users: Array.from(usersById.values()),
    };
  }
}


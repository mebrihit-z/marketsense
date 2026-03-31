/* eslint-disable */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
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
  state: SavedViewState;
  dataType?: 'historical' | 'forecasted';
  timeHorizonRange?: { startIndex: number; endIndex: number };
  timeHorizonRangeLabels?: { start: string; end: string };
  selectedTimeHorizon?: string;
  aiConfidenceRange?: { min: number; max: number };
}

export interface UserPreference {
  userId: string;
  userName?: string;
  role?: string;
  lastLogin?: string;
  savedViews: SavedView[];
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
 *   performs HTTP GET/POST/DELETE against the configured backend endpoint.
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
    return { ...view };
  }

  private normalizeText(value?: string): string | undefined {
    if (value == null) return undefined;
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private resolveLastLogin(lastLogin?: string): string {
    return this.normalizeText(lastLogin) ?? new Date().toISOString();
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
      return this.getSavedViews();
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
      userPref.savedViews.push(withMeta);
      this.writePreferenceStoreToLocalStorage(store);
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

    if (!isDefault) {
      return this.saveView({ ...view, isDefault: false });
    }

    const matchesTargetView = (v: SavedView): boolean => this.sameSavedViewIdentity(v, view);

    return this.getSavedViews().pipe(
      switchMap((views) => {
        const toClear = views.filter((v) => v.isDefault && !matchesTargetView(v));
        const afterClear = toClear.reduce(
          (acc$: Observable<void>, v) =>
            acc$.pipe(switchMap(() => this.saveView({ ...v, isDefault: false }))),
          of(void 0)
        );
        return afterClear.pipe(switchMap(() => this.saveView({ ...view, isDefault: true })));
      })
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

    return this.http.post<void>(this.userPreferenceApiUrl(), payload).pipe(
      catchError((err) => {
        console.error('Failed to sync user preference to backend', err);
        throw err;
      })
    );
  }

  private userNameForSavedViewHeuristic(view: SavedView): string | undefined {
    const legacy = this.getLegacyOwner(view as any);
    return legacy.userName;
  }

  getUserPreference(userId?: string): Observable<UserPreference | null> {
    if (!this.useLocalStorage) {
      return of(null);
    }
    const targetUserId = this.resolveUserId(userId);
    if (!targetUserId) {
      return of(null);
    }
    const store = this.readPreferenceStoreFromLocalStorage();
    const pref = store.users.find((u) => u.userId === targetUserId) ?? null;
    if (pref) {
      return of(pref);
    }
    // First time we see this user id locally: initialize their preference bucket.
    const created = this.getOrCreateUserPreference(store, targetUserId);
    this.writePreferenceStoreToLocalStorage(store);
    return of(created);
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


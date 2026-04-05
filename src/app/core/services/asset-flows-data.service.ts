import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  type AssetFlowRecord,
  normalizeAssetFlowsData,
} from '../../shared/utils/asset-flows-to-sankey.util';

function resolveAssetFlowsUrl(): string {
  const e = environment as {
    dataUrlConfig?: { assetFlows?: string };
    assetFlowsDataUrl?: string;
  };
  return e.dataUrlConfig?.assetFlows ?? e.assetFlowsDataUrl ?? 'assets/data/asset-flows-data.json';
}

/**
 * Single source for asset flows data. Loads from environment.dataUrlConfig.assetFlows
 * (local JSON in dev; set to your backend API on VDI, e.g. `/api/asset-flows`).
 * Caches the result so all consumers share one request.
 */
@Injectable({
  providedIn: 'root',
})
export class AssetFlowsDataService {
  private readonly url = resolveAssetFlowsUrl();
  private cached$: Observable<AssetFlowRecord[]> | null = null;

  constructor(private http: HttpClient) {}

  /**
   * Returns normalized asset flows data. Same request is shared by all subscribers.
   * On VDI, set environment.dataUrlConfig.assetFlows to your backend endpoint.
   */
  getAssetFlows(): Observable<AssetFlowRecord[]> {
    if (!this.cached$) {
      this.cached$ = this.http
        .get<unknown>(this.url)
        .pipe(
          map((raw) =>
            Array.isArray(raw)
              ? normalizeAssetFlowsData(raw as Parameters<typeof normalizeAssetFlowsData>[0])
              : []
          ),
          shareReplay(1)
        );
    }
    return this.cached$;
  }

  /** Clears the cache so the next getAssetFlows() call will refetch (e.g. after login or env change). */
  clearCache(): void {
    this.cached$ = null;
  }
}

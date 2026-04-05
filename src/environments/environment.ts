// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  version: '1.0.0',
  production: false,
  apiUrl: 'http://localhost:3000/api',
  apiBaseUrl: 'http://localhost:3000/api/v1',
  appName: 'MarketSense',
  assetFlowsDataUrl: 'assets/data/asset-flows-data.json',
  dataUrlConfig: {
    assetFlows: 'assets/data/asset-flows-data.json',
  },
  enableDebug: true,
  /** When set, saved views will be loaded from and persisted to this backend API instead of localStorage. */
  savedViewsApiUrl: undefined as string | undefined,
  /** AI chat API URL. When undefined/empty, service uses mock JSON locally. */
  aiChatApiUrl: undefined as string | undefined,
  /** Mock JSON path for local dev (used when aiChatApiUrl is not set). */
  aiChatMockUrl: 'assets/data/ai-chat-mock.json',
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.










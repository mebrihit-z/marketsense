export const environment = {
  production: true,
  apiUrl: 'https://api.marketsense.com/api',
  /** Auth and versioned REST calls (e.g. `${apiBaseUrl}/auth/login`). */
  apiBaseUrl: 'https://api.marketsense.com/api/v1',
  /** URL for asset flows data. Set to backend API when on VDI (e.g. `${apiUrl}/asset-flows`). */
  assetFlowsDataUrl: 'assets/data/asset-flows-data.json',
  /** Used by AssetFlowsDataService; keep in sync with assetFlowsDataUrl unless you point JSON vs API per env. */
  dataUrlConfig: {
    assetFlows: 'assets/data/asset-flows-data.json',
  },
  appName: 'MarketSense',
  version: '1.0.0',
  enableDebug: false,
  /** Backend endpoint for Saved Views on VDI (set to your API route, e.g. `${apiUrl}/saved-views`). */
  savedViewsApiUrl: 'https://api.marketsense.com/api/saved-views',
  /** AI chat backend URL on VDI. POST requests go here. */
  aiChatApiUrl: 'https://api.marketsense.com/api/ai-chat',
  aiChatMockUrl: undefined as string | undefined,
};










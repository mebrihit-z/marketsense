export const environment = {
  production: false,
  apiUrl: 'https://staging-api.marketsense.com/api',
  apiBaseUrl: 'https://staging-api.marketsense.com/api/v1',
  /** URL for asset flows data. Set to backend API when on VDI (e.g. `${apiUrl}/asset-flows`). */
  assetFlowsDataUrl: 'assets/data/asset-flows-data.json',
  dataUrlConfig: {
    assetFlows: 'assets/data/asset-flows-data.json',
  },
  appName: 'MarketSense (Staging)',
  version: '1.0.0',
  enableDebug: true,
  savedViewsApiUrl: undefined as string | undefined,
  /** AI chat backend URL on VDI. POST requests go here. */
  aiChatApiUrl: 'https://staging-api.marketsense.com/api/ai-chat',
  aiChatMockUrl: undefined as string | undefined,
};










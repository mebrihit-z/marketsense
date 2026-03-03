/** Optional response headers (e.g. from auth/user API). */
export interface UserProfileHeaders {
  'cache-control'?: string;
  'content-type'?: string;
  expires?: string;
  pragma?: string;
  'x-api-version'?: string;
}

export interface UserProfile {
  ADUserName: string;
  Groups: string[];
  email: string;
  email_verified: boolean;
  family_name: string;
  given_name: string;
  /** Response headers when profile is from an API call. */
  headers?: UserProfileHeaders;
  locale: string;
  name: string;
  preferred_username: string;
  /** Subject identifier (e.g. same as email). */
  sub: string;
  /** Unix timestamp of last update. */
  updated_at: number;
  /** User Principal Name. */
  upn: string;
  /** Timezone (e.g. IANA zone). */
  zoneinfo: string;
}

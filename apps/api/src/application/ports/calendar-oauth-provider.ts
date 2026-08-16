export interface CalendarOAuthAuthorization {
  readonly accountIdentifier: string;
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly accessTokenExpiresAt: number;
}

export interface CalendarOAuthProvider {
  createAuthorizationUrl(state: string): string;
  exchangeAuthorizationCode(code: string): Promise<CalendarOAuthAuthorization>;
}

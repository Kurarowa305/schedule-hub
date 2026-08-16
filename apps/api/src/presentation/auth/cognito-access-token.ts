export interface CognitoAccessTokenClaims {
  readonly [claim: string]: string | undefined;
}

export interface CognitoAccessTokenPolicy {
  readonly clientId: string;
  readonly requiredScope?: string;
  readonly resource?: string;
  readonly nowEpochSeconds?: number;
}

export interface AuthenticatedUser {
  readonly userId: string;
  readonly clientId: string;
  readonly scopes: readonly string[];
  readonly expiresAt: number;
  readonly resource?: URL;
}

export class AuthenticationError extends Error {
  public constructor(message = "認証情報が無効です") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export function authenticateCognitoAccessToken(
  claims: CognitoAccessTokenClaims,
  policy: CognitoAccessTokenPolicy,
): AuthenticatedUser {
  const userId = requireNonEmptyClaim(claims.sub);
  if (claims.token_use !== "access" || claims.client_id !== policy.clientId) {
    throw new AuthenticationError();
  }

  const expiresAt = parseExpiration(claims.exp);
  const now = policy.nowEpochSeconds ?? Math.floor(Date.now() / 1000);
  if (expiresAt <= now) {
    throw new AuthenticationError();
  }

  const scopes = parseScopes(claims.scope);
  if (
    policy.requiredScope !== undefined &&
    !scopes.includes(policy.requiredScope)
  ) {
    throw new AuthenticationError();
  }
  if (policy.resource !== undefined && claims.aud !== policy.resource) {
    throw new AuthenticationError();
  }

  return {
    userId,
    clientId: policy.clientId,
    scopes,
    expiresAt,
    ...(policy.resource === undefined
      ? {}
      : { resource: new URL(policy.resource) }),
  };
}

export function assertUserOwnership(
  authentication: Pick<AuthenticatedUser, "userId">,
  ownerUserId: string,
): void {
  if (authentication.userId !== ownerUserId) {
    throw new AuthenticationError("他のユーザーのデータにはアクセスできません");
  }
}

function requireNonEmptyClaim(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new AuthenticationError();
  }
  return value;
}

function parseExpiration(value: string | undefined): number {
  const expiration = Number(value);
  if (!Number.isSafeInteger(expiration)) {
    throw new AuthenticationError();
  }
  return expiration;
}

function parseScopes(value: string | undefined): readonly string[] {
  return value?.split(" ").filter((scope) => scope.length > 0) ?? [];
}

import type { AuthSession } from "../app/app.js";

const stateKey = "schedule-hub.pkce-state";
const verifierKey = "schedule-hub.pkce-verifier";
const sessionKey = "schedule-hub.auth-session";

export interface CognitoPkceConfig {
  readonly domain: string;
  readonly clientId: string;
  readonly redirectUri: string;
}

export interface CognitoPkceDependencies {
  readonly fetchImplementation?: typeof fetch;
  readonly randomBytes?: () => Uint8Array;
  readonly sha256?: (value: Uint8Array) => Promise<Uint8Array>;
}

export interface CognitoPkceAuth {
  createSignInUrl(): Promise<URL>;
  handleCallback(url: URL): Promise<AuthSession>;
}

export function createCognitoPkceAuth(
  config: CognitoPkceConfig,
  dependencies: CognitoPkceDependencies = {},
): CognitoPkceAuth {
  const fetchImplementation = dependencies.fetchImplementation ?? fetch;
  const randomBytes = dependencies.randomBytes ?? secureRandomBytes;
  const sha256 = dependencies.sha256 ?? digestSha256;

  return {
    async createSignInUrl() {
      const state = base64Url(randomBytes());
      const verifier = base64Url(randomBytes());
      const challenge = base64Url(
        await sha256(new TextEncoder().encode(verifier)),
      );
      sessionStorage.setItem(stateKey, state);
      sessionStorage.setItem(verifierKey, verifier);

      const url = new URL("/oauth2/authorize", normalizeDomain(config.domain));
      url.search = new URLSearchParams({
        response_type: "code",
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        scope: "openid email profile",
        identity_provider: "Google",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
      }).toString();
      return url;
    },

    async handleCallback(url) {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const expectedState = sessionStorage.getItem(stateKey);
      const verifier = sessionStorage.getItem(verifierKey);
      if (
        code === null ||
        state === null ||
        expectedState === null ||
        verifier === null ||
        !constantTimeEqual(state, expectedState)
      ) {
        throw new Error("Cognito callbackのstateが一致しません");
      }

      const response = await fetchImplementation(
        `${normalizeDomain(config.domain)}/oauth2/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            code,
            code_verifier: verifier,
          }),
        },
      );
      if (!response.ok) throw new Error("Cognito token交換に失敗しました");
      const token = (await response.json()) as {
        readonly access_token?: unknown;
      };
      if (typeof token.access_token !== "string") {
        throw new Error("Cognito token responseが不正です");
      }
      const claims = decodeJwtPayload(token.access_token);
      if (typeof claims.sub !== "string" || typeof claims.exp !== "number") {
        throw new Error("Cognito Access Tokenのclaimsが不正です");
      }
      const session: AuthSession = {
        userId: claims.sub,
        accessToken: token.access_token,
        expiresAt: claims.exp * 1_000,
      };
      localStorage.setItem(sessionKey, JSON.stringify(session));
      sessionStorage.removeItem(stateKey);
      sessionStorage.removeItem(verifierKey);
      return session;
    },
  };
}

function secureRandomBytes(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

async function digestSha256(value: Uint8Array): Promise<Uint8Array> {
  const bytes = new Uint8Array(value).buffer;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
}

function base64Url(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function normalizeDomain(domain: string): string {
  return domain.replace(/\/$/, "");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function decodeJwtPayload(token: string): Readonly<Record<string, unknown>> {
  const encodedPayload = token.split(".")[1];
  if (encodedPayload === undefined) throw new Error("JWT形式が不正です");
  const padded = encodedPayload.replaceAll("-", "+").replaceAll("_", "/");
  const paddingLength = (4 - (padded.length % 4)) % 4;
  return JSON.parse(atob(padded + "=".repeat(paddingLength))) as Readonly<
    Record<string, unknown>
  >;
}

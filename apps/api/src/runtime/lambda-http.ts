export interface HttpApiEvent {
  readonly rawPath: string;
  readonly rawQueryString?: string;
  readonly headers?: Readonly<Record<string, string | undefined>>;
  readonly body?: string | null;
  readonly isBase64Encoded?: boolean;
  readonly requestContext: {
    readonly http: { readonly method: string };
    readonly authorizer?: {
      readonly jwt?: { readonly claims?: Readonly<Record<string, string>> };
    };
  };
}

export interface HttpApiResult {
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly isBase64Encoded: false;
}

export function toRequest(event: HttpApiEvent): Request {
  const query = event.rawQueryString ? `?${event.rawQueryString}` : "";
  const body = decodeBody(event);
  return new Request(`https://schedule-hub.invalid${event.rawPath}${query}`, {
    method: event.requestContext.http.method,
    headers: Object.entries(event.headers ?? {}).flatMap(([name, value]) =>
      value === undefined ? [] : [[name, value] as [string, string]],
    ),
    ...(body === undefined ? {} : { body }),
  });
}

export async function toResult(response: Response): Promise<HttpApiResult> {
  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.text(),
    isBase64Encoded: false,
  };
}

export function jwtClaims(
  event: HttpApiEvent,
): Readonly<Record<string, string>> {
  return event.requestContext.authorizer?.jwt?.claims ?? {};
}

function decodeBody(event: HttpApiEvent): string | undefined {
  if (event.body == null) return undefined;
  return event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
}

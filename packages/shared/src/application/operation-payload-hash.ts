export interface OperationPayload {
  readonly userId: string;
  readonly title: string;
  readonly start: string;
  readonly end: string;
  readonly destinationIds: readonly string[];
}

export async function createOperationPayloadHash(
  payload: OperationPayload,
): Promise<string> {
  const canonicalPayload = JSON.stringify({
    userId: payload.userId,
    title: payload.title,
    start: payload.start,
    end: payload.end,
    destinationIds: payload.destinationIds.map((id) => id.trim()).sort(),
  });
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalPayload),
  );
  const hexadecimal = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  return `sha256:${hexadecimal}`;
}

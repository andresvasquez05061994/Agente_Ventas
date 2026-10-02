import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function secretMatches(provided: string, expected: string): boolean {
  if (provided.length > 4096 || expected.length > 4096) {
    const dummy = createHash("sha256").update("").digest();
    timingSafeEqual(dummy, dummy);
    return false;
  }
  const a = createHash("sha256").update(provided, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

const MIN_APP_SECRET = 16;
const MIN_VERIFY_TOKEN = 8;
const MIN_SHARED_TOKEN = 16;

/**
 * Verifica `X-Hub-Signature-256` de Meta (sha256 HMAC del cuerpo crudo).
 * Compara el digest en tiempo constante. Rechaza si falta el secreto o la firma.
 */
export function verifyMetaSignature(
  rawBody: string | Buffer,
  header: string | null,
  appSecret: string
): boolean {
  if (!appSecret || appSecret.length < MIN_APP_SECRET || !header) return false;
  const match = header.trim().toLowerCase().match(/^sha256=([0-9a-f]{64})$/);
  if (!match) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const provided = Buffer.from(match[1], "hex");
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

/**
 * Handshake GET de Meta: `hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`.
 * Devuelve el challenge para eco en texto plano, o null si hay que rechazar.
 */
export function verifySubscribeHandshake(
  mode: string | null,
  token: string | null,
  challenge: string | null,
  expectedToken: string
): string | null {
  if (!expectedToken || expectedToken.length < MIN_VERIFY_TOKEN) return null;
  if (mode !== "subscribe" || !token || !challenge) return null;
  if (!/^[\w.-]{1,256}$/.test(challenge)) return null;
  if (!secretMatches(token, expectedToken)) return null;
  return challenge;
}

/** Token compartido en la URL del webhook de Apollo (no firma HMAC; Apollo no envía una). */
export function verifySharedToken(provided: string | null, expected: string): boolean {
  if (!expected || expected.length < MIN_SHARED_TOKEN || !provided) return false;
  return secretMatches(provided, expected);
}

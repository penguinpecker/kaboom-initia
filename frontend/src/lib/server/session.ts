import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

export interface SessionData {
  player: string;
  mineCount: number;
  mineLayout: number;
  salt: string;        // 0x-prefixed hex
  commitment: string;  // 0x-prefixed hex
  reveals: number[];
  createdAt: number;
}

// Derive a stable 32-byte AES key from the server's secret. We accept either
// the house private key (hex) or a dedicated SESSION_ENCRYPTION_KEY env var.
let _key: Buffer | null = null;
function getKey(): Buffer {
  if (_key) return _key;
  const raw = process.env.SESSION_ENCRYPTION_KEY || process.env.HOUSE_AUTHORITY_KEY;
  if (!raw) throw new Error("Missing SESSION_ENCRYPTION_KEY or HOUSE_AUTHORITY_KEY");
  _key = createHash("sha256").update(raw).digest();
  return _key;
}

export function encryptSession(data: SessionData): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const json = JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSession(token: string): SessionData {
  const key = getKey();
  const buf = Buffer.from(token, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  tag: string;
}

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const TAG_BITS = 128;

// The key is intentionally split and stored out of order. This is obfuscation only:
// code delivered to a browser cannot provide cryptographic secrecy from that browser.
const KEY_PARTS: ReadonlyArray<ReadonlyArray<number>> = [
  [162, 202, 196, 123, 91, 147, 87, 25],
  [254, 33, 68, 251, 77, 1, 70, 153],
  [66, 196, 169, 168, 172, 23, 93, 229],
  [20, 56, 136, 115, 246, 104, 169, 177]
];
const KEY_ORDER = [2, 0, 3, 1] as const;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

export class CryptoPayloadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CryptoPayloadError";
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string, field: string): Uint8Array {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch (error) {
    throw new CryptoPayloadError(`${field}不是有效的Base64数据`, { cause: error });
  }
}

function reconstructKey(): Uint8Array {
  const key = new Uint8Array(KEY_BYTES);
  let offset = 0;
  for (const partIndex of KEY_ORDER) {
    const part = KEY_PARTS[partIndex];
    if (!part) throw new CryptoPayloadError("密钥片段缺失");
    key.set(part, offset);
    offset += part.length;
  }
  if (offset !== KEY_BYTES || key.byteLength !== KEY_BYTES) {
    throw new CryptoPayloadError("AES密钥必须为32字节");
  }
  return key;
}

function assertPayload(payload: EncryptedPayload): {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  tag: Uint8Array;
} {
  if (!payload || typeof payload !== "object") throw new CryptoPayloadError("加密数据格式不正确");
  const ciphertext = base64ToBytes(payload.ciphertext, "ciphertext");
  const iv = base64ToBytes(payload.iv, "iv");
  const tag = base64ToBytes(payload.tag, "tag");
  if (iv.byteLength !== IV_BYTES) throw new CryptoPayloadError("AES-GCM IV必须为12字节");
  if (tag.byteLength !== TAG_BYTES) throw new CryptoPayloadError("AES-GCM认证标签必须为16字节");
  return { ciphertext, iv, tag };
}

export async function importAesKey(): Promise<CryptoKey> {
  const key = reconstructKey();
  if (key.byteLength !== KEY_BYTES) throw new CryptoPayloadError("AES密钥必须为32字节");
  return crypto.subtle.importKey("raw", toArrayBuffer(key), { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function encrypt(value: string | Uint8Array): Promise<EncryptedPayload> {
  const plaintext = typeof value === "string" ? encoder.encode(value) : value;
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await importAesKey();
  const combined = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv), tagLength: TAG_BITS },
    key,
    toArrayBuffer(plaintext)
  ));
  if (combined.byteLength < TAG_BYTES) throw new CryptoPayloadError("AES-GCM加密结果不完整");
  const ciphertext = combined.subarray(0, combined.byteLength - TAG_BYTES);
  const tag = combined.subarray(combined.byteLength - TAG_BYTES);
  return { ciphertext: bytesToBase64(ciphertext), iv: bytesToBase64(iv), tag: bytesToBase64(tag) };
}

export async function decrypt(payload: EncryptedPayload): Promise<string> {
  const { ciphertext, iv, tag } = assertPayload(payload);
  const combined = new Uint8Array(ciphertext.byteLength + tag.byteLength);
  combined.set(ciphertext);
  combined.set(tag, ciphertext.byteLength);
  try {
    const key = await importAesKey();
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv), tagLength: TAG_BITS },
      key,
      toArrayBuffer(combined)
    );
    return decoder.decode(plaintext);
  } catch (error) {
    throw new CryptoPayloadError("数据认证失败，已拒绝使用该数据", { cause: error });
  }
}

export async function encryptJsonPayload(value: unknown): Promise<EncryptedPayload> {
  return encrypt(JSON.stringify(value));
}

export async function decryptJsonPayload<T>(payload: EncryptedPayload): Promise<T> {
  const plaintext = await decrypt(payload);
  try {
    return JSON.parse(plaintext) as T;
  } catch (error) {
    throw new CryptoPayloadError("解密后的JSON格式不正确", { cause: error });
  }
}

export async function readEncryptedResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  const body: unknown = contentType.includes("application/json")
    ? await response.json()
    : JSON.parse(await response.text());
  if (!response.ok) {
    const message = typeof body === "object" && body && "message" in body
      ? String((body as { message?: unknown }).message || "数据加载失败")
      : "数据加载失败";
    throw new CryptoPayloadError(message);
  }
  if (typeof body !== "object" || body === null || !("ciphertext" in body) || !("iv" in body) || !("tag" in body)) {
    throw new CryptoPayloadError("服务器未返回有效的加密数据");
  }
  return decryptJsonPayload<T>(body as EncryptedPayload);
}

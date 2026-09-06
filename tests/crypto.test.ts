import assert from "node:assert/strict";
import test from "node:test";
import {
  decrypt,
  decryptJsonPayload,
  encrypt,
  encryptJsonPayload,
  importAesKey,
  readEncryptedResponse,
  type EncryptedPayload
} from "../src/aes-gcm.ts";

function mutateBase64(value: string): string {
  const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  bytes[0] = (bytes[0] ?? 0) ^ 1;
  return btoa(String.fromCharCode(...bytes));
}

test("imports a non-extractable AES-256-GCM key", async () => {
  const key = await importAesKey();
  assert.equal(key.algorithm.name, "AES-GCM");
  assert.equal((key.algorithm as AesKeyAlgorithm).length, 256);
  assert.equal(key.extractable, false);
});

test("round-trips strings and JSON", async () => {
  const textPayload = await encrypt("马会资料");
  assert.equal(await decrypt(textPayload), "马会资料");
  const value = { issue: 237, numbers: [1, 2, 3], ok: true };
  assert.deepEqual(await decryptJsonPayload<typeof value>(await encryptJsonPayload(value)), value);
});

test("uses a fresh 12-byte IV and a 16-byte tag every time", async () => {
  const first = await encrypt("same plaintext");
  const second = await encrypt("same plaintext");
  assert.notEqual(first.iv, second.iv);
  assert.equal(atob(first.iv).length, 12);
  assert.equal(atob(first.tag).length, 16);
});

test("rejects tampered ciphertext, IV, and tag", async () => {
  const payload = await encrypt("authenticated");
  for (const field of ["ciphertext", "iv", "tag"] as const) {
    const tampered: EncryptedPayload = { ...payload, [field]: mutateBase64(payload[field]) };
    await assert.rejects(() => decrypt(tampered), /认证失败/);
  }
});

test("rejects invalid IV and tag lengths", async () => {
  const payload = await encrypt("length checks");
  await assert.rejects(() => decrypt({ ...payload, iv: btoa("short") }), /IV必须为12字节/);
  await assert.rejects(() => decrypt({ ...payload, tag: btoa("short") }), /认证标签必须为16字节/);
});

test("readEncryptedResponse decrypts valid envelopes and rejects plaintext success", async () => {
  const value = { title: "马会资料-永久免费公开" };
  const response = new Response(JSON.stringify(await encryptJsonPayload(value)), {
    headers: { "Content-Type": "application/json" }
  });
  assert.deepEqual(await readEncryptedResponse<typeof value>(response), value);
  await assert.rejects(
    () => readEncryptedResponse(new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } })),
    /未返回有效的加密数据/
  );
});

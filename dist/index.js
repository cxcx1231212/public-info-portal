var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/aes-gcm.ts
var IV_BYTES = 12;
var TAG_BYTES = 16;
var KEY_BYTES = 32;
var TAG_BITS = 128;
var KEY_PARTS = [
  [162, 202, 196, 123, 91, 147, 87, 25],
  [254, 33, 68, 251, 77, 1, 70, 153],
  [66, 196, 169, 168, 172, 23, 93, 229],
  [20, 56, 136, 115, 246, 104, 169, 177]
];
var KEY_ORDER = [2, 0, 3, 1];
var encoder = new TextEncoder();
var decoder = new TextDecoder("utf-8", { fatal: true });
function toArrayBuffer(bytes) {
  return bytes.slice().buffer;
}
__name(toArrayBuffer, "toArrayBuffer");
var CryptoPayloadError = class extends Error {
  static {
    __name(this, "CryptoPayloadError");
  }
  constructor(message, options) {
    super(message, options);
    this.name = "CryptoPayloadError";
  }
};
function bytesToBase64(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 32768) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
  }
  return btoa(binary);
}
__name(bytesToBase64, "bytesToBase64");
function reconstructKey() {
  const key = new Uint8Array(KEY_BYTES);
  let offset = 0;
  for (const partIndex of KEY_ORDER) {
    const part = KEY_PARTS[partIndex];
    if (!part) throw new CryptoPayloadError("\u5BC6\u94A5\u7247\u6BB5\u7F3A\u5931");
    key.set(part, offset);
    offset += part.length;
  }
  if (offset !== KEY_BYTES || key.byteLength !== KEY_BYTES) {
    throw new CryptoPayloadError("AES\u5BC6\u94A5\u5FC5\u987B\u4E3A32\u5B57\u8282");
  }
  return key;
}
__name(reconstructKey, "reconstructKey");
async function importAesKey() {
  const key = reconstructKey();
  if (key.byteLength !== KEY_BYTES) throw new CryptoPayloadError("AES\u5BC6\u94A5\u5FC5\u987B\u4E3A32\u5B57\u8282");
  return crypto.subtle.importKey("raw", toArrayBuffer(key), { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
__name(importAesKey, "importAesKey");
async function encrypt(value) {
  const plaintext = typeof value === "string" ? encoder.encode(value) : value;
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await importAesKey();
  const combined = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv), tagLength: TAG_BITS },
    key,
    toArrayBuffer(plaintext)
  ));
  if (combined.byteLength < TAG_BYTES) throw new CryptoPayloadError("AES-GCM\u52A0\u5BC6\u7ED3\u679C\u4E0D\u5B8C\u6574");
  const ciphertext = combined.subarray(0, combined.byteLength - TAG_BYTES);
  const tag = combined.subarray(combined.byteLength - TAG_BYTES);
  return { ciphertext: bytesToBase64(ciphertext), iv: bytesToBase64(iv), tag: bytesToBase64(tag) };
}
__name(encrypt, "encrypt");
async function encryptJsonPayload(value) {
  return encrypt(JSON.stringify(value));
}
__name(encryptJsonPayload, "encryptJsonPayload");

// src/index.js
var json = /* @__PURE__ */ __name((data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } }), "json");
var isBusinessError = /* @__PURE__ */ __name((payload) => payload && typeof payload === "object" && (payload.success === false || payload.ok === false || typeof payload.code === "number" && ![0, 1e4].includes(payload.code) || typeof payload.status === "number" && payload.status !== 0), "isBusinessError");
async function maybeEncryptJsonResponse(request, response) {
  const url = new URL(request.url);
  if (request.method !== "GET" || url.searchParams.get("encrypted") !== "1" || !response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
  try {
    const payload = JSON.parse(await response.clone().text());
    if (isBusinessError(payload)) return response;
    return json(await encryptJsonPayload(payload), response.status, { "x-content-type-options": "nosniff" });
  } catch (error) {
    console.error("public_response_encryption_failed", url.pathname, error?.message || error);
    return json({ message: "\u6570\u636E\u52A0\u8F7D\u5931\u8D25" }, 500);
  }
}
__name(maybeEncryptJsonResponse, "maybeEncryptJsonResponse");
var safeScriptJson = /* @__PURE__ */ __name((value) => JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026"), "safeScriptJson");
async function encryptedHtmlShell(html) {
  const title = ((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "").replace(/<[^>]*>/g, "").trim();
  const [pageEnvelope, titleEnvelope] = await Promise.all([encryptJsonPayload({ html }), encryptJsonPayload(title)]);
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title></title><style>html,body{height:100%;margin:0;background:#050505}.loading-shell{height:100%;display:grid;place-items:center}.loading-spinner{width:42px;height:42px;border:4px solid rgba(218,174,75,.2);border-top-color:#daae4b;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.decrypt-error{min-height:100%;display:grid;place-items:center;color:#eed078;font:600 18px/1.6 system-ui;background:#050505;padding:24px;text-align:center}</style></head><body><div class="loading-shell" aria-label="loading"><span class="loading-spinner"></span></div><script id="encrypted-page" type="application/json">' + safeScriptJson(pageEnvelope) + '<\/script><script id="encrypted-title" type="application/json">' + safeScriptJson(titleEnvelope) + '<\/script><script src="/app-loader.js" defer><\/script></body></html>';
}
__name(encryptedHtmlShell, "encryptedHtmlShell");
async function maybeEncryptHtmlResponse(response) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) return response;
  const html = await response.text(), headers = new Headers(response.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "no-store, max-age=0");
  headers.set("x-content-type-options", "nosniff");
  return new Response(await encryptedHtmlShell(html), { status: response.status, headers });
}
__name(maybeEncryptHtmlResponse, "maybeEncryptHtmlResponse");
var textEncoder = new TextEncoder();
var b64url = /* @__PURE__ */ __name((bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), "b64url");
var safeEqual = /* @__PURE__ */ __name((a, b) => {
  if (a.length !== b.length) return false;
  let value = 0;
  for (let i = 0; i < a.length; i++) value |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return value === 0;
}, "safeEqual");
async function sign(value, secret) {
  const key = await crypto.subtle.importKey("raw", textEncoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, textEncoder.encode(value)));
}
__name(sign, "sign");
async function makeSession(secret) {
  const payload = b64url(textEncoder.encode(JSON.stringify({ exp: Date.now() + 8 * 60 * 60 * 1e3 })));
  return payload + "." + await sign(payload, secret);
}
__name(makeSession, "makeSession");
async function validSession(request, secret) {
  if (!secret) return false;
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)admin_session=([^;]+)/);
  if (!match) return false;
  const [payload, signature] = match[1].split(".");
  if (!payload || !signature || !safeEqual(signature, await sign(payload, secret))) return false;
  try {
    let encoded = payload.replace(/-/g, "+").replace(/_/g, "/");
    while (encoded.length % 4) encoded += "=";
    const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))));
    return Number(data.exp) > Date.now();
  } catch {
    return false;
  }
}
__name(validSession, "validSession");
async function body(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
__name(body, "body");
var cleanText = /* @__PURE__ */ __name((value, max = 5e3) => String(value ?? "").trim().slice(0, max), "cleanText");
var cleanInt = /* @__PURE__ */ __name((value, fallback = 0) => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback, "cleanInt");
var allowedStatus = /* @__PURE__ */ __name((value) => ["pending", "win", "lose"].includes(value) ? value : "pending", "allowedStatus");
var validLotteryType = /* @__PURE__ */ __name((value) => [1, 5, 8].includes(Number(value)) ? Number(value) : 5, "validLotteryType");
async function ensureContentLotteryType(env) {
  const info = await env.DB.prepare("PRAGMA table_info(content_items)").all(), columns = new Set((info.results || []).map((row) => row.name));
  if (!columns.has("lottery_type")) await env.DB.prepare("ALTER TABLE content_items ADD COLUMN lottery_type INTEGER NOT NULL DEFAULT 5").run();
  await env.DB.prepare("DROP INDEX IF EXISTS idx_content_seed_unique").run();
  await env.DB.prepare("DROP INDEX IF EXISTS idx_content_type_unique").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_content_type_lookup ON content_items(lottery_type,section_key,period,title,sort_order)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_content_type_section_period ON content_items(lottery_type,section_key,period DESC,sort_order,id)").run();
}
__name(ensureContentLotteryType, "ensureContentLotteryType");
async function ensureRecommendedSites(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS recommended_sites (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,site_url TEXT NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0,enabled INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_recommended_sites_sort ON recommended_sites(enabled,sort_order,id)").run();
}
__name(ensureRecommendedSites, "ensureRecommendedSites");
async function ensureAdsSchema(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS ads (id INTEGER PRIMARY KEY AUTOINCREMENT,position_key TEXT NOT NULL UNIQUE,image_url TEXT NOT NULL DEFAULT '',link_url TEXT NOT NULL DEFAULT '',display_mode TEXT NOT NULL DEFAULT 'always',delay_seconds INTEGER NOT NULL DEFAULT 1,start_at TEXT,end_at TEXT,enabled INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  const info = await env.DB.prepare("PRAGMA table_info(ads)").all(), columns = new Set((info.results || []).map((row) => row.name));
  const additions = [["image_url", "TEXT NOT NULL DEFAULT ''"], ["link_url", "TEXT NOT NULL DEFAULT ''"], ["display_mode", "TEXT NOT NULL DEFAULT 'always'"], ["delay_seconds", "INTEGER NOT NULL DEFAULT 1"], ["start_at", "TEXT"], ["end_at", "TEXT"], ["enabled", "INTEGER NOT NULL DEFAULT 1"], ["updated_at", "TEXT"]];
  for (const [name, type] of additions) if (!columns.has(name)) await env.DB.prepare("ALTER TABLE ads ADD COLUMN " + name + " " + type).run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS ad_stats (position_key TEXT PRIMARY KEY,impressions INTEGER NOT NULL DEFAULT 0,clicks INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
}
__name(ensureAdsSchema, "ensureAdsSchema");
async function ensureTextAdsSchema(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS text_ads (id INTEGER PRIMARY KEY AUTOINCREMENT,ad_text TEXT NOT NULL,link_url TEXT NOT NULL DEFAULT '',text_color TEXT NOT NULL DEFAULT '#f2cf68',sort_order INTEGER NOT NULL DEFAULT 0,enabled INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_text_ads_sort ON text_ads(enabled,sort_order,id)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS text_ad_domains (id INTEGER PRIMARY KEY AUTOINCREMENT,domain_url TEXT NOT NULL UNIQUE,sort_order INTEGER NOT NULL DEFAULT 0,enabled INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_text_ad_domains_sort ON text_ad_domains(enabled,sort_order,id)").run();
  await env.DB.prepare("INSERT OR IGNORE INTO text_ad_domains(domain_url,sort_order,enabled) SELECT DISTINCT link_url,sort_order,1 FROM text_ads WHERE link_url LIKE 'http%'").run();
  await env.DB.prepare("UPDATE text_ads SET link_url='' WHERE link_url LIKE 'http%'").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS text_ad_imports (import_key TEXT PRIMARY KEY,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  const imported = await env.DB.prepare("SELECT import_key FROM text_ad_imports WHERE import_key='initial-42-phrases-v1'").first();
  if (!imported) {
    const phrases = [
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u7EDD\u6740\u4E09\u8096\u3011\u2190\u5168\u7F51\u6700\u7A33",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u5973\u8096\u7537\u8096\u3011\u2190\u5FEB\u6740\u4E8C\u8096",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u6700\u5F3A\u4E09\u7801\u3011\u2190\u5F00\u5956\u53D1\u8D22",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u5355\u6570\u53CC\u6570\u3011\u2190\u8D85\u51C6\u56DB\u7801",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u4E00\u8096\u4E00\u7801\u3011\u2190\u5341\u4E2D\u516B\u4E5D",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u5FC5\u5F00\u246B\u7801\u3011\u2190\u671F\u671F\u516C\u5F00",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u2473\u7801\u4E2D\u7279\u3011\u2190\u4E24\u671F\u5FC5\u5F00",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u5185\u5E55\u2462\u7801\u3011\u2190\u4E3B\u653B\u2460\u7801",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u65E0\u9519\u2464\u8096\u3011\u2190\u5BB6\u79BD\u91CE\u517D",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u5BB6\u79BD\u91CE\u517D\u3011\u2190\u7CBE\u51C6\u6740\u6599",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u5355\u6570\u53CC\u6570\u3011\u2190\u771F\u7684\u5F88\u51C6",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u91CD\u70B9\u516D\u7801\u3011\u2190\u4E24\u671F\u5FC5\u5F00",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u7F51\u7EA2\u4E94\u7801\u3011\u2190\u5F00\u5956\u53D1\u8D22",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u780D\u6740\u4E8C\u8096\u3011\u2190\u4E09\u671F\u5FC5\u5F00",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u5355\u6570\u53CC\u6570\u3011\u2190\u7EDD\u6740\u2462\u8096",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u4E8C\u671F\u5FC5\u5F00\u3011\u2190\u8D5A\u94B1\u53CC\u6CE2",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u56DB\u5C3E12\u7801\u3011\u2190\u7AD9\u957F\u63A8\u8350",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u7EDD\u6740\u4E09\u8096\u3011\u2190\u5168\u5E74\u65E0\u9519",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u6CC4\u5BC6\u2462\u7801\u3011\u2190\u5185\u5E55\u8D44\u6599",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u4E09\u671F\u5FC5\u51FA\u3011\u2190\u7CBE\u5F69\u7EE7\u7EED",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u5355\u540A\u4E00\u7801\u3011\u2190\u4E8C\u671F\u5FC5\u5F00",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u5185\u5E55\u2461\u7801\u3011\u2190\u7AD9\u957F\u63A8\u8350",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u4E8C\u5B57\u7206\u7279\u3011\u2190\u5929\u673A\u6CC4\u5BC6",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u6CC4\u5BC6\uFF13\u8096\u3011\u2190\u7EDD\u6740\u2463\u8096",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u725B\u903C\u4E00\u7801\u3011\u2190\u6B22\u8FCE\u9A8C\u8BC1",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u5355\u53CC\u5FC5\u4E2D\u3011\u2190\u5185\u5E55\u2460\u7801",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u4E00\u8096\u4E2D\u7279\u3011\u2190\u8D76\u5FEB\u4E0A\u8F66",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u4E00\u7801\u4E2D\u7279\u3011\u2190\u9AD8\u624B\u4E91\u96C6",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u5E73\u7279\u4E00\u8096\u3011\u2190\u65E0\u9519\u516C\u5F00",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u5185\u90E8\u4E09\u8096\u3011\u2190\u5185\u90E8\u5E73\u7279",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u725B\u903C\uFF12\u7801\u3011\u2190\u91CD\u70B9\u5173\u6CE8",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u7CBE\u9009\u2462\u8096\u3011\u2190\u8D85\u51C6\u5355\u53CC",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u7CBE\u51C6\u4E00\u8096\u3011\u2190\u5F3A\u529B\u63A8\u8350",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u4E00\u6CE2\u4E2D\u7279\u3011\u2190\u4E24\u671F\u5FC5\u5F00",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u7EDD\u6740\u4E09\u8096\u3011\u2190\u8FDE\u51C631\u671F",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u5E73\u7279\u4E00\u8096\u3011\u2190\u5BB6\u79BD\u91CE\u517D",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u5BB6\u79BD\u91CE\u517D\u3011\u2190\u7EDD\u6740\uFF13\u8096",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u5929\u5730\u751F\u8096\u3011\u2190\u4E00\u8096\u5E73\u7279",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u4E00\u8096\u5E73\u7279\u3011\u2190\u4E8C\u671F\u5FC5\u5F00",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u5E73\u7279\u4E00\u8096\u3011\u2190\u4E24\u671F\u5FC5\u5F00",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u7EDD\u6740\u4E09\u8096\u3011\u2190\u4ECA\u5E74\u65E0\u9519",
      "{\u671F\u6570}\u671F: {\u5F69\u79CD\u7B80\u79F0}\u2192\u3010\u5355\u6570\u53CC\u6570\u3011\u2190\u7AD9\u957F\u63A8\u8350"
    ];
    for (let offset = 0; offset < phrases.length; offset += 40) {
      const chunk = phrases.slice(offset, offset + 40);
      await env.DB.batch(chunk.map((phrase, index) => env.DB.prepare("INSERT INTO text_ads(ad_text,text_color,sort_order,enabled) SELECT ?,'#f2cf68',?,1 WHERE NOT EXISTS(SELECT 1 FROM text_ads WHERE ad_text=?)").bind(phrase, offset + index, phrase)));
    }
    await env.DB.prepare("INSERT OR REPLACE INTO text_ad_imports(import_key) VALUES('initial-42-phrases-v1')").run();
  }
}
__name(ensureTextAdsSchema, "ensureTextAdsSchema");
async function trackVisit(request, env) {
  const ip = cleanText(request.headers.get("CF-Connecting-IP") || "unknown", 80), cf = request.cf || {}, date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), country = cleanText(cf.country || "", 80), region = cleanText(cf.region || "", 120), city = cleanText(cf.city || "", 120);
  const unique = await env.DB.prepare("INSERT OR IGNORE INTO analytics_uniques(visit_date,ip_address) VALUES(?,?)").bind(date, ip).run(), isNew = Number(unique.meta?.changes || 0);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO analytics_daily(visit_date,views,unique_visitors) VALUES(?,1,?) ON CONFLICT(visit_date) DO UPDATE SET views=views+1,unique_visitors=unique_visitors+excluded.unique_visitors").bind(date, isNew),
    env.DB.prepare("INSERT INTO analytics_visitors(ip_address,country,region_name,city,views,first_seen,last_seen) VALUES(?,?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(ip_address) DO UPDATE SET country=excluded.country,region_name=excluded.region_name,city=excluded.city,views=analytics_visitors.views+1,last_seen=CURRENT_TIMESTAMP").bind(ip, country, region, city)
  ]);
}
__name(trackVisit, "trackVisit");
var parseJson = /* @__PURE__ */ __name((value) => {
  try {
    return JSON.parse(value || "{}") || {};
  } catch {
    return {};
  }
}, "parseJson");
var colorName = /* @__PURE__ */ __name((value) => Number(value) === 1 ? "\u7EA2\u6CE2" : Number(value) === 2 ? "\u84DD\u6CE2" : "\u7EFF\u6CE2", "colorName");
var domestic = /* @__PURE__ */ new Set(["\u725B", "\u9A6C", "\u7F8A", "\u9E21", "\u72D7", "\u732A"]);
var idiomZodiacMap = { \u5B88\u682A\u5F85\u5154: "\u5154", \u9F99\u9A6C\u7CBE\u795E: "\u9F99", \u864E\u864E\u751F\u5A01: "\u864E", \u4EA1\u7F8A\u8865\u7262: "\u7F8A", \u91D1\u9E21\u72EC\u7ACB: "\u9E21", \u7334\u5E74\u9A6C\u6708: "\u7334", \u753B\u86C7\u6DFB\u8DB3: "\u86C7", \u4E5D\u725B\u4E00\u6BDB: "\u725B", \u72D7\u6025\u8DF3\u5899: "\u72D7", \u732A\u7A81\u8C68\u52C7: "\u732A", \u9F20\u76EE\u5BF8\u5149: "\u9F20", \u9F99\u817E\u864E\u8DC3: "\u9F99", \u731B\u864E\u4E0B\u5C71: "\u864E" };
var idiomTarget = /* @__PURE__ */ __name((data) => {
  const explicit = String(data?.zodiac || "").match(/[鼠牛虎兔龙蛇马羊猴鸡狗猪]/)?.[0];
  if (explicit) return explicit;
  const text = String(data?.pick || ""), idiom = (text.match(/【([^】]+)】/) || [])[1] || text;
  return idiomZodiacMap[idiom] || idiom.match(/[鼠牛虎兔龙蛇马羊猴鸡狗猪]/)?.[0] || "";
}, "idiomTarget");
function evaluateContent(row, special) {
  const data = parseJson(row.content_json), pick = String(data.pick || data.zodiac || row.title || ""), number = Number(special.number), zodiac = String(special.shengXiao || ""), color = colorName(special.color), element = String(special.wuXing || ""), key = row.section_key;
  if (!number || !zodiac) return null;
  if (key === "thirty") {
    const values = Array.isArray(data.numbers) ? data.numbers.map(Number) : [];
    return values.includes(number);
  }
  if (key === "threehead") return pick.includes(Math.floor(number / 10) + "\u5934");
  if (key === "doublewave") return pick.includes(color);
  if (key === "threeelements") return pick.includes(element);
  if (key === "sumparity") {
    const parity = (Math.floor(number / 10) + number % 10) % 2 ? "\u5408\u6570\u5355" : "\u5408\u6570\u53CC";
    return pick.includes(parity);
  }
  if (key === "singledouble") {
    const parity = number % 2 ? "\u5355\u6570" : "\u53CC\u6570";
    return pick.includes(parity) || pick.includes(zodiac);
  }
  if (key === "study") {
    const kind = String(data.kind || row.title || "");
    if (kind.includes("\u8096")) return pick.includes(zodiac);
    if (kind.includes("\u5355\u53CC")) return pick.includes(number % 2 ? "\u5355\u6570" : "\u53CC\u6570");
    if (kind.includes("\u6CE2\u8272")) return pick.includes(color);
    if (kind.includes("\u4E03\u5C3E")) return pick.replace(/\D/g, "").includes(String(number % 10));
    if (kind.includes("\u5BB6\u91CE")) {
      const group = domestic.has(zodiac) ? "\u5BB6\u79BD" : "\u91CE\u517D";
      return pick.includes(group) || pick.includes(zodiac);
    }
    return null;
  }
  if (key === "homewild") {
    const group = domestic.has(zodiac) ? "\u5BB6\u79BD" : "\u91CE\u517D";
    return pick.includes(group) || pick.includes(zodiac);
  }
  if (key === "idiom") return new Set(Array.isArray(special.allZodiacs) ? special.allZodiacs.map(String) : [zodiac]).has(idiomTarget(data));
  if (["sixcode", "ninezodiac"].includes(key)) {
    const numbers = String(data.numbers || "").match(/\d{1,2}/g)?.map(Number) || [];
    return pick.includes(zodiac) || numbers.includes(number);
  }
  if (key === "loseall") return !pick.includes(zodiac);
  if (key === "kill") {
    const fields = Array.isArray(data.fields) ? data.fields.map(String) : [];
    return !fields.some((value) => value.includes(zodiac) || value.includes(number % 10 + "\u5C3E") || value.includes(color.replace("\u6CE2", "")) || value.includes(Math.floor(number / 10) + "\u5934"));
  }
  if (key === "threeperiod") return null;
  return pick.includes(zodiac) || pick.includes(String(number).padStart(2, "0"));
}
__name(evaluateContent, "evaluateContent");
function evaluatePost(row, special) {
  const data = parseJson(row.content_json), pick = String(data.pick || data.value || ""), specialty = String(row.specialty || pick.split("\u3010")[0] || ""), number = Number(special.number), zodiac = String(special.shengXiao || ""), color = colorName(special.color), element = String(special.wuXing || "");
  if (!pick || !number || !zodiac) return null;
  const selection = (pick.match(/【([^】]*)】/) || [])[1] || pick;
  const tokens = selection.match(/(?:^|\D)(0?[1-9]|[1-4]\d)(?=\D|$)/g)?.map((value) => Number(value.replace(/\D/g, ""))) || [], tail = number % 10, head = Math.floor(number / 10), sumParity = (Math.floor(number / 10) + tail) % 2 ? "\u5408\u6570\u5355" : "\u5408\u6570\u53CC", size = number >= 25 ? "\u5927\u6570" : "\u5C0F\u6570", group = domestic.has(zodiac) ? "\u5BB6\u79BD" : "\u91CE\u517D";
  const direction = { \u5154: "\u4E1C", \u864E: "\u4E1C", \u9F99: "\u4E1C", \u86C7: "\u5357", \u9A6C: "\u5357", \u7F8A: "\u5357", \u7334: "\u897F", \u9E21: "\u897F", \u72D7: "\u897F", \u732A: "\u5317", \u9F20: "\u5317", \u725B: "\u5317" }[zodiac] || "", heaven = (/* @__PURE__ */ new Set(["\u5154", "\u9A6C", "\u7334", "\u732A", "\u725B", "\u9F99"])).has(zodiac) ? "\u5929\u8096" : "\u5730\u8096";
  let matched = selection.includes(zodiac) || tokens.includes(number) || color && selection.includes(color) || element && selection.includes(element) || selection.includes(head + "\u5934") || selection.includes(number % 2 ? "\u5355\u6570" : "\u53CC\u6570");
  if (specialty.includes("\u5C3E")) matched = matched || selection.includes(tail + "\u5C3E") || !selection.includes("\u5C3E") && selection.replace(/\D/g, "").includes(String(tail));
  if (specialty.includes("\u5927\u5C0F") || specialty.includes("\u80C6\u5927")) matched = matched || selection.includes(size);
  if (specialty.includes("\u5408\u6570") || specialty.includes("\u4E00\u5408")) matched = matched || selection.includes(sumParity);
  if (specialty.includes("\u5BB6\u79BD") || specialty.includes("\u5BB6\u91CE")) matched = matched || selection.includes(group);
  if (specialty.includes("\u5929\u5730")) matched = matched || selection.includes(heaven);
  if (specialty.includes("\u4E1C\u5357\u897F\u5317")) matched = matched || selection.includes(direction);
  return /绝杀|稳杀|必禁/.test(specialty) ? !matched : matched;
}
__name(evaluatePost, "evaluatePost");
var zodiacOrder = ["\u9A6C", "\u86C7", "\u9F99", "\u5154", "\u864E", "\u725B", "\u9F20", "\u732A", "\u72D7", "\u9E21", "\u7334", "\u7F8A"];
var waves = ["\u7EA2\u6CE2", "\u84DD\u6CE2", "\u7EFF\u6CE2"];
var elements = ["\u91D1", "\u6728", "\u6C34", "\u706B", "\u571F"];
var idioms = ["\u5B88\u682A\u5F85\u5154", "\u9F99\u9A6C\u7CBE\u795E", "\u864E\u864E\u751F\u5A01", "\u4EA1\u7F8A\u8865\u7262", "\u91D1\u9E21\u72EC\u7ACB", "\u7334\u5E74\u9A6C\u6708", "\u753B\u86C7\u6DFB\u8DB3", "\u4E5D\u725B\u4E00\u6BDB", "\u72D7\u6025\u8DF3\u5899", "\u732A\u7A81\u8C68\u52C7", "\u9F20\u76EE\u5BF8\u5149", "\u9F99\u817E\u864E\u8DC3"];
var expectedSections = { study: 8, sixcode: 3, doublewave: 1, homewild: 1, threehead: 1, idiom: 1, threeperiod: 1, sumparity: 1, ninezodiac: 4, threeelements: 1, loseall: 1, thirty: 1, singledouble: 1, kill: 1 };
var numberPool = Array.from({ length: 49 }, (_, i) => i + 1);
var rngFor = /* @__PURE__ */ __name((seed) => {
  let state = (Number(seed) || 1) >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}, "rngFor");
var sample = /* @__PURE__ */ __name((values, count, random) => {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}, "sample");
var numbersFor = /* @__PURE__ */ __name((zodiacs) => numberPool.filter((number) => zodiacs.includes(zodiacOrder[(number - 1) % 12])), "numbersFor");
var masterCatalog = [
  ["\u66F9\u64CD", "\u516B\u7801\u4E2D\u7279"],
  ["\u5218\u5907", "\u56DB\u5C3E\u4E2D\u7279"],
  ["\u5B59\u6743", "\u4E94\u8096\u4E2D\u7279"],
  ["\u8BF8\u845B\u4EAE", "\u516D\u8096\u4E2D\u7279"],
  ["\u5173\u7FBD", "\u56DB\u8096\u4E2D\u7279"],
  ["\u5F20\u98DE", "\u5409\u51F6\u4E2D\u7279"],
  ["\u8D75\u4E91", "\u4E03\u5C3E\u4E2D\u7279"],
  ["\u9A6C\u8D85", "\u7EDD\u6740\u4E09\u8096"],
  ["\u9EC4\u5FE0", "\u5E73\u7279\u4E00\u8096"],
  ["\u5468\u745C", "\u53CC\u6CE2\u4E2D\u7279"],
  ["\u5415\u5E03", "\u5BB6\u79BD\u91CE\u517D"],
  ["\u53F8\u9A6C\u61FF", "\u5FC5\u4E2D\u5927\u5C0F"],
  ["\u5178\u97E6", "\u516D\u8096\u4E2D\u7279"],
  ["\u8BB8\u891A", "\u5355\u53CC\u4E2D\u7279"],
  ["\u5F20\u8FBD", "\u5929\u5730\u4E2D\u7279"],
  ["\u5F90\u6643", "\u5E73\u7279\u4E00\u5C3E"],
  ["\u590F\u4FAF\u60C7", "\u56DB\u8096\u4E2D\u7279"],
  ["\u590F\u4FAF\u6E0A", "\u56DB\u5C3E\u4E2D\u7279"],
  ["\u66F9\u4EC1", "\u4E94\u8096\u4E2D\u7279"],
  ["\u66F9\u4E15", "\u4E03\u8096\u4E2D\u7279"],
  ["\u5B59\u7B56", "\u516B\u8096\u4E2D\u7279"],
  ["\u9C81\u8083", "\u4E94\u8096\u4E2D\u7279"],
  ["\u9646\u900A", "\u7EDD\u6740\u4E8C\u8096"],
  ["\u7518\u5B81", "\u4E94\u5C3E\u4E2D\u7279"],
  ["\u592A\u53F2\u6148", "\u7EDD\u6740\u4E8C\u8096"],
  ["\u9EC4\u76D6", "\u7EDD\u6740\u4E00\u5934"],
  ["\u7A0B\u666E", "\u7EDD\u6740\u56DB\u8096"],
  ["\u59DC\u7EF4", "\u56DB\u8096\u4E2D\u7279"],
  ["\u9B4F\u5EF6", "11\u7801\u4E2D\u7279"],
  ["\u5E9E\u7EDF", "\u80C6\u5927\u80C6\u5C0F"],
  ["\u6CD5\u6B63", "\u5408\u6570\u5355\u53CC"],
  ["\u8463\u5353", "\u7EDD\u6740\u4E00\u5934"],
  ["\u8881\u7ECD", "\u65E0\u9519\u4E5D\u8096"],
  ["\u8881\u672F", "\u7EDD\u6740\u4E00\u5408"],
  ["\u8C82\u8749", "\u7EDD\u6740\u4E00\u884C"],
  ["\u5927\u4E54", "\u7A33\u6740\u4E94\u7801"],
  ["\u5C0F\u4E54", "\u4E1C\u5357\u897F\u5317"],
  ["\u534E\u4F57", "\u516B\u5C3E\u4E2D\u7279"],
  ["\u9648\u5BAB", "\u4E5D\u8096\u4E2D\u7279"]
];
var replacementMasterNames = ["\u90ED\u5609", "\u8340\u5F67", "\u8340\u6538", "\u8D3E\u8BE9", "\u5415\u8499", "\u5F20\u662D", "\u5F20\u7EAE", "\u66F9\u6D2A", "\u534E\u96C4", "\u5F20\u89D2", "\u516C\u5B59\u74D2", "\u989C\u826F", "\u6587\u4E11", "\u9AD8\u987A", "\u9648\u7FA4", "\u949F\u4F1A", "\u9093\u827E", "\u9646\u6297", "\u7F8A\u795C", "\u738B\u5E73", "\u5ED6\u5316", "\u5173\u5E73", "\u5468\u4ED3", "\u9A6C\u5CB1", "\u4E25\u989C", "\u5F20\u4EFB", "\u848B\u742C", "\u8D39\u794E", "\u987E\u96CD", "\u8BF8\u845B\u747E", "\u51CC\u7EDF", "\u6F58\u748B", "\u4E01\u5949", "\u4E8E\u7981", "\u4E50\u8FDB", "\u674E\u5178", "\u7A0B\u6631", "\u6EE1\u5BA0", "\u66F9\u771F", "\u66F9\u4F11"];
var generatedMasterPrefixes = ["\u91D1\u9675", "\u957F\u5B89", "\u6D1B\u9633", "\u6C5F\u4E1C", "\u5DF4\u8700", "\u8346\u5DDE", "\u4E2D\u539F", "\u585E\u5317", "\u5CAD\u5357", "\u5173\u4E2D", "\u71D5\u8D75", "\u9F50\u9C81", "\u6CB3\u897F", "\u4E91\u4E2D", "\u5929\u5C71", "\u6CA7\u6D77", "\u9752\u57CE", "\u6606\u4ED1", "\u6B66\u9675", "\u897F\u51C9"];
var generatedMasterSuffixes = ["\u5200\u5BA2", "\u5251\u5BA2", "\u795E\u7B97", "\u5947\u4FA0", "\u540D\u58EB", "\u667A\u56CA", "\u8C6A\u6770", "\u5148\u950B", "\u8C0B\u58EB", "\u9690\u4FA0", "\u5B97\u5E08", "\u9AD8\u4EBA", "\u795E\u6355", "\u4FA0\u58EB", "\u519B\u5E08", "\u8D24\u58EB", "\u98DE\u5C06", "\u864E\u5C06", "\u540D\u5C06", "\u4E49\u58EB"];
function nextUniqueMasterName(usedNames) {
  for (const prefix of generatedMasterPrefixes) for (const suffix of generatedMasterSuffixes) {
    const candidate = prefix + suffix;
    if (!usedNames.has(candidate)) return candidate;
  }
  for (let index = 0; index < 4096; index++) {
    const candidate = "\u9AD8\u624B" + String.fromCharCode(19968 + Math.floor(index / 64)) + String.fromCharCode(19968 + index % 64);
    if (!usedNames.has(candidate)) return candidate;
  }
  throw new Error("\u9AD8\u624B\u59D3\u540D\u5E93\u5DF2\u6EE1");
}
__name(nextUniqueMasterName, "nextUniqueMasterName");
async function ensureMasterRosterSchema(env) {
  const info = await env.DB.prepare("PRAGMA table_info(masters)").all(), columns = new Set((info.results || []).map((item) => item.name));
  if (!columns.has("lottery_scope")) await env.DB.prepare("ALTER TABLE masters ADD COLUMN lottery_scope INTEGER NOT NULL DEFAULT 0").run();
  if (!columns.has("replaces_master_id")) await env.DB.prepare("ALTER TABLE masters ADD COLUMN replaces_master_id INTEGER NOT NULL DEFAULT 0").run();
}
__name(ensureMasterRosterSchema, "ensureMasterRosterSchema");
async function ensureMasterCatalog(env) {
  await ensureMasterRosterSchema(env);
  const version = "catalog-232-three-kingdoms-v2", row = await env.DB.prepare("SELECT setting_value FROM site_settings WHERE setting_key='master_catalog_version' LIMIT 1").first();
  if (row?.setting_value === version) {
    await ensureMasterPostCoverage(env);
    await ensureAdditionalMasterResults(env);
    await auditStoredMasterPosts(env);
    return;
  }
  await env.DB.batch([env.DB.prepare("DELETE FROM master_posts"), env.DB.prepare("DELETE FROM masters")]);
  await env.DB.batch(masterCatalog.map(([name, specialty], index) => env.DB.prepare("INSERT INTO masters(name,avatar,rank_no,specialty,enabled) VALUES(?,?,?,?,1)").bind(name, name.slice(0, 1), index + 1, specialty)));
  await generateNextPeriod(env, 232, 232);
  await env.DB.prepare("INSERT INTO site_settings(setting_key,setting_value,updated_at) VALUES('master_catalog_version',?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=CURRENT_TIMESTAMP").bind(version).run();
  await ensureMasterPostCoverage(env);
  await ensureAdditionalMasterResults(env);
  await auditStoredMasterPosts(env);
}
__name(ensureMasterCatalog, "ensureMasterCatalog");
async function ensureMasterPostCoverage(env) {
  const rows = await env.DB.prepare("SELECT lottery_type,MAX(period) period FROM content_items WHERE enabled=1 AND section_key<>'threeperiod' GROUP BY lottery_type").all();
  for (const row of rows.results || []) {
    const lotteryType = validLotteryType(row.lottery_type), period = Number(row.period || 0);
    if (!period) continue;
    const exists = await env.DB.prepare("SELECT 1 found FROM master_posts WHERE lottery_type=? AND period=? LIMIT 1").bind(lotteryType, period).first();
    if (!exists) await generateNextPeriod(env, period, period, lotteryType);
  }
}
__name(ensureMasterPostCoverage, "ensureMasterPostCoverage");
async function ensureAdditionalMasterResults(env) {
  const version = "split-master-results-v1", done = await env.DB.prepare("SELECT setting_value FROM site_settings WHERE setting_key='additional_master_result_version' LIMIT 1").first();
  if (done?.setting_value === version) return;
  await syncAdditionalLotteryTypes(env);
  await env.DB.prepare("INSERT INTO site_settings(setting_key,setting_value,updated_at) VALUES('additional_master_result_version',?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=CURRENT_TIMESTAMP").bind(version).run();
}
__name(ensureAdditionalMasterResults, "ensureAdditionalMasterResults");
async function publicMasters(env, lotteryType = 5) {
  lotteryType = validLotteryType(lotteryType);
  await ensureMasterRosterSchema(env);
  const [masters, posts] = await Promise.all([env.DB.prepare("SELECT id,name,avatar,rank_no,specialty,lottery_scope,replaces_master_id FROM masters WHERE enabled=1 AND lottery_scope IN (0,?) ORDER BY rank_no,id").bind(lotteryType).all(), env.DB.prepare("SELECT master_id,status,period FROM master_posts WHERE lottery_type=? AND status IN ('win','lose') ORDER BY master_id,period DESC,id DESC").bind(lotteryType).all()]), recent = /* @__PURE__ */ new Map();
  for (const post of posts.results || []) {
    if (!recent.has(post.master_id)) recent.set(post.master_id, []);
    const rows = recent.get(post.master_id);
    if (rows.length < 3) rows.push(post.status);
  }
  const roster = (masters.results || []).map((master) => {
    const rows = recent.get(master.id) || [], archived = rows.length === 3 && rows.every((status) => status === "lose");
    return { ...master, archived, streak: archived ? 3 : 0 };
  }), active = roster.filter((master) => !master.archived);
  let created = 0;
  if (active.length < 39) {
    const usedNames = new Set((await env.DB.prepare("SELECT name FROM masters").all()).results?.map((item) => item.name) || []), baseByRank = new Map(roster.filter((master) => master.lottery_scope === 0).map((master) => [Number(master.rank_no), master])), activeRanks = new Set(active.map((master) => Number(master.rank_no))), missing = Array.from({ length: 39 }, (_, index) => index + 1).filter((rank) => !activeRanks.has(rank));
    for (const rank of missing.slice(0, 39 - active.length)) {
      const base = baseByRank.get(rank) || masterCatalog[(rank - 1) % masterCatalog.length], availableName = replacementMasterNames.find((item) => !usedNames.has(item)), name = availableName || nextUniqueMasterName(usedNames), specialty = base.specialty || base[1] || "\u514D\u8D39\u8D44\u6599", replaced = roster.find((master2) => Number(master2.rank_no) === rank && master2.archived);
      const result = await env.DB.prepare("INSERT INTO masters(name,avatar,rank_no,specialty,lottery_scope,replaces_master_id,enabled) VALUES(?,?,?,?,?,?,1)").bind(name, name.slice(0, 1), rank, specialty, lotteryType, replaced?.id || 0).run(), master = { id: result.meta.last_row_id, name, avatar: name.slice(0, 1), rank_no: rank, specialty, lottery_scope: lotteryType, replaces_master_id: replaced?.id || 0, archived: false, streak: 0 };
      roster.push(master);
      active.push(master);
      usedNames.add(name);
      created++;
    }
    if (created) {
      const period = Number((await env.DB.prepare("SELECT MAX(period) period FROM content_items WHERE lottery_type=? AND enabled=1 AND section_key<>'threeperiod'").bind(lotteryType).first())?.period || 0);
      if (period) await generateNextPeriod(env, period, period, lotteryType);
    }
  }
  return roster.sort((a, b) => Number(a.rank_no) - Number(b.rank_no) || Number(a.id) - Number(b.id));
}
__name(publicMasters, "publicMasters");
async function activeMasterRows(env, lotteryType, masters) {
  const posts = await env.DB.prepare("SELECT master_id,status FROM master_posts WHERE lottery_type=? AND status IN ('win','lose') ORDER BY master_id,period DESC,id DESC").bind(lotteryType).all(), recent = /* @__PURE__ */ new Map();
  for (const post of posts.results || []) {
    if (!recent.has(post.master_id)) recent.set(post.master_id, []);
    const rows = recent.get(post.master_id);
    if (rows.length < 3) rows.push(post.status);
  }
  return (masters || []).filter((master) => {
    const rows = recent.get(master.id) || [];
    return !(rows.length === 3 && rows.every((status) => status === "lose"));
  });
}
__name(activeMasterRows, "activeMasterRows");
function normalizeMasterCategoryPick(specialty, contentJson) {
  const data = parseJson(contentJson);
  let pick = String(data.pick || ""), changed = false;
  if (specialty.includes("\u5C3E") && !/\d尾/.test(pick)) {
    const inside = (pick.match(/【([^】]*)】/) || [])[1] || "", tails = inside.replace(/\D/g, "").split("").filter(Boolean).map((value) => value + "\u5C3E").join("\xB7");
    if (tails) {
      pick = specialty + "\u3010" + tails + "\u3011";
      changed = true;
    }
  }
  if (specialty === "\u5408\u6570\u5355\u53CC" && !/【合数[单双]】/.test(pick)) {
    pick = specialty + "\u3010" + (pick.includes("\u5355\u6570") ? "\u5408\u6570\u5355" : "\u5408\u6570\u53CC") + "\u3011";
    changed = true;
  }
  if (specialty === "\u80C6\u5927\u80C6\u5C0F" && !/[大小]数/.test(pick)) {
    pick = specialty + "\u3010" + (pick.includes("\u5355\u6570") ? "\u5C0F\u6570" : "\u5927\u6570") + "\u3011";
    changed = true;
  }
  if (changed) data.pick = pick;
  return { changed, contentJson: changed ? JSON.stringify(data) : contentJson };
}
__name(normalizeMasterCategoryPick, "normalizeMasterCategoryPick");
async function auditStoredMasterPosts(env) {
  const version = "category-audit-v5", done = await env.DB.prepare("SELECT setting_value FROM site_settings WHERE setting_key='master_post_audit_version' LIMIT 1").first();
  if (done?.setting_value === version) return;
  const rows = await env.DB.prepare("SELECT p.id,p.content_json,p.result_text,m.specialty FROM master_posts p JOIN masters m ON m.id=p.master_id WHERE m.specialty NOT LIKE '%\u6CE2%' AND m.specialty NOT LIKE '%\u4E00\u884C%' AND m.specialty NOT LIKE '%\u5409\u51F6%'").all(), updates = [];
  for (const row of rows.results || []) {
    const normalized = normalizeMasterCategoryPick(row.specialty, row.content_json);
    if (normalized.changed) row.content_json = normalized.contentJson;
    const match = String(row.result_text || "").match(/开:([^0-9])([0-9]{1,2})/);
    if (!match) {
      if (normalized.changed) updates.push(env.DB.prepare("UPDATE master_posts SET content_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.content_json, row.id));
      continue;
    }
    const verdict = evaluatePost(row, { shengXiao: match[1], number: Number(match[2]) });
    if (verdict === null) continue;
    updates.push(env.DB.prepare("UPDATE master_posts SET content_json=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.content_json, verdict ? "win" : "lose", row.id));
  }
  for (let offset = 0; offset < updates.length; offset += 80) await env.DB.batch(updates.slice(offset, offset + 80));
  await env.DB.prepare("INSERT INTO site_settings(setting_key,setting_value,updated_at) VALUES('master_post_audit_version',?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=CURRENT_TIMESTAMP").bind(version).run();
}
__name(auditStoredMasterPosts, "auditStoredMasterPosts");
async function auditStoredIdiomContent(env) {
  const version = "idiom-all-draw-zodiacs-v2", done = await env.DB.prepare("SELECT setting_value FROM site_settings WHERE setting_key='idiom_content_audit_version' LIMIT 1").first();
  if (done?.setting_value === version) return;
  const rows = await env.DB.prepare("SELECT id,lottery_type,period,section_key,content_json,result_text,status FROM content_items WHERE section_key='idiom'").all(), updates = [], draws = /* @__PURE__ */ new Map(), year = (/* @__PURE__ */ new Date()).getUTCFullYear();
  for (const lotteryType of [1, 5, 8]) {
    try {
      const response = await fetch("https://6htv70.com/gallerynew/h5/lottery/search?pageNum=1&year=" + year + "&sort=1&lotteryType=" + lotteryType, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0" } }), payload = response.ok ? await response.json() : null;
      for (const record of payload?.data?.recordList || []) draws.set(lotteryType + ":" + Number(record.period), record);
    } catch (error) {
      console.error("idiom_history_fetch_failed", lotteryType, error?.message || error);
    }
  }
  for (const row of rows.results || []) {
    const data = parseJson(row.content_json), target = idiomTarget(data);
    if (target) data.zodiac = target;
    const draw = draws.get(validLotteryType(row.lottery_type) + ":" + Number(row.period)), numbers = Array.isArray(draw?.numberList) ? draw.numberList : [], allZodiacs = new Set(numbers.map((item) => String(item?.shengXiao || "")).filter((item) => VALID_ZODIACS.has(item))), special = numbers[numbers.length - 1];
    if (numbers.length && special?.number && special?.shengXiao) {
      const status = allZodiacs.has(target) ? "win" : "lose", result = "\u5F00:" + special.shengXiao + String(special.number).padStart(2, "0");
      updates.push(env.DB.prepare("UPDATE content_items SET content_json=?,result_text=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(JSON.stringify(data), result, status, row.id));
    } else updates.push(env.DB.prepare("UPDATE content_items SET content_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(JSON.stringify(data), row.id));
  }
  for (let offset = 0; offset < updates.length; offset += 80) await env.DB.batch(updates.slice(offset, offset + 80));
  await env.DB.prepare("INSERT INTO site_settings(setting_key,setting_value,updated_at) VALUES('idiom_content_audit_version',?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=CURRENT_TIMESTAMP").bind(version).run();
}
__name(auditStoredIdiomContent, "auditStoredIdiomContent");
async function generateNextPeriod(env, period, seed, lotteryType = 5) {
  if (!period) return { period: 0, created: 0, posts: 0 };
  lotteryType = validLotteryType(lotteryType);
  await ensureContentLotteryType(env);
  const random = rngFor(period * 100 + (Number(seed) || 0) + lotteryType * 1000003), zs = /* @__PURE__ */ __name((count) => sample(zodiacOrder, count, random), "zs"), ns = /* @__PURE__ */ __name((count) => sample(numberPool, count, random).sort((a, b) => a - b), "ns"), heads = /* @__PURE__ */ __name(() => sample(["0\u5934", "1\u5934", "2\u5934", "3\u5934", "4\u5934"], 3, random), "heads"), pair = /* @__PURE__ */ __name(() => sample(waves, 2, random), "pair"), els = /* @__PURE__ */ __name(() => sample(elements, 3, random), "els"), threePeriodStart = period - ((period - 226) % 3 + 3) % 3;
  const six = zs(6), sixNumbers = sample(numbersFor(six), 6, random).map((n) => String(n).padStart(2, "0"));
  const studyZ = zs(9), nine = zs(9), threeZ = zs(3), parity = random() < 0.5 ? "\u5355\u6570" : "\u53CC\u6570", sumParity = random() < 0.5 ? "\u5408\u6570\u5355" : "\u5408\u6570\u53CC", home = random() < 0.5 ? "\u5BB6\u79BD" : "\u91CE\u517D", idiom = idioms[Math.floor(random() * idioms.length)];
  const templates = [
    ...[[4, "\u56DB\u8096"], [5, "\u4E94\u8096"], [7, "\u4E03\u8096"], [9, "\u4E5D\u8096"]].map(([count, title], index) => ["study", title, { kind: title, pick: studyZ.slice(0, count).join("") }, index + 1]),
    ["study", "\u5355\u53CC", { kind: "\u5355\u53CC", pick: parity + "+" + zs(2).join("") }, 5],
    ["study", "\u6CE2\u8272", { kind: "\u6CE2\u8272", pick: pair().join("+") }, 6],
    ["study", "\u5BB6\u91CE", { kind: "\u5BB6\u91CE", pick: home + "+" + zs(2).join("") }, 7],
    ["study", "\u4E03\u5C3E", { kind: "\u4E03\u5C3E", pick: sample([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 7, random).join("") }, 8],
    ["sixcode", "6\u8096", { kind: "6\u8096", zodiac: six.join(""), numbers: "\u2465\u7801" + sixNumbers.join(".") }, 1],
    ["sixcode", "4\u8096", { kind: "4\u8096", zodiac: six.slice(0, 4).join(""), numbers: "\u2463\u7801" + sixNumbers.slice(0, 4).join(".") }, 2],
    ["sixcode", "2\u8096", { kind: "2\u8096", zodiac: six.slice(0, 2).join(""), numbers: "\u2461\u7801" + sixNumbers.slice(0, 2).join(".") }, 3],
    ["doublewave", "\u725B\u903C\u53CC\u6CE2", { pick: "\u725B\u903C\u53CC\u6CE2\u3010" + pair().join("") + "\u3011" }, 0],
    ["homewild", "\u5BB6\u91CE\u51FA\u7279", { pick: "\u5BB6\u91CE\u51FA\u7279\u3010" + home + "+" + zs(2).join("") + "\u3011" }, 0],
    ["idiom", "\u6210\u8BED\u7206\u5E73\u7279", { pick: "\u6210\u8BED\u7206\u5E73\u7279\u3010" + idiom + "\u3011", zodiac: idiomZodiacMap[idiom] }, 0],
    ["threehead", "\u4E09\u5934\u7206\u7279", { pick: "\u4E09\u5934\u7206\u7279\u3010" + heads().join("") + "\u3011" }, 0],
    ["threeperiod", "\u4E09\u671F\u5FC5\u4E2D", { issues: [threePeriodStart, threePeriodStart + 1, threePeriodStart + 2], pick: "\u4E09\u671F\u5FC5\u4E2D\uFF08" + zs(4).join("") + "\uFF09", opens: ["\u5F00:\uFF1F00", "\u5F00:\uFF1F00", "\u5F00:\uFF1F00"] }, 0],
    ["sumparity", "\u5408\u6570\u5355\u53CC", { pick: "\u5408\u6570\u5355\u53CC\u3010" + sumParity + "\u3011" }, 0],
    ...[[3, "\u2462\u8096"], [5, "\u2464\u8096"], [7, "\u2466\u8096"], [9, "\u2468\u8096"]].map(([count, title], index) => ["ninezodiac", title, { kind: title, pick: nine.slice(0, count).join("") }, index + 1]),
    ["threeelements", "\u4E09\u884C\u4E2D\u7279", { pick: "\u4E09\u884C\u4E2D\u7279\u3010" + els().join("") + "\u3011" }, 0],
    ["loseall", "\u8F93\u5C3D\u5149\u751F\u8096", { pick: "\u4ECA\u671F\u4E70" + threeZ.join("") + "\u8F93\u5C3D\u5149" }, 0],
    ["thirty", "\u7CBE\u900930\u7801", { numbers: ns(30), open: "\u5F85\u5F00\u5956" }, 0],
    ["singledouble", "\u5355\u53CC\u4E2D\u7279", { pick: "\u5355\u53CC\u4E2D\u7279\u3010" + parity + "+" + zs(2).join("") + "\u3011" }, 0],
    ["kill", "\u7EDD\u6740\u4E13\u533A", { fields: [zs(1)[0] + "\u8096", Math.floor(random() * 10) + "\u5C3E", waves[Math.floor(random() * 3)].replace("\u6CE2", random() < 0.5 ? "\u5355" : "\u53CC"), Math.floor(random() * 5) + "\u5934"] }, 0]
  ];
  const statements = [];
  for (const [section, title, data, sort] of templates) {
    const recordPeriod = section === "threeperiod" ? threePeriodStart + 2 : period;
    statements.push(env.DB.prepare("INSERT INTO content_items(lottery_type,section_key,period,title,content_json,result_text,status,sort_order,enabled) SELECT ?,?,?,?,?,'\u5F85\u5F00\u5956','pending',?,1 WHERE NOT EXISTS(SELECT 1 FROM content_items WHERE lottery_type=? AND section_key=? AND period=? AND title=? AND sort_order=?)").bind(lotteryType, section, recordPeriod, title, JSON.stringify(data), sort, lotteryType, section, recordPeriod, title, sort));
  }
  await ensureMasterRosterSchema(env);
  const masterResult = await env.DB.prepare("SELECT id,specialty FROM masters WHERE enabled=1 AND lottery_scope IN (0,?) ORDER BY rank_no,id").bind(lotteryType).all(), masters = await activeMasterRows(env, lotteryType, masterResult.results || []);
  for (const master of masters) {
    const specialty = String(master.specialty || "\u514D\u8D39\u8D44\u6599");
    let pick = zs(3).join(""), count = Number(specialty.match(/[四五六七八九]/)?.[0]?.replace("\u56DB", "4").replace("\u4E94", "5").replace("\u516D", "6").replace("\u4E03", "7").replace("\u516B", "8").replace("\u4E5D", "9")) || 0;
    if (specialty.includes("11\u7801")) pick = ns(11).map((n) => String(n).padStart(2, "0")).join(".");
    else if (specialty.includes("\u516B\u7801") || specialty.includes("\u4E94\u7801")) pick = ns(specialty.includes("\u516B\u7801") ? 8 : 5).map((n) => String(n).padStart(2, "0")).join(".");
    else if (specialty.includes("\u5C3E")) pick = sample([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], count || 1, random).map((n) => n + "\u5C3E").join("\xB7");
    else if (specialty.includes("\u8096")) pick = zs(count || (/二肖/.test(specialty) ? 2 : /一肖/.test(specialty) ? 1 : 3)).join("");
    else if (specialty.includes("\u6CE2")) pick = pair().join("+");
    else if (specialty.includes("\u5934")) pick = heads().slice(0, 1).join("");
    else if (specialty.includes("\u5355\u53CC") || specialty.includes("\u80C6\u5927")) pick = parity + "+" + zs(2).join("");
    else if (specialty.includes("\u5408\u6570")) pick = sumParity;
    else if (specialty.includes("\u4E00\u5408")) pick = random() < 0.5 ? "\u5408\u6570\u5355" : "\u5408\u6570\u53CC";
    else if (specialty.includes("\u4E00\u884C")) pick = elements[Math.floor(random() * elements.length)];
    else if (specialty.includes("\u5BB6\u79BD")) pick = home + "+" + zs(2).join("");
    else if (specialty.includes("\u5927\u5C0F")) pick = (random() < 0.5 ? "\u5927\u6570" : "\u5C0F\u6570") + "+" + zs(2).join("");
    else if (specialty.includes("\u5929\u5730")) pick = (random() < 0.5 ? "\u5929\u8096" : "\u5730\u8096") + "+" + zs(3).join("");
    else if (specialty.includes("\u5409\u51F6")) pick = (random() < 0.5 ? "\u5409\u6570" : "\u51F6\u6570") + "+" + zs(2).join("");
    else if (specialty.includes("\u4E1C\u5357\u897F\u5317")) pick = sample(["\u4E1C", "\u5357", "\u897F", "\u5317"], 2, random).join("+");
    statements.push(env.DB.prepare("INSERT OR IGNORE INTO master_posts(lottery_type,master_id,period,content_json,result_text,status) VALUES(?,?,?,?, '\u5F85\u5F00\u5956','pending')").bind(lotteryType, master.id, period, JSON.stringify({ pick: specialty + "\u3010" + pick + "\u3011" })));
  }
  const results = statements.length ? await env.DB.batch(statements) : [], created = results.slice(0, templates.length).reduce((n, r) => n + Number(r.meta?.changes || 0), 0), posts = results.slice(templates.length).reduce((n, r) => n + Number(r.meta?.changes || 0), 0);
  const generatedPosts = await env.DB.prepare("SELECT p.id,p.content_json,m.specialty FROM master_posts p JOIN masters m ON m.id=p.master_id WHERE p.lottery_type=? AND p.period=?").bind(lotteryType, period).all(), categoryUpdates = [];
  for (const row of generatedPosts.results || []) {
    const normalized = normalizeMasterCategoryPick(row.specialty, row.content_json);
    if (normalized.changed) categoryUpdates.push(env.DB.prepare("UPDATE master_posts SET content_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(normalized.contentJson, row.id));
  }
  if (categoryUpdates.length) await env.DB.batch(categoryUpdates);
  return { period, created, posts };
}
__name(generateNextPeriod, "generateNextPeriod");
async function auditPeriod(env, requestedPeriod = 0, lotteryType = 5) {
  lotteryType = validLotteryType(lotteryType);
  const latest = requestedPeriod || Number((await env.DB.prepare("SELECT MAX(period) period FROM content_items WHERE lottery_type=? AND enabled=1").bind(lotteryType).first())?.period || 0);
  if (!latest) return { period: 0, passed: false, issues: ["\u5C1A\u65E0\u8D44\u6599"], sections: [], postCount: 0 };
  const [content, posts] = await Promise.all([env.DB.prepare("SELECT section_key,period,title,content_json FROM content_items WHERE lottery_type=? AND enabled=1 AND (period=? OR section_key='threeperiod') ORDER BY section_key,sort_order,id").bind(lotteryType, latest).all(), env.DB.prepare("SELECT COUNT(*) count FROM master_posts WHERE lottery_type=? AND period=?").bind(lotteryType, latest).first()]);
  const rows = content.results || [], sections = [], issues = [], seen = /* @__PURE__ */ new Map();
  for (const [key, expected] of Object.entries(expectedSections)) {
    const own = rows.filter((row) => row.section_key === key && (key !== "threeperiod" || (parseJson(row.content_json).issues || []).map(Number).includes(latest))), problems = [];
    if (own.length !== expected) problems.push("\u5E94\u6709" + expected + "\u6761\uFF0C\u5B9E\u9645" + own.length + "\u6761");
    for (const row of own) {
      let data;
      try {
        data = JSON.parse(row.content_json || "");
      } catch {
        problems.push(row.title + " JSON\u683C\u5F0F\u9519\u8BEF");
        continue;
      }
      const value = String(data.pick || data.zodiac || data.numbers || data.fields || "").trim();
      if (!value) problems.push(row.title + " \u5185\u5BB9\u4E3A\u7A7A");
      else {
        const signature = key + "|" + value;
        if (seen.has(signature)) problems.push(row.title + " \u5185\u5BB9\u91CD\u590D");
        seen.set(signature, true);
      }
    }
    sections.push({ key, expected, actual: own.length, passed: problems.length === 0, problems });
    for (const problem of problems) issues.push(key + "\uFF1A" + problem);
  }
  const postCount = Number(posts?.count || 0);
  if (postCount < 1) issues.push("\u9AD8\u624B\u5E16\u5B50\uFF1A\u5F53\u524D\u671F\u6CA1\u6709\u5185\u5BB9");
  return { period: latest, passed: issues.length === 0, issues, sections, postCount };
}
__name(auditPeriod, "auditPeriod");
async function fetchLatestLottery(lotteryType = 5) {
  lotteryType = validLotteryType(lotteryType);
  const response = await fetch("https://6htv70.com/gallerynew/h5/index/lastLotteryRecord?lotteryType=" + lotteryType, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error("\u5F00\u5956\u63A5\u53E3 HTTP " + response.status);
  const payload = await response.json();
  if (!payload || payload.code !== 1e4 || !payload.data) throw new Error("\u5F00\u5956\u63A5\u53E3\u8FD4\u56DE\u5F02\u5E38");
  return payload;
}
__name(fetchLatestLottery, "fetchLatestLottery");
async function homepageInitialData(env) {
  const byType = { 1: [], 5: [], 8: [] };
  try {
    const content = await env.DB.prepare("SELECT * FROM content_items WHERE lottery_type IN (1,5,8) AND enabled=1 ORDER BY lottery_type,period DESC,sort_order,id LIMIT 1500").all();
    for (const row of content.results || []) (byType[validLotteryType(row.lottery_type)] || byType[5]).push(row);
  } catch (error) {
    console.error("homepage_typed_content_failed", error?.message || error);
    const legacy = await env.DB.prepare("SELECT * FROM content_items WHERE enabled=1 ORDER BY period DESC,sort_order,id LIMIT 500").all();
    for (const type of [1, 5, 8]) byType[type] = (legacy.results || []).map((row) => ({ ...row, lottery_type: type }));
  }
  let masters = [];
  try {
    await ensureMasterRosterSchema(env);
    masters = (await env.DB.prepare("SELECT id,name,avatar,rank_no,specialty FROM masters WHERE enabled=1 AND lottery_scope=0 ORDER BY rank_no,id").all()).results || [];
  } catch (error) {
    console.error("homepage_masters_failed", error?.message || error);
  }
  return { contentByType: byType, masters };
}
__name(homepageInitialData, "homepageInitialData");
var VALID_ZODIACS = /* @__PURE__ */ new Set(["\u9F20", "\u725B", "\u864E", "\u5154", "\u9F99", "\u86C7", "\u9A6C", "\u7F8A", "\u7334", "\u9E21", "\u72D7", "\u732A"]);
var DRAW_CHECK_VERSION = "v5-all-draw-zodiacs";
function normalizeDraw(payload) {
  const draw = payload?.data || {}, period = Number(draw.period || draw.intPeriod), numbers = Array.isArray(draw.numberList) ? draw.numberList : [], special = numbers[numbers.length - 1] || {}, rawNumber = String(special.number ?? "").trim(), number = Number(rawNumber), zodiac = String(special.shengXiao ?? "").trim();
  const complete = Number.isInteger(period) && period > 0 && /^\d{1,2}$/.test(rawNumber) && Number.isInteger(number) && number >= 1 && number <= 49 && VALID_ZODIACS.has(zodiac);
  const allZodiacs = [...new Set(numbers.map((item) => String(item?.shengXiao || "").trim()).filter((item) => VALID_ZODIACS.has(item)))];
  return { draw, period, numbers, special: { ...special, allZodiacs }, number, zodiac, allZodiacs, complete };
}
__name(normalizeDraw, "normalizeDraw");
async function logWaitingDraw(env, drawInfo) {
  const latest = await env.DB.prepare("SELECT started_at FROM automation_runs WHERE task_key='result_check' AND status='waiting' ORDER BY id DESC LIMIT 1").first();
  if (latest && Date.now() - Date.parse(String(latest.started_at).replace(" ", "T") + "Z") < 20 * 60 * 1e3) return;
  const shown = String(drawInfo.special?.shengXiao ?? "") + String(drawInfo.special?.number ?? "");
  await env.DB.prepare("INSERT INTO automation_runs(task_key,period,status,message,finished_at) VALUES('result_check',?,'waiting',?,CURRENT_TIMESTAMP)").bind(drawInfo.period || null, "\u7B49\u5F85\u5B8C\u6574\u5F00\u5956\u7ED3\u679C" + (shown ? "\uFF1A" + shown : "")).run();
}
__name(logWaitingDraw, "logWaitingDraw");
async function ensureFixedThreePeriodGroups(env) {
  const version = "fixed-groups-backfill-v3", saved = await env.DB.prepare("SELECT setting_value FROM site_settings WHERE setting_key='threeperiod_group_version' LIMIT 1").first();
  if (saved?.setting_value === version) return;
  const rows = await env.DB.prepare("SELECT id,period,content_json FROM content_items WHERE section_key='threeperiod' ORDER BY id").all(), seen = /* @__PURE__ */ new Set(), changes = [];
  for (const row2 of rows.results || []) {
    const data = parseJson(row2.content_json), issues = Array.isArray(data.issues) ? data.issues.map(Number) : [], start = issues[0], valid = issues.length === 3 && issues[1] === start + 1 && issues[2] === start + 2 && ((start - 226) % 3 + 3) % 3 === 0;
    if (!valid || seen.has(start)) {
      changes.push(env.DB.prepare("DELETE FROM content_items WHERE id=?").bind(row2.id));
      continue;
    }
    seen.add(start);
    changes.push(env.DB.prepare("UPDATE content_items SET period=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(start + 2, row2.id));
  }
  if (changes.length) await env.DB.batch(changes);
  let row = await env.DB.prepare("SELECT id,content_json FROM content_items WHERE section_key='threeperiod' AND period=234 ORDER BY id LIMIT 1").first();
  if (!row) {
    await generateNextPeriod(env, 232, 232);
    row = await env.DB.prepare("SELECT id,content_json FROM content_items WHERE section_key='threeperiod' AND period=234 ORDER BY id LIMIT 1").first();
  }
  if (row) {
    const data = parseJson(row.content_json), pick = String(data.pick || "\u4E09\u671F\u5FC5\u4E2D\uFF08\u9A6C\u86C7\u9F99\u5154\uFF09");
    await env.DB.prepare("UPDATE content_items SET content_json=?,result_text='\u5F85\u5F00\u5956',status='pending',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(JSON.stringify({ issues: [232, 233, 234], pick, opens: ["\u5F00:\uFF1F00", "\u5F00:\uFF1F00", "\u5F00:\uFF1F00"] }), row.id).run();
  }
  const groups = await env.DB.prepare("SELECT id,content_json FROM content_items WHERE section_key='threeperiod' AND enabled=1 ORDER BY period,id").all();
  for (const group of groups.results || []) {
    const data = parseJson(group.content_json), issues = Array.isArray(data.issues) ? data.issues.map(Number) : [], opens = Array.isArray(data.opens) ? [...data.opens] : [];
    if (issues.length !== 3) continue;
    while (opens.length < issues.length) opens.push("\u5F00:\uFF1F00");
    let changed = false;
    for (let index = 0; index < issues.length; index++) {
      if (!/\?|？|待开奖/.test(String(opens[index] || ""))) continue;
      const settled = await env.DB.prepare("SELECT result_text FROM content_items WHERE lottery_type=5 AND period=? AND section_key<>'threeperiod' AND status IN ('win','lose') AND result_text NOT LIKE '%?%' AND result_text NOT LIKE '%\uFF1F%' AND result_text<>'\u5F85\u5F00\u5956' ORDER BY id DESC LIMIT 1").bind(issues[index]).first();
      if (settled?.result_text) {
        opens[index] = settled.result_text;
        changed = true;
      }
    }
    if (!changed) continue;
    data.opens = opens;
    const pick = String(data.pick || ""), hit = opens.some((open) => [...VALID_ZODIACS].some((item) => pick.includes(item) && String(open).includes(item))), finished = opens.every((open) => !/\?|？|待开奖/.test(String(open))), status = hit ? "win" : finished ? "lose" : "pending", lastResult = [...opens].reverse().find((open) => !/\?|？|待开奖/.test(String(open))) || "\u5F85\u5F00\u5956";
    await env.DB.prepare("UPDATE content_items SET content_json=?,result_text=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(JSON.stringify(data), lastResult, status, group.id).run();
  }
  await env.DB.prepare("INSERT INTO site_settings(setting_key,setting_value,updated_at) VALUES('threeperiod_group_version',?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=CURRENT_TIMESTAMP").bind(version).run();
}
__name(ensureFixedThreePeriodGroups, "ensureFixedThreePeriodGroups");
async function runResultCheck(env, latestPayload = null) {
  const created = await env.DB.prepare("INSERT INTO automation_runs(task_key,status,message) VALUES('result_check','running','\u6B63\u5728\u8BFB\u53D6\u6FB3\u95E8\u5F00\u5956\u7ED3\u679C')").run(), runId = created.meta.last_row_id;
  try {
    const payload = latestPayload || await fetchLatestLottery();
    const info = normalizeDraw(payload), { draw, period, special } = info;
    if (!info.complete) throw new Error("\u5C1A\u672A\u53D6\u5F97\u5B8C\u6574\u5F00\u5956\u7ED3\u679C\uFF08\u9700\u898101-49\u53F7\u7801\u53CA\u6B63\u786E\u751F\u8096\uFF09");
    await ensureFixedThreePeriodGroups(env);
    await env.DB.batch([env.DB.prepare("UPDATE content_items SET result_text='\u5F85\u5F00\u5956',status='pending',updated_at=CURRENT_TIMESTAMP WHERE lottery_type=5 AND period=? AND enabled=1 AND section_key<>'threeperiod'").bind(period), env.DB.prepare("UPDATE master_posts SET result_text='\u5F85\u5F00\u5956',status='pending',updated_at=CURRENT_TIMESTAMP WHERE lottery_type=5 AND period=?").bind(period)]);
    const [content, posts] = await Promise.all([env.DB.prepare("SELECT * FROM content_items WHERE lottery_type=5 AND enabled=1 AND ((period=? AND status='pending') OR section_key='threeperiod')").bind(period).all(), env.DB.prepare("SELECT * FROM master_posts WHERE lottery_type=5 AND period=? AND status='pending'").bind(period).all()]);
    const updates = [], result = "\u5F00:" + info.zodiac + String(info.number).padStart(2, "0");
    let checked = 0;
    for (const row of content.results || []) {
      if (row.section_key === "threeperiod") {
        const data = parseJson(row.content_json), issues = Array.isArray(data.issues) ? data.issues.map(Number) : [], index = issues.indexOf(period);
        if (index < 0) continue;
        const opens = Array.isArray(data.opens) ? [...data.opens] : [];
        while (opens.length < issues.length) opens.push("\u5F00:\uFF1F00");
        opens[index] = result;
        data.opens = opens;
        const pick = String(data.pick || ""), hit = opens.some((open) => [...VALID_ZODIACS].some((item) => pick.includes(item) && String(open).includes(item))), finished = opens.slice(0, issues.length).every((open) => !/\?|\uff1f|待开奖/.test(String(open))), status = hit ? "win" : finished ? "lose" : "pending";
        checked++;
        updates.push(env.DB.prepare("UPDATE content_items SET content_json=?,result_text=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(JSON.stringify(data), result, status, row.id));
        continue;
      }
      const verdict = evaluateContent(row, special);
      if (verdict === null) continue;
      checked++;
      updates.push(env.DB.prepare("UPDATE content_items SET result_text=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(result, verdict ? "win" : "lose", row.id));
    }
    for (const row of posts.results || []) {
      const verdict = evaluatePost(row, special);
      if (verdict === null) continue;
      checked++;
      updates.push(env.DB.prepare("UPDATE master_posts SET result_text=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(result, verdict ? "win" : "lose", row.id));
    }
    if (updates.length) await env.DB.batch(updates);
    const nextPeriod = Number(draw.nextLotteryNumber || draw.nextIntLotteryNumber || period + 1), generated = await generateNextPeriod(env, nextPeriod, info.number), audit = await auditPeriod(env, nextPeriod), signature = DRAW_CHECK_VERSION + ":" + period + ":" + info.number + ":" + info.zodiac;
    const message = "\u6838\u5BF9\u5B8C\u6210\uFF1A" + result + "\uFF1B" + nextPeriod + "\u671F\u751F\u6210\u8D44\u6599" + generated.created + "\u6761\u3001\u9AD8\u624B\u5E16\u5B50" + generated.posts + "\u6761\uFF1B\u8D28\u91CF\u68C0\u67E5" + (audit.passed ? "\u901A\u8FC7" : "\u53D1\u73B0" + audit.issues.length + "\u9879\u95EE\u9898");
    await env.DB.batch([env.DB.prepare("UPDATE automation_runs SET period=?,status='success',checked_count=?,updated_count=?,message=?,finished_at=CURRENT_TIMESTAMP WHERE id=?").bind(period, checked, updates.length, message, runId), env.DB.prepare("INSERT INTO site_settings(setting_key,setting_value,updated_at) VALUES('last_processed_draw',?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=CURRENT_TIMESTAMP").bind(String(period)), env.DB.prepare("INSERT INTO site_settings(setting_key,setting_value,updated_at) VALUES('last_processed_draw_signature',?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=CURRENT_TIMESTAMP").bind(signature)]);
    return { period, checked, updated: updates.length, result, nextPeriod, generated, audit };
  } catch (error) {
    await env.DB.prepare("UPDATE automation_runs SET status='failed',message=?,finished_at=CURRENT_TIMESTAMP WHERE id=?").bind(cleanText(error?.message || "\u81EA\u52A8\u6838\u5BF9\u5931\u8D25", 500), runId).run();
    throw error;
  }
}
__name(runResultCheck, "runResultCheck");
async function maybeRunResultCheck(env) {
  const now = /* @__PURE__ */ new Date(), minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (minutes < 13 * 60 + 30 || minutes > 15 * 60 + 20) return;
  const row = await env.DB.prepare("SELECT setting_value FROM site_settings WHERE setting_key='last_auto_check' LIMIT 1").first(), last = Number(row?.setting_value || 0);
  if (Date.now() - last < 9e4) return;
  await env.DB.prepare("INSERT INTO site_settings(setting_key,setting_value,updated_at) VALUES('last_auto_check',?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=CURRENT_TIMESTAMP").bind(String(Date.now())).run();
  const payload = await fetchLatestLottery(), info = normalizeDraw(payload), period = info.period;
  if (!period) return;
  if (!info.complete) {
    await logWaitingDraw(env, info);
    return;
  }
  const [processed, signature] = await Promise.all([env.DB.prepare("SELECT setting_value FROM site_settings WHERE setting_key='last_processed_draw' LIMIT 1").first(), env.DB.prepare("SELECT setting_value FROM site_settings WHERE setting_key='last_processed_draw_signature' LIMIT 1").first()]), currentSignature = DRAW_CHECK_VERSION + ":" + period + ":" + info.number + ":" + info.zodiac;
  if (Number(processed?.setting_value || 0) >= period && signature?.setting_value === currentSignature) return;
  await runResultCheck(env, payload);
}
__name(maybeRunResultCheck, "maybeRunResultCheck");
async function syncAdditionalLotteryTypes(env) {
  const names = { 1: "\u9999\u6E2F", 8: "\u5929\u5929" };
  for (const lotteryType of [1, 8]) {
    const payload = await fetchLatestLottery(lotteryType), info = normalizeDraw(payload);
    if (!info.complete) continue;
    const { draw, period, special } = info, result = "\u5F00:" + info.zodiac + String(info.number).padStart(2, "0");
    const [rows, posts] = await Promise.all([env.DB.prepare("SELECT * FROM content_items WHERE lottery_type=? AND enabled=1 AND period=? AND section_key<>'threeperiod'").bind(lotteryType, period).all(), env.DB.prepare("SELECT * FROM master_posts WHERE lottery_type=? AND period=?").bind(lotteryType, period).all()]), updates = [];
    for (const row of rows.results || []) {
      const verdict = evaluateContent(row, special);
      if (verdict === null) continue;
      updates.push(env.DB.prepare("UPDATE content_items SET result_text=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(result, verdict ? "win" : "lose", row.id));
    }
    for (const row of posts.results || []) {
      const verdict = evaluatePost(row, special);
      if (verdict === null) continue;
      updates.push(env.DB.prepare("UPDATE master_posts SET result_text=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(result, verdict ? "win" : "lose", row.id));
    }
    if (updates.length) await env.DB.batch(updates);
    const nextPeriod = Number(draw.nextLotteryNumber || draw.nextIntLotteryNumber || period + 1), generated = await generateNextPeriod(env, nextPeriod, info.number, lotteryType);
    await env.DB.prepare("INSERT INTO automation_runs(task_key,period,status,checked_count,updated_count,message,finished_at) VALUES(?,?, 'success',?,?,?,CURRENT_TIMESTAMP)").bind("result_check_" + lotteryType, period, (rows.results || []).length + (posts.results || []).length, updates.length, names[lotteryType] + "\u6838\u5BF9\u5B8C\u6210\uFF1A" + result + "\uFF1B" + nextPeriod + "\u671F\u751F\u6210\u8D44\u6599" + generated.created + "\u6761\u3001\u9AD8\u624B\u5E16\u5B50" + generated.posts + "\u6761").run();
  }
}
__name(syncAdditionalLotteryTypes, "syncAdditionalLotteryTypes");
async function runAllLotteryChecks(env) {
  const macau = await runResultCheck(env);
  await syncAdditionalLotteryTypes(env);
  return macau;
}
__name(runAllLotteryChecks, "runAllLotteryChecks");
async function handleWuqi(url) {
  const types = { 1: "xg", 5: "xam", 8: "tt" }, lotteryType = cleanInt(url.searchParams.get("lotteryType"), 5), page = Math.min(100, Math.max(1, cleanInt(url.searchParams.get("page"), 1))), type = types[lotteryType];
  if (!type) return json({ success: false, message: "\u5F69\u79CD\u53C2\u6570\u9519\u8BEF" }, 422);
  try {
    const response = await fetch("https://lhw.235-from.com/index/wuqiapi/getwuqibizhong", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "accept": "application/json", "user-agent": "Mozilla/5.0" }, body: new URLSearchParams({ page: String(page), type }) });
    if (!response.ok) throw new Error("HTTP " + response.status);
    return new Response(response.body, { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  } catch (error) {
    console.error("wuqi_fetch_failed", error?.message || error);
    return json({ success: false, message: "\u4E94\u671F\u5FC5\u4E2D\u63A5\u53E3\u6682\u65F6\u4E0D\u53EF\u7528" }, 502);
  }
}
__name(handleWuqi, "handleWuqi");
async function kingThirtyRaw(env, lotteryType = 5) {
  const type = { 1: "xg", 5: "xam", 8: "tt" }[Number(lotteryType)] || "xam";
  try {
    const response = await env.KING_SITE.fetch(new Request("https://liuhe-king-site/api/materials?category=thirty&type=" + type + "&page=1&pageSize=5", { headers: { accept: "application/json", "cache-control": "no-cache" } }));
    return new Response(response.body, { status: response.status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  } catch (error) {
    console.error("king_thirty_raw_failed", error?.message || error);
    return json({ success: false, message: "30\u7801\u8D44\u6599\u6682\u65F6\u4E0D\u53EF\u7528" }, 502);
  }
}
__name(kingThirtyRaw, "kingThirtyRaw");
var materialList = /* @__PURE__ */ __name((payload) => {
  const arrays = [];
  const walk = /* @__PURE__ */ __name((node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      if (node.length) arrays.push(node);
      node.forEach(walk);
      return;
    }
    Object.values(node).forEach(walk);
  }, "walk");
  walk(payload);
  const scored = arrays.map((value) => ({ value, score: value.reduce((total, item) => total + (item && typeof item === "object" && (item.period || item.issue || item.issueNo || item.intPeriod) ? 10 : 0), 0) + Math.min(value.length, 20) })).sort((a, b) => b.score - a.score);
  return scored[0]?.value || [];
}, "materialList");
var materialContent = /* @__PURE__ */ __name((item) => {
  let value = item?.content ?? item?.data ?? item?.value ?? {};
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
    }
  }
  return value;
}, "materialContent");
var materialScalars = /* @__PURE__ */ __name((value) => {
  const out = [];
  const walk = /* @__PURE__ */ __name((node, path = "") => {
    if (node === null || node === void 0) return;
    if (typeof node !== "object") {
      out.push([path, node]);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, path + "[" + index + "]"));
      return;
    }
    for (const [key, item] of Object.entries(node)) walk(item, path ? path + "." + key : key);
  }, "walk");
  walk(value);
  return out;
}, "materialScalars");
var materialStatus = /* @__PURE__ */ __name((item, content) => {
  const scalars = materialScalars({ item, content }), raw = scalars.filter(([key, value]) => /status|state|check|verify|hit|核对|结果|result/i.test(key) || /[准错]|pending|win|lose|hit|miss|命中|未中/i.test(String(value))).map(([, value]) => String(value)).join("|").toLowerCase();
  if (/(^|\|)(win|hit|中)(\||$)/.test(raw) || raw.includes("\u51C6") || raw.includes("\u547D\u4E2D") || raw.includes("\u4E2D\u5956")) return "win";
  if (/(^|\|)(lose|miss)(\||$)/.test(raw) || raw.includes("\u9519") || raw.includes("\u672A\u4E2D")) return "lose";
  return "pending";
}, "materialStatus");
var materialHit = /* @__PURE__ */ __name((item, content) => {
  const candidates = materialScalars({ item, content }).filter(([key, value]) => /hit|result|special|open|lottery|开奖|特码/i.test(key) || /[开准错]/.test(String(value))).map(([, value]) => value);
  for (const value of candidates) {
    const matches = String(value ?? "").match(/(?:^|\D)(0?[1-9]|[1-4]\d)(?=\D|$)/g) || [];
    for (const token of matches) {
      const number = Number(String(token).replace(/\D/g, ""));
      if (number >= 1 && number <= 49) return String(number).padStart(2, "0");
    }
  }
  return "";
}, "materialHit");
var thirtyMaterial = /* @__PURE__ */ __name((item) => {
  const content = materialContent(item), raw = Array.isArray(content) ? content : content?.numbers || content?.numberList || item?.numbers || item?.numberList || [], numberValues = Array.isArray(raw) ? raw.map((value) => value?.number ?? value) : String(typeof content === "string" ? content : item?.content ?? "").match(/(?:^|\D)(0?[1-9]|[1-4]\d)(?=\D|$)/g) || [], numbers = numberValues.map((value) => Number(String(value).replace(/\D/g, ""))).filter((number) => number >= 1 && number <= 49).slice(0, 30), periodEntry = materialScalars(item).find(([key]) => /(^|\.)(period|issue|issueNo|intPeriod)$/i.test(key)), period = parseInt(String(item?.period || item?.issue || item?.issueNo || content?.period || periodEntry?.[1] || 0), 10) || 0;
  let status = materialStatus(item, content), hit = materialHit(item, content);
  if (hit && status === "pending") status = numbers.includes(Number(hit)) ? "win" : "lose";
  return { period, numbers, status, hit, open: status === "pending" ? "\u5F85\u5F00\u5956" : "\u5F00:" + hit + (status === "win" ? "\u51C6" : "\u9519") };
}, "thirtyMaterial");
async function kingForecasts(env, lotteryType = 5) {
  try {
    const type = { 1: "xg", 5: "xam", 8: "tt" }[Number(lotteryType)] || "xam", call = /* @__PURE__ */ __name((category) => env.KING_SITE.fetch(new Request("https://liuhe-king-site/api/materials?category=" + category + "&type=" + type + "&page=1&pageSize=5", { headers: { accept: "application/json", "cache-control": "no-cache" } })), "call");
    const [nineResponse, thirtyResponse] = await Promise.all([call("nine"), call("thirty")]);
    if (!thirtyResponse.ok) throw new Error("30\u7801 HTTP " + thirtyResponse.status);
    const [ninePayload, thirtyPayload] = await Promise.all([nineResponse.ok ? nineResponse.json() : Promise.resolve({}), thirtyResponse.json()]), nineItems = materialList(ninePayload), thirtyItems = materialList(thirtyPayload), latestNine = nineItems[0] || {}, latestThirty = thirtyItems[0] || {}, nineContent = materialContent(latestNine), thirtyContent = materialContent(latestThirty);
    const period = Number(latestNine.period || latestNine.issue || latestNine.issueNo || latestThirty.period || latestThirty.issue || latestThirty.issueNo || 0), rawRows = Array.isArray(nineContent) ? nineContent : nineContent.rows || nineContent.items || nineContent.recommendations || latestNine.rows || latestNine.recommendations || [];
    const nine = rawRows.map((row, index) => {
      const pick = Array.isArray(row.zodiacs) ? row.zodiacs.join("") : String(row.pick || row.zodiac || row.zodiacs || row.content || "").replace(/[\s,，、]/g, ""), label = row.kind || row.label || row.title || ["\u2462\u8096", "\u2464\u8096", "\u2466\u8096", "\u2468\u8096"][index] || "";
      const status = String(row.status || latestNine.status || "").toLowerCase();
      return { period: Number(row.period || period), kind: String(label), pick, status: status === "win" || status.includes("\u4E2D") || status.includes("\u51C6") ? "win" : status === "lose" || status.includes("\u9519") || status.includes("\u672A\u4E2D") ? "lose" : "pending" };
    }).filter((row) => row.kind && row.pick).slice(0, 4);
    const thirty = thirtyItems.map(thirtyMaterial).filter((row) => row.period && row.numbers.length === 30).slice(0, 5), latestThirtyRow = thirty[0] || {}, numbers = latestThirtyRow.numbers || [], thirtyPeriod = latestThirtyRow.period || 0;
    let thirtyStatus = latestThirtyRow.status || "pending", thirtyHit = latestThirtyRow.hit || "";
    if (thirtyStatus === "pending") try {
      const drawInfo = normalizeDraw(await fetchLatestLottery());
      if (drawInfo.complete && drawInfo.period === thirtyPeriod) {
        thirtyHit = String(drawInfo.number).padStart(2, "0");
        thirtyStatus = numbers.includes(drawInfo.number) ? "win" : "lose";
      }
    } catch (error) {
      console.error("thirty_fallback_check_failed", error?.message || error);
    }
    const thirtyOpen = thirtyStatus === "pending" ? "\u5F85\u5F00\u5956" : "\u5F00:" + thirtyHit + (thirtyStatus === "win" ? "\u51C6" : "\u9519");
    if (thirty[0]) Object.assign(thirty[0], { status: thirtyStatus, hit: thirtyHit, open: thirtyOpen });
    if (!thirtyPeriod || numbers.length !== 30) throw new Error("\u516D\u5408\u738B30\u7801\u63A5\u53E3\u7ED3\u6784\u6682\u4E0D\u53EF\u8BC6\u522B");
    return json({ success: true, data: { period: period || thirtyPeriod, nine, numbers, thirty, source: "KING_SITE:/api/materials" } });
  } catch (error) {
    console.error("king_forecasts_failed", error?.message || error);
    return json({ success: false, message: "\u516D\u5408\u738B\u8D44\u6599\u6682\u65F6\u4E0D\u53EF\u7528" }, 502);
  }
}
__name(kingForecasts, "kingForecasts");
async function publicApi(request, env, url) {
  if (url.pathname === "/api/public/lottery-latest" && request.method === "GET") {
    const lotteryType = cleanInt(url.searchParams.get("lotteryType"), 5);
    if (![1, 5, 8].includes(lotteryType)) return json({ success: false, message: "\u5F69\u79CD\u53C2\u6570\u9519\u8BEF" }, 422);
    try {
      const response = await fetch("https://6htv70.com/gallerynew/h5/index/lastLotteryRecord?lotteryType=" + lotteryType, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0" } });
      if (!response.ok) throw new Error("HTTP " + response.status);
      return new Response(response.body, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, no-cache, must-revalidate", "pragma": "no-cache", "expires": "0" } });
    } catch (error) {
      console.error("lottery_latest_failed", lotteryType, error?.message || error);
      return json({ success: false, message: "\u5F00\u5956\u63A5\u53E3\u6682\u65F6\u4E0D\u53EF\u7528" }, 502, { "cache-control": "no-store" });
    }
  }
  if (url.pathname === "/api/public/king-forecasts" && request.method === "GET") return kingForecasts(env, cleanInt(url.searchParams.get("lotteryType"), 5));
  if (url.pathname === "/api/public/king-thirty-raw" && request.method === "GET") return kingThirtyRaw(env, cleanInt(url.searchParams.get("lotteryType"), 5));
  if (url.pathname === "/api/public/content") {
    await ensureFixedThreePeriodGroups(env);
    await auditStoredIdiomContent(env);
    const lotteryType = validLotteryType(url.searchParams.get("lotteryType")), section = cleanText(url.searchParams.get("section"), 60);
    const period = cleanInt(url.searchParams.get("period"));
    let query = "SELECT * FROM content_items WHERE lottery_type=? AND enabled=1";
    const binds = [lotteryType];
    if (section) {
      query += " AND section_key=?";
      binds.push(section);
    }
    if (period) {
      query += " AND period=?";
      binds.push(period);
    }
    query += " ORDER BY period DESC,sort_order,id LIMIT 500";
    const result = await env.DB.prepare(query).bind(...binds).all();
    return json({ success: true, data: result.results });
  }
  if (url.pathname === "/api/public/masters") {
    await ensureMasterCatalog(env);
    const lotteryType = validLotteryType(url.searchParams.get("lotteryType"));
    return json({ success: true, data: await publicMasters(env, lotteryType) });
  }
  if (url.pathname === "/api/public/master-posts") {
    await ensureMasterCatalog(env);
    const lotteryType = validLotteryType(url.searchParams.get("lotteryType")), masterId = cleanInt(url.searchParams.get("masterId"));
    const period = cleanInt(url.searchParams.get("period"));
    let query = "SELECT p.*,m.name,m.avatar,m.rank_no,m.specialty FROM master_posts p JOIN masters m ON m.id=p.master_id WHERE m.enabled=1 AND p.lottery_type=?";
    const binds = [lotteryType];
    if (masterId) {
      query += " AND p.master_id=?";
      binds.push(masterId);
    }
    if (period) {
      query += " AND p.period=?";
      binds.push(period);
    }
    query += " ORDER BY p.period DESC,m.rank_no LIMIT 200";
    const result = await env.DB.prepare(query).bind(...binds).all();
    return json({ success: true, data: result.results });
  }
  if (url.pathname === "/api/public/ads") {
    await ensureAdsSchema(env);
    const result = await env.DB.prepare("SELECT position_key,image_url,link_url,display_mode,delay_seconds,start_at,end_at FROM ads WHERE enabled=1 AND image_url<>'' AND (start_at IS NULL OR start_at='' OR start_at<=CURRENT_TIMESTAMP) AND (end_at IS NULL OR end_at='' OR end_at>=CURRENT_TIMESTAMP) ORDER BY CASE WHEN position_key='popup' THEN 0 WHEN position_key='banner' THEN 1 ELSE 2 END,position_key").all();
    const absoluteAd = /* @__PURE__ */ __name((item) => item && { ...item, image_url: /^\/ad-image\//.test(item.image_url) ? "https://123-liuhe-site.xcx8088.workers.dev" + item.image_url : item.image_url }, "absoluteAd");
    const rows = result.results || [], popup = absoluteAd(rows.find((item) => item.position_key === "popup")), banner = absoluteAd(rows.find((item) => item.position_key === "banner") || rows.find((item) => item.position_key !== "popup"));
    const data = [];
    if (banner) {
      data.push({ ...banner, position_key: "banner" });
      for (let index = 1; index <= 20; index++) data.push({ ...banner, position_key: "home-" + index });
      data.push({ ...banner, position_key: "list" }, { ...banner, position_key: "detail" });
    }
    if (popup) data.push(popup);
    return json({ success: true, data }, 200, { "access-control-allow-origin": "*" });
  }
  if (url.pathname === "/api/public/text-ads") {
    await ensureTextAdsSchema(env);
    const [texts, domains] = await Promise.all([
      env.DB.prepare("SELECT id,ad_text,text_color,sort_order FROM text_ads WHERE enabled=1 AND ad_text<>'' ORDER BY sort_order,id").all(),
      env.DB.prepare("SELECT id,domain_url,sort_order FROM text_ad_domains WHERE enabled=1 AND domain_url<>'' ORDER BY sort_order,id").all()
    ]);
    return json({ success: true, data: texts.results || [], texts: texts.results || [], domains: domains.results || [] }, 200, { "access-control-allow-origin": "*" });
  }
  if (url.pathname === "/api/public/recommended-sites") {
    await ensureRecommendedSites(env);
    const result = await env.DB.prepare("SELECT id,name,site_url FROM recommended_sites WHERE enabled=1 ORDER BY sort_order,id").all();
    return json({ success: true, data: result.results }, 200, { "access-control-allow-origin": "*" });
  }
  if (url.pathname === "/api/public/ad-event" && request.method === "POST") {
    let input = {};
    try {
      const type = request.headers.get("content-type") || "";
      if (type.includes("application/json")) input = await request.json();
      else input = Object.fromEntries(await request.formData());
    } catch {
    }
    const position = cleanText(input.position_key, 80), event = String(input.event_type || "");
    if (!position || !["view", "click"].includes(event)) return json({ success: false }, 400);
    const column = event === "click" ? "clicks" : "impressions";
    await env.DB.prepare("INSERT INTO ad_stats(position_key," + column + ",updated_at) VALUES(?,1,CURRENT_TIMESTAMP) ON CONFLICT(position_key) DO UPDATE SET " + column + "=" + column + "+1,updated_at=CURRENT_TIMESTAMP").bind(position).run();
    return json({ success: true });
  }
  return null;
}
__name(publicApi, "publicApi");
var resources = {
  content: { table: "content_items", fields: ["lottery_type", "section_key", "period", "title", "content_json", "result_text", "status", "sort_order", "enabled"] },
  masters: { table: "masters", fields: ["name", "avatar", "rank_no", "specialty", "enabled"] },
  posts: { table: "master_posts", fields: ["lottery_type", "master_id", "period", "content_json", "result_text", "status"] },
  ads: { table: "ads", fields: ["position_key", "image_url", "link_url", "display_mode", "delay_seconds", "start_at", "end_at", "enabled"] },
  textads: { table: "text_ads", fields: ["ad_text", "text_color", "sort_order", "enabled"] },
  textdomains: { table: "text_ad_domains", fields: ["domain_url", "sort_order", "enabled"] },
  links: { table: "recommended_sites", fields: ["name", "site_url", "sort_order", "enabled"] }
};
function normalize(resource, input) {
  const output = {};
  for (const field of resource.fields) {
    if (!(field in input)) continue;
    if (["period", "sort_order", "enabled", "rank_no", "master_id", "delay_seconds"].includes(field)) output[field] = cleanInt(input[field]);
    else if (field === "lottery_type") output[field] = validLotteryType(input[field]);
    else if (field === "status") output[field] = allowedStatus(input[field]);
    else if (["start_at", "end_at"].includes(field)) output[field] = cleanText(input[field], 40).replace("T", " ");
    else output[field] = cleanText(input[field]);
  }
  if ("site_url" in output && !/^https?:\/\//i.test(output.site_url)) delete output.site_url;
  return output;
}
__name(normalize, "normalize");
async function adminApi(request, env, url) {
  if (url.pathname === "/api/admin/login" && request.method === "POST") {
    if (!env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET) return json({ success: false, message: "\u540E\u53F0 Secret \u5C1A\u672A\u914D\u7F6E" }, 503);
    const input = await body(request);
    if (!input || !safeEqual(String(input.password || ""), String(env.ADMIN_PASSWORD))) return json({ success: false, message: "\u5BC6\u7801\u9519\u8BEF" }, 401);
    const token = await makeSession(env.ADMIN_SESSION_SECRET);
    return json({ success: true }, 200, { "set-cookie": "admin_session=" + token + "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800" });
  }
  if (url.pathname === "/api/admin/logout" && request.method === "POST") return json({ success: true }, 200, { "set-cookie": "admin_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0" });
  if (!await validSession(request, env.ADMIN_SESSION_SECRET)) return json({ success: false, message: "\u8BF7\u5148\u767B\u5F55" }, 401);
  if (url.pathname === "/api/admin/session") return json({ success: true });
  if (url.pathname === "/api/admin/ad-upload" && request.method === "POST") {
    const form = await request.formData(), file = form.get("image");
    if (!(file instanceof File) || !file.size) return json({ success: false, message: "\u8BF7\u9009\u62E9\u5E7F\u544A\u56FE\u7247" }, 400);
    if (file.size > 5 * 1024 * 1024) return json({ success: false, message: "\u56FE\u7247\u4E0D\u80FD\u8D85\u8FC7 5MB" }, 422);
    const types = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
    if (!types[file.type]) return json({ success: false, message: "\u53EA\u652F\u6301 JPG\u3001PNG\u3001WebP\u3001GIF" }, 422);
    const key = "ads/" + Date.now() + "-" + crypto.randomUUID() + "." + types[file.type];
    await env.AD_IMAGES.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type }, customMetadata: { uploadedAt: (/* @__PURE__ */ new Date()).toISOString() } });
    return json({ success: true, url: "/ad-image/" + key });
  }
  if (url.pathname === "/api/admin/dashboard" && request.method === "GET") {
    const [content, masters, posts, ads, recent] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN enabled=1 THEN 1 ELSE 0 END) enabled,SUM(CASE WHEN status='win' THEN 1 ELSE 0 END) wins FROM content_items").first(),
      env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN enabled=1 THEN 1 ELSE 0 END) enabled FROM masters").first(),
      env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status='win' THEN 1 ELSE 0 END) wins FROM master_posts").first(),
      env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN enabled=1 THEN 1 ELSE 0 END) enabled FROM ads").first(),
      env.DB.prepare("SELECT id,section_key,period,title,status,enabled,updated_at FROM content_items ORDER BY updated_at DESC,id DESC LIMIT 8").all()
    ]);
    return json({ success: true, data: { content, masters, posts, ads, recent: recent.results || [] } });
  }
  if (url.pathname === "/api/admin/settings") {
    if (request.method === "GET") {
      const result = await env.DB.prepare("SELECT setting_key,setting_value,updated_at FROM site_settings ORDER BY setting_key").all();
      return json({ success: true, data: result.results });
    }
    if (request.method === "PUT") {
      const input = await body(request) || {}, allowed = ["site_name", "site_domain", "site_slogan"];
      for (const key of allowed) {
        if (key in input) await env.DB.prepare("INSERT INTO site_settings(setting_key,setting_value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=CURRENT_TIMESTAMP").bind(key, cleanText(input[key], 200)).run();
      }
      return json({ success: true });
    }
    return json({ success: false, message: "\u8BF7\u6C42\u65B9\u5F0F\u4E0D\u652F\u6301" }, 405);
  }
  if (url.pathname === "/api/admin/analytics" && request.method === "GET") {
    const [totals, today, visitors] = await Promise.all([
      env.DB.prepare("SELECT COALESCE(SUM(views),0) views,COALESCE(SUM(unique_visitors),0) daily_uniques FROM analytics_daily").first(),
      env.DB.prepare("SELECT COALESCE(views,0) views,COALESCE(unique_visitors,0) unique_visitors FROM analytics_daily WHERE visit_date=date('now')").first(),
      env.DB.prepare("SELECT ip_address,country,region_name,city,views,first_seen,last_seen FROM analytics_visitors ORDER BY last_seen DESC LIMIT 300").all()
    ]);
    const unique = await env.DB.prepare("SELECT COUNT(*) total FROM analytics_visitors").first();
    return json({ success: true, data: { total_views: totals?.views || 0, total_unique: unique?.total || 0, today_views: today?.views || 0, today_unique: today?.unique_visitors || 0, visitors: visitors.results || [] } });
  }
  if (url.pathname === "/api/admin/analytics/clear" && request.method === "POST") {
    await env.DB.batch([env.DB.prepare("DELETE FROM analytics_uniques"), env.DB.prepare("DELETE FROM analytics_daily"), env.DB.prepare("DELETE FROM analytics_visitors")]);
    return json({ success: true });
  }
  if (url.pathname === "/api/admin/analytics/export" && request.method === "GET") {
    const result = await env.DB.prepare("SELECT ip_address,country,region_name,city,views,first_seen,last_seen FROM analytics_visitors ORDER BY last_seen DESC").all(), q = /* @__PURE__ */ __name((value) => '"' + String(value ?? "").replaceAll('"', '""') + '"', "q"), csv = "\uFEFFIP,\u56FD\u5BB6/\u5730\u533A,\u7701\u4EFD/\u5DDE,\u57CE\u5E02,\u8BBF\u95EE\u6B21\u6570,\u9996\u6B21\u8BBF\u95EE,\u6700\u540E\u8BBF\u95EE\n" + (result.results || []).map((row) => [row.ip_address, row.country, row.region_name, row.city, row.views, row.first_seen, row.last_seen].map(q).join(",")).join("\n");
    return new Response(csv, { headers: { "content-type": "text/csv;charset=utf-8", "content-disposition": "attachment; filename=123lh-visitor-statistics.csv", "cache-control": "no-store" } });
  }
  if (url.pathname === "/api/admin/automation" && request.method === "GET") {
    const result = await env.DB.prepare("SELECT * FROM automation_runs ORDER BY id DESC LIMIT 50").all();
    return json({ success: true, data: result.results });
  }
  if (url.pathname === "/api/admin/automation/audit" && request.method === "GET") {
    return json({ success: true, data: await auditPeriod(env, cleanInt(url.searchParams.get("period"))) });
  }
  if (url.pathname === "/api/admin/automation/run" && request.method === "POST") {
    try {
      return json({ success: true, data: await runAllLotteryChecks(env) });
    } catch (error) {
      return json({ success: false, message: cleanText(error?.message || "\u81EA\u52A8\u6838\u5BF9\u5931\u8D25", 500) }, 502);
    }
  }
  const bulkDelete = url.pathname.match(/^\/api\/admin\/(textads|textdomains)\/bulk-delete$/);
  if (bulkDelete && request.method === "POST") {
    await ensureTextAdsSchema(env);
    const input = await body(request) || {}, ids = [...new Set((Array.isArray(input.ids) ? input.ids : []).map((value) => cleanInt(value)).filter((value) => value > 0))];
    if (!ids.length) return json({ success: false, message: "\u8BF7\u9009\u62E9\u8981\u5220\u9664\u7684\u5185\u5BB9" }, 422);
    const table = bulkDelete[1] === "textads" ? "text_ads" : "text_ad_domains";
    for (let offset = 0; offset < ids.length; offset += 50) {
      const chunk = ids.slice(offset, offset + 50);
      await env.DB.prepare("DELETE FROM " + table + " WHERE id IN (" + chunk.map(() => "?").join(",") + ")").bind(...chunk).run();
    }
    return json({ success: true, count: ids.length });
  }
  const match = url.pathname.match(/^\/api\/admin\/(content|masters|posts|ads|textads|textdomains|links)(?:\/(\d+))?$/);
  if (!match) return null;
  const resource = resources[match[1]], id = cleanInt(match[2]);
  if (match[1] === "links") await ensureRecommendedSites(env);
  if (match[1] === "ads") await ensureAdsSchema(env);
  if (["textads", "textdomains"].includes(match[1])) await ensureTextAdsSchema(env);
  if (request.method === "GET") {
    if (match[1] === "ads") {
      await env.DB.prepare("INSERT OR IGNORE INTO ads(position_key,image_url,link_url,display_mode,delay_seconds,start_at,end_at,enabled) SELECT 'banner',image_url,link_url,display_mode,delay_seconds,start_at,end_at,enabled FROM ads WHERE position_key<>'popup' AND image_url<>'' ORDER BY CASE WHEN position_key='home-1' THEN 0 ELSE 1 END,id LIMIT 1").run();
      const result2 = await env.DB.prepare("SELECT a.*,COALESCE(s.impressions,0) impressions,COALESCE(s.clicks,0) clicks FROM ads a LEFT JOIN ad_stats s USING(position_key) WHERE a.position_key IN ('banner','popup') ORDER BY CASE WHEN a.position_key='banner' THEN 0 ELSE 1 END").all();
      return json({ success: true, data: result2.results });
    }
    const order = match[1] === "masters" ? "rank_no,id" : ["links", "textads", "textdomains"].includes(match[1]) ? "sort_order,id" : "id DESC";
    const result = await env.DB.prepare("SELECT * FROM " + resource.table + " ORDER BY " + order + " LIMIT 500").all();
    return json({ success: true, data: result.results });
  }
  if (request.method === "POST") {
    const raw = await body(request) || {};
    if (match[1] === "links" && (!cleanText(raw.name, 100) || !/^https?:\/\//i.test(cleanText(raw.site_url)))) return json({ success: false, message: "\u8BF7\u586B\u5199\u7F51\u7AD9\u540D\u79F0\u548C\u4EE5 http:// \u6216 https:// \u5F00\u5934\u7684\u7F51\u5740" }, 422);
    if (match[1] === "textads") {
      const values = String(raw.ad_text || "").split(/\r?\n/).map((value) => cleanText(value, 500).replace(/^\*\*(.*?)\*\*$/, "$1").trim()).filter(Boolean);
      if (!values.length) return json({ success: false, message: "\u8BF7\u586B\u5199\u5E7F\u544A\u8BCD\uFF0C\u6BCF\u884C\u4E00\u6761" }, 422);
      const base = cleanInt(raw.sort_order), color = /^#[0-9a-f]{6}$/i.test(String(raw.text_color || "")) ? String(raw.text_color) : "#f2cf68", enabled = cleanInt(raw.enabled, 1);
      await env.DB.batch(values.map((value, index) => env.DB.prepare("INSERT INTO text_ads(ad_text,text_color,sort_order,enabled) VALUES(?,?,?,?)").bind(value, color, base + index, enabled)));
      return json({ success: true, count: values.length });
    }
    if (match[1] === "textdomains") {
      const values = [...new Set(String(raw.domain_url || "").split(/\r?\n/).map((value) => cleanText(value, 1e3)).filter((value) => /^https?:\/\//i.test(value)))];
      if (!values.length) return json({ success: false, message: "\u8BF7\u586B\u5199\u4EE5 http:// \u6216 https:// \u5F00\u5934\u7684\u57DF\u540D\uFF0C\u6BCF\u884C\u4E00\u4E2A" }, 422);
      const base = cleanInt(raw.sort_order), enabled = cleanInt(raw.enabled, 1);
      await env.DB.batch(values.map((value, index) => env.DB.prepare("INSERT OR IGNORE INTO text_ad_domains(domain_url,sort_order,enabled) VALUES(?,?,?)").bind(value, base + index, enabled)));
      return json({ success: true, count: values.length });
    }
    if (match[1] === "ads" && raw.position_key !== "popup") raw.position_key = "banner";
    const input = normalize(resource, raw);
    const fields = Object.keys(input);
    if (!fields.length) return json({ success: false, message: "\u6CA1\u6709\u53EF\u4FDD\u5B58\u7684\u5185\u5BB9" }, 400);
    if (match[1] === "ads") {
      if (!input.position_key) return json({ success: false, message: "\u8BF7\u9009\u62E9\u5E7F\u544A\u4F4D\u7F6E" }, 422);
      const updates = fields.filter((field) => field !== "position_key");
      const sql = "INSERT INTO ads (" + fields.join(",") + ") VALUES (" + fields.map(() => "?").join(",") + ") ON CONFLICT(position_key) DO UPDATE SET " + updates.map((field) => field + "=excluded." + field).join(",") + (updates.length ? "," : "") + "updated_at=CURRENT_TIMESTAMP";
      const result2 = await env.DB.prepare(sql).bind(...fields.map((field) => input[field])).run(), saved = await env.DB.prepare("SELECT id FROM ads WHERE position_key=?").bind(input.position_key).first();
      return json({ success: true, id: saved?.id || result2.meta.last_row_id });
    }
    const result = await env.DB.prepare("INSERT INTO " + resource.table + " (" + fields.join(",") + ") VALUES (" + fields.map(() => "?").join(",") + ")").bind(...fields.map((field) => input[field])).run();
    return json({ success: true, id: result.meta.last_row_id });
  }
  if (request.method === "PUT" && id) {
    const raw = await body(request) || {};
    if (match[1] === "links" && "site_url" in raw && !/^https?:\/\//i.test(cleanText(raw.site_url))) return json({ success: false, message: "\u7F51\u5740\u5FC5\u987B\u4EE5 http:// \u6216 https:// \u5F00\u5934" }, 422);
    const input = normalize(resource, raw);
    const fields = Object.keys(input);
    if (!fields.length) return json({ success: false, message: "\u6CA1\u6709\u53EF\u66F4\u65B0\u7684\u5185\u5BB9" }, 400);
    await env.DB.prepare("UPDATE " + resource.table + " SET " + fields.map((field) => field + "=?").join(",") + ",updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(...fields.map((field) => input[field]), id).run();
    return json({ success: true });
  }
  if (request.method === "DELETE" && id) {
    await env.DB.prepare("DELETE FROM " + resource.table + " WHERE id=?").bind(id).run();
    return json({ success: true });
  }
  return json({ success: false, message: "\u8BF7\u6C42\u65B9\u5F0F\u4E0D\u652F\u6301" }, 405);
}
__name(adminApi, "adminApi");
var index_default = { async scheduled(controller, env, ctx) {
  ctx.waitUntil(Promise.all([
    maybeRunResultCheck(env).catch((error) => console.error("scheduled_result_check_failed", error?.stack || error?.message || error)),
    syncAdditionalLotteryTypes(env).catch((error) => console.error("scheduled_additional_types_failed", error?.stack || error?.message || error))
  ]));
}, async fetch(request, env, ctx) {
  try {
    const url = new URL(request.url);
    if (url.pathname === "/wuqi-data.php" && request.method === "GET") return maybeEncryptJsonResponse(request, await handleWuqi(url));
    if (url.pathname === "/api/chat/v1" && (request.method === "GET" || request.method === "POST")) {
      const target = new URL("https://xinshui-chat-api.jijin888888.workers.dev/v1/chat");
      target.search = url.search;
      return maybeEncryptJsonResponse(request, await fetch(new Request(target.toString(), request)));
    }
    if (url.pathname.startsWith("/ad-image/")) {
      const key = decodeURIComponent(url.pathname.slice("/ad-image/".length)), object = await env.AD_IMAGES.get(key);
      if (!object) return new Response("Not found", { status: 404 });
      return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType || "application/octet-stream", "cache-control": "public,max-age=31536000,immutable", "x-content-type-options": "nosniff" } });
    }
    if (url.pathname.startsWith("/api/public/")) {
      const response = await publicApi(request, env, url);
      if (response) return maybeEncryptJsonResponse(request, response);
    }
    if (url.pathname.startsWith("/api/admin/")) {
      const response = await adminApi(request, env, url);
      if (response) return response;
    }
    if (request.method === "GET" && !url.pathname.startsWith("/admin") && !url.pathname.startsWith("/api/") && (request.headers.get("accept") || "").includes("text/html")) ctx.waitUntil(Promise.all([trackVisit(request, env).catch(() => {
    }), maybeRunResultCheck(env).catch(() => {
    })]));
    const asset = await env.ASSETS.fetch(request);
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html") && asset.ok) {
      try {
        const initial = await homepageInitialData(env), serialized = JSON.stringify(initial).replace(/</g, "\\u003c");
        let html = await asset.clone().text();
        html = html.replace('<script src="backend-sync.js?v=87"><\/script>', '<script id="initialBackendData" type="application/json">' + serialized + '<\/script><script src="backend-sync.js?v=87"><\/script>');
        const headers = new Headers(asset.headers);
        headers.set("content-type", "text/html; charset=utf-8");
        headers.set("cache-control", "no-store");
        return maybeEncryptHtmlResponse(new Response(html, { status: asset.status, headers }));
      } catch (error) {
        console.error("homepage_initial_data_failed", error?.message || error);
      }
    }
    if (request.method === "GET" && (url.pathname === "/admin" || url.pathname === "/admin.html") && asset.ok) {
      let html = await asset.text();
      html = html.replace("\u7BA1\u7406\u5E7F\u544A\u4F4D\u7F6E\u3001\u6295\u653E\u65F6\u95F4\u3001\u5C55\u793A\u4E0E\u70B9\u51FB\u7EDF\u8BA1", "\u7EDF\u4E00\u7BA1\u7406\u4E09\u4E2A\u7F51\u7AD9\u5E7F\u544A\uFF1A\u4E00\u5F20\u6A2A\u5E45\u56FE\u7528\u4E8E\u5168\u90E8\u6A2A\u5E45\u4F4D\u7F6E\uFF0C\u5F39\u7A97\u5355\u72EC\u8BBE\u7F6E").replace("['position_key','\u5E7F\u544A\u4F4D\u7F6E','adposition']", "['position_key','\u5E7F\u544A\u7C7B\u578B','adposition']");
      const oldAdOptions = `<option value="popup">\u9996\u9875\u5F39\u7A97\u5E7F\u544A</option>'+Array.from({length:16},(_,i)=>'<option value="home-'+(i+1)+'">\u9996\u9875\u677F\u5757\u5E7F\u544A '+(i+1)+'</option>').join('')+'<option value="list">\u5217\u8868\u9875\u5E7F\u544A</option><option value="detail">\u5185\u5BB9\u9875\u5E7F\u544A</option>`;
      html = html.replace(oldAdOptions, '<option value="banner">\u5168\u7AD9\u6A2A\u5E45\u5E7F\u544A\uFF08\u6240\u6709\u4F4D\u7F6E\u5171\u7528\uFF09</option><option value="popup">\u9996\u9875\u5F39\u7A97\u5E7F\u544A</option>');
      const headers = new Headers(asset.headers);
      headers.set("content-type", "text/html; charset=utf-8");
      headers.set("cache-control", "no-store");
      return maybeEncryptHtmlResponse(new Response(html, { status: asset.status, headers }));
    }
    return maybeEncryptHtmlResponse(asset);
  } catch (error) {
    console.error("request_failed", new URL(request.url).pathname, error?.stack || error?.message || error);
    const path = new URL(request.url).pathname, isAdmin = path.startsWith("/api/admin/"), detail = cleanText(error?.message || "", 240);
    return json({ success: false, message: isAdmin && detail ? "\u5904\u7406\u5931\u8D25\uFF1A" + detail : "\u670D\u52A1\u5668\u5904\u7406\u5931\u8D25" }, 500);
  }
} };
export {
  index_default as default
};
//# sourceMappingURL=index.js.map

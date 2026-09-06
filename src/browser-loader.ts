import { decryptJsonPayload, readEncryptedResponse, type EncryptedPayload } from "./aes-gcm";

declare global {
  interface Window {
    MahuiCrypto: {
      readEncryptedResponse: typeof readEncryptedResponse;
    };
  }
}

interface PagePayload {
  html: string;
}

function isPublicJsonPath(pathname: string): boolean {
  return pathname === "/wuqi-data.php" || pathname === "/api/chat/v1" || pathname.startsWith("/api/public/");
}

function readEnvelope(id: string): EncryptedPayload {
  const element = document.getElementById(id);
  if (!element?.textContent) throw new Error("页面加密数据缺失");
  return JSON.parse(element.textContent) as EncryptedPayload;
}

function installEncryptedFetch(): void {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url, location.href);
    const isPublicGet = request.method === "GET" && url.origin === location.origin && isPublicJsonPath(url.pathname);
    if (!isPublicGet) return nativeFetch(input, init);
    url.searchParams.set("encrypted", "1");
    const encryptedResponse = await nativeFetch(new Request(url, request));
    try {
      const decrypted = await readEncryptedResponse<unknown>(encryptedResponse);
      return new Response(JSON.stringify(decrypted), {
        status: encryptedResponse.status,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
      });
    } catch (error) {
      console.error("[123六合网] 接口解密失败", error);
      throw error;
    }
  };
}

function showFriendlyError(): void {
  document.body.innerHTML = "";
  const message = document.createElement("div");
  message.className = "decrypt-error";
  message.textContent = "页面数据加载失败，请刷新后重试。";
  document.body.appendChild(message);
}

async function mount(): Promise<void> {
  try {
    const [page, title] = await Promise.all([
      decryptJsonPayload<PagePayload>(readEnvelope("encrypted-page")),
      decryptJsonPayload<string>(readEnvelope("encrypted-title"))
    ]);
    installEncryptedFetch();
    const safeTitle = JSON.stringify(title).replace(/</g, "\\u003c");
    const hydratedHtml = page.html
      .replace(/<title[^>]*>[\s\S]*?<\/title>/i, "<title></title>")
      .replace(/<\/head>/i, `<script>document.title=${safeTitle};<\/script></head>`);
    document.open();
    document.write(hydratedHtml);
    document.close();
  } catch (error) {
    console.error("[123六合网] 页面自动解密失败", error);
    showFriendlyError();
  }
}

void mount();

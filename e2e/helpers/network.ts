import type { Page } from "@playwright/test";

export type RequestLog = {
  urls: string[];
  supabaseHits(): string[];
  rpcHits(name: string): string[];
  clear(): void;
};

export function startRequestLog(page: Page): RequestLog {
  const urls: string[] = [];

  page.on("request", (request) => {
    urls.push(request.url());
  });

  return {
    urls,
    supabaseHits() {
      return urls.filter(
        (url) => url.includes("/rest/v1") || url.includes("/auth/v1"),
      );
    },
    rpcHits(name: string) {
      return urls.filter((url) => url.includes(`/rpc/${name}`));
    },
    clear() {
      urls.length = 0;
    },
  };
}

export async function waitForServiceWorker(page: Page): Promise<void> {
  await page.waitForFunction(async () => {
    if (!("serviceWorker" in navigator)) {
      return false;
    }
    const registration = await navigator.serviceWorker.getRegistration();
    return Boolean(registration?.active);
  });
}

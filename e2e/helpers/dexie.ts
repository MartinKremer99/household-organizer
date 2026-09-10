import type { Page } from "@playwright/test";

const DB_NAME = "household-organizer";

export async function countPendingOperations(page: Page): Promise<number> {
  return page.evaluate((dbName) => {
    return new Promise<number>((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onerror = () => reject(request.error ?? new Error("indexedDB open failed"));
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("pending_operations")) {
          db.close();
          resolve(0);
          return;
        }
        const tx = db.transaction("pending_operations", "readonly");
        const count = tx.objectStore("pending_operations").count();
        count.onsuccess = () => {
          db.close();
          resolve(count.result);
        };
        count.onerror = () => {
          db.close();
          reject(count.error ?? new Error("pending_operations count failed"));
        };
      };
    });
  }, DB_NAME);
}

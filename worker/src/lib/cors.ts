// ============================================================
// cors.ts — єдина точка правди для CORS-заголовків Worker API.
//
// Раніше ця логіка була продубльована незалежно в 3 місцях
// (index.ts, chatHandler.ts, reportHandler.ts) з різними —
// і не завжди повними — списками дозволених origin, що створювало
// ризик розсинхронізації (наприклад chatHandler і reportHandler
// не пропускали qorax.app/www.qorax.app чи *.pages.dev прев'ю).
// Тепер усі три використовують один allow-list.
// ============================================================

export function getAllowedOrigin(origin: string | null): string {
  if (!origin) return "https://qorax.mrcru96.workers.dev";
  if (
    origin === "http://localhost:3000" ||
    origin === "http://localhost:3001" ||
    origin.endsWith(".workers.dev") ||
    origin.endsWith(".pages.dev") ||
    origin === "https://qorax.app" ||
    origin === "https://www.qorax.app"
  ) {
    return origin;
  }
  return "https://qorax.mrcru96.workers.dev";
}

export function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(origin),
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-admin-token",
    "Access-Control-Max-Age": "86400",
  };
}

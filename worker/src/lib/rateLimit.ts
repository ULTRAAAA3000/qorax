// rateLimit.ts — простий rate limiting по IP через Cloudflare KV.
// Використовується для захисту публічних (без авторизації) ендпоінтів,
// які дорого коштують: /api/audit бʼє в Google PageSpeed + Gemini API
// на кожен запит, тому без ліміту його легко засипати запитами.
//
// Підхід: fixed window — на кожен IP+ключ рахуємо кількість запитів у
// поточному вікні (наприклад 1 хвилина) через KV з TTL. KV eventual
// consistency означає що при дуже високій паралельності можливий невеликий
// перебір ліміту — для захисту free lead-magnet від зловживань цього
// достатньо, це не платіжна/безпекова система.

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetSeconds: number;
}

/**
 * Перевіряє і інкрементує лічильник запитів для ключа (зазвичай IP,
 * можна комбінувати з назвою ендпоінту для окремих лімітів).
 *
 * @param kv        KV namespace (env.RATE_LIMIT_KV)
 * @param key       Унікальний ключ, напр. `audit:${ip}`
 * @param limit     Максимум запитів у вікні
 * @param windowSec Розмір вікна в секундах
 */
export async function checkRateLimit(
  kv: KVNamespace,
  key: string,
  limit: number,
  windowSec: number
): Promise<RateLimitResult> {
  const kvKey = `rl:${key}`;

  let current = 0;
  try {
    const raw = await kv.get(kvKey);
    current = raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    // Якщо KV недоступний — не блокуємо запит (fail-open), краще
    // пропустити зайвий запит ніж повністю зламати lead-magnet через
    // тимчасову проблему з KV.
    return { allowed: true, remaining: limit, limit, resetSeconds: windowSec };
  }

  if (current >= limit) {
    return { allowed: false, remaining: 0, limit, resetSeconds: windowSec };
  }

  try {
    await kv.put(kvKey, String(current + 1), { expirationTtl: windowSec });
  } catch {
    // Не вдалось записати лічильник — все одно пропускаємо запит (fail-open).
    return { allowed: true, remaining: limit - current - 1, limit, resetSeconds: windowSec };
  }

  return { allowed: true, remaining: limit - current - 1, limit, resetSeconds: windowSec };
}

/**
 * Дістає реальну IP-адресу клієнта з заголовків Cloudflare.
 * CF-Connecting-IP — найнадійніший (не можна підмінити ззовні,
 * Cloudflare сам його ставить на edge).
 */
export function getClientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP")
    ?? request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim()
    ?? "unknown";
}

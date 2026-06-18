// ============================================================
// url.ts — валидация и нормализация введённого пользователем URL
// ============================================================
// Пользователи вводят что попало: "google.com", "www.google.com",
// "http://google.com/", "GOOGLE.COM " — приводим к единому виду
// перед тем как делать запросы и сохранять в БД.

export type UrlValidationResult =
  | { ok: true; url: string; hostname: string }
  | { ok: false; error: string };

export function normalizeAndValidateUrl(raw: string): UrlValidationResult {
  const trimmed = raw.trim();

  if (!trimmed) {
    return { ok: false, error: "URL не може бути порожнім" };
  }

  // Если протокол не указан — добавляем https по умолчанию
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return { ok: false, error: "Невірний формат адреси сайту" };
  }

  // Базовая защита от очевидно некорректных/опасных целей:
  // localhost, приватные IP-диапазоны, не-http(s) протоколы после парсинга.
  const hostname = parsed.hostname.toLowerCase();

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Підтримуються лише http та https адреси" };
  }

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".local") ||
    isPrivateIp(hostname)
  ) {
    return { ok: false, error: "Ця адреса недоступна для перевірки" };
  }

  if (!hostname.includes(".")) {
    return { ok: false, error: "Вкажіть повну адресу сайту, наприклад example.com" };
  }

  // Нормализуем: всегда https, без trailing slash на корне, без query/hash
  const normalized = `https://${hostname}${parsed.pathname !== "/" ? parsed.pathname : ""}`;

  return { ok: true, url: normalized, hostname };
}

function isPrivateIp(hostname: string): boolean {
  // Простая проверка приватных диапазонов IPv4 (10.x, 172.16-31.x, 192.168.x)
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const [a, b] = [parseInt(ipv4[1], 10), parseInt(ipv4[2], 10)];
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

// ============================================================
// planTiers.ts — центральний хелпер для перевірки тарифного рівня,
// сумісний одночасно зі старими (legacy) кодами тарифів
// (starter/growth/agency/trial/free/enterprise) і новими
// {product}_{tier} кодами з 0086 (business_free/starter/pro/agency).
//
// Артем: перехід на екосистемну модель тарифів (PRICING.md Частина
// A). 0086 додала 20 нових кодів planCode, лишивши старі 6 без
// використання в enum (не видаляються фізично). До цього модуля
// 13+ worker-хендлерів мали ІДЕНТИЧНИЙ захардкоджений масив
// ["growth", "agency", "admin", "trial"].includes(planCode) —
// скопійований по файлах окремо. Це давало розбіжність:
// "growth"-тариф давав доступ, а Business Free "новобранці" не
// мали еквівалентного запису взагалі — новий рядок довелось би
// дописувати в 13 місцях одночасно, з ризиком забути одне.
//
// Тепер: ОДНА функція на кожен рівень доступу, використовується
// всюди. Оновлення для нового продукту/рівня — одна зміна тут, не
// пошук по всьому дереву worker/src/lib/.
// ============================================================

/**
 * "Growth і вище" (стара термінологія) = тепер "Pro і вище" (нова
 * лінійка) — Core Web Vitals, meta/schema checker, GSC-інтеграція,
 * AI revenue impact, Academy преміум-курси, CRO, чат-підтримка,
 * конкуренти, звіти про биті посилання розширено, командні фічі
 * тощо. Усі ці фічі-гачки історично жили на одному "середньому+"
 * рівні тарифу — зберігаємо той самий поріг для нової лінійки:
 * business_pro і business_agency (не business_starter — Starter у
 * новій лінійці відповідає СТАРОМУ найдешевшому Starter $49, тоді як
 * Growth $99 — це вже наступний щабель, що найближче мапиться на
 * Pro $24.99 нової лінійки за позицією в списку тарифів, не за
 * ціною).
 */
export function hasProTierAccess(planCode: string | null | undefined): boolean {
  if (!planCode) return false;
  const LEGACY_PRO_PLUS = new Set(["growth", "agency", "admin", "trial"]);
  const NEW_PRO_PLUS = new Set([
    "business_pro", "business_agency",
    "mail_pro", "mail_agency",
    "creator_pro", "creator_agency",
    "office_pro", "office_agency",
    "browser_pro", "browser_agency",
  ]);
  return LEGACY_PRO_PLUS.has(planCode) || NEW_PRO_PLUS.has(planCode);
}

/**
 * "Starter і вище" (будь-який платний тариф, включно з найдешевшим) —
 * використовується там, де досить самого факту платної підписки,
 * без вимоги до конкретного рівня (напр. brokenLinksChecker.ts).
 * Business Free НЕ входить сюди свідомо — Free це не "платний
 * тариф", навіть якщо технічно є активним рядком subscriptions.
 */
export function hasStarterTierAccess(planCode: string | null | undefined): boolean {
  if (!planCode) return false;
  const LEGACY_STARTER_PLUS = new Set(["starter", "growth", "agency", "admin", "trial"]);
  const NEW_STARTER_PLUS = new Set([
    "business_starter", "business_pro", "business_agency",
    "mail_starter", "mail_pro", "mail_agency",
    "creator_starter", "creator_pro", "creator_agency",
    "office_starter", "office_pro", "office_agency",
    "browser_starter", "browser_pro", "browser_agency",
  ]);
  return LEGACY_STARTER_PLUS.has(planCode) || NEW_STARTER_PLUS.has(planCode);
}

/**
 * "Agency і вище" (найвищий рівень, White Label/повний API/команди
 * до 25) — раніше просто planCode === "agency".
 */
export function hasAgencyTierAccess(planCode: string | null | undefined): boolean {
  if (!planCode) return false;
  const LEGACY_AGENCY_PLUS = new Set(["agency", "enterprise", "admin"]);
  const NEW_AGENCY_PLUS = new Set([
    "business_agency", "mail_agency", "creator_agency", "office_agency", "browser_agency",
  ]);
  return LEGACY_AGENCY_PLUS.has(planCode) || NEW_AGENCY_PLUS.has(planCode);
}

/**
 * Хелпер для numeric-лімітів (CONTACT_LIMIT_BY_PLAN/
 * MONTHLY_POST_LIMIT_BY_PLAN-стиль карти) — зводить planCode до
 * одного з 4 "логічних рівнів" (free/starter/pro/agency), щоб
 * виклик міг матчити ОДНЕ число на рівень замість дублювання
 * запису на кожен legacy- і new-код окремо. product-специфічні
 * legacy-коди (starter/growth/agency) теж мапляться сюди — вони
 * історично завжди означали Business.
 */
export function resolvePlanTier(planCode: string | null | undefined): "free" | "starter" | "pro" | "agency" {
  if (!planCode) return "free";
  if (planCode === "admin") return "agency"; // platform admin — найвищий практичний рівень
  if (planCode === "trial") return "starter"; // легасі: 14-денний trial ~ Starter-рівень доступу
  if (planCode === "enterprise") return "agency";
  if (planCode.endsWith("_agency") || planCode === "agency") return "agency";
  if (planCode.endsWith("_pro") || planCode === "growth") return "pro";
  if (planCode.endsWith("_starter") || planCode === "starter") return "starter";
  return "free"; // {product}_free, легасі free, або невідомий код
}

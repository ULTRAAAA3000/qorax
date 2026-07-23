import { ProductUpgradePage, type PlanCardDef } from "@/app/components/ProductUpgradePage";

export const metadata = { title: "Обрати план — Qorax" };

// Нова лінійка Business (0086, PRICING.md Частина A) — Free не має
// LemonSqueezy-варіанту (призначається автоматично при реєстрації),
// тому не входить у PLANS нижче — Free-стан організації показує
// сама сторінка ("Активний ✓" на карті нижчого рівня, якщо
// currentPlan === "business_free").
const PLANS: PlanCardDef[] = [
  {
    code: "business_starter",
    tier: "starter",
    name: "Starter",
    price: 12.99,
    highlight: false,
    accent: "lime",
    description: "Для фрілансерів і малого бізнесу",
    features: ["До 10 сайтів", "Моніторинг кожні 30 хв", "500 ключових запитів", "Історія 6 місяців", "AI — 500 запитів", "PDF-звіти, інтеграції, автоматизації"],
  },
  {
    code: "business_pro",
    tier: "pro",
    name: "Pro",
    price: 24.99,
    highlight: true,
    accent: "lime",
    description: "Для професіоналів",
    features: ["До 100 сайтів, необмежені проєкти", "Моніторинг кожні 5 хв", "5 000 ключових запитів, історія 2 роки", "AI — 5 000 запитів", "White Label, API, AI Copilot", "Команда до 5 осіб"],
  },
  {
    code: "business_agency",
    tier: "agency",
    name: "Agency",
    price: 59.99,
    highlight: false,
    accent: "cyan",
    description: "Для агентств і команд",
    features: ["Необмежені сайти й проєкти", "Моніторинг щохвилини", "Необмежені ключові запити, повна історія", "AI — 25 000 запитів", "White Label, повний API", "Команда до 25 осіб, пріоритетна підтримка"],
  },
];

export default async function UpgradePage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  return (
    <ProductUpgradePage
      product="business"
      productLabel="Business"
      backHref="/dashboard"
      backLabel="Дашборд"
      homeHref="/dashboard/home"
      plans={PLANS}
      freeBlurb="Free-тариф назавжди при реєстрації, без картки. Оплата через LemonSqueezy."
      freeFaqAnswer="Назавжди безкоштовний рівень — 1 сайт, щоденний моніторинг, базовий SEO Audit, AI 20 запитів/міс. Без обмеження в часі."
      recommendedPlanParam={plan}
    />
  );
}

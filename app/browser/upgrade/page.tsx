import { ProductUpgradePage, type PlanCardDef } from "@/app/components/ProductUpgradePage";

export const metadata = { title: "Тарифи Qorax Browser" };

const PLANS: PlanCardDef[] = [
  {
    code: "browser_starter",
    tier: "starter",
    name: "Starter",
    price: 12.99,
    highlight: false,
    accent: "lime",
    description: "Для фрілансерів і малого бізнесу",
    features: ["Необмежені колекції", "AI — 500 запитів", "Розширений SEO-аналіз", "Синхронізація", "AI Sidebar"],
  },
  {
    code: "browser_pro",
    tier: "pro",
    name: "Pro",
    price: 24.99,
    highlight: true,
    accent: "lime",
    description: "Для професіоналів",
    features: ["AI — 5 000 запитів", "Спільні робочі простори", "Просунутий аналіз сайтів", "Команда до 5 осіб"],
  },
  {
    code: "browser_agency",
    tier: "agency",
    name: "Agency",
    price: 59.99,
    highlight: false,
    accent: "cyan",
    description: "Для агентств і команд",
    features: ["AI — 25 000 запитів", "Спільні робочі простори", "Команда до 25 осіб", "Пріоритетна обробка задач"],
  },
];

export default async function BrowserUpgradePage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  return (
    <ProductUpgradePage
      product="browser"
      productLabel="Browser"
      backHref="/browser"
      backLabel="Browser"
      homeHref="/browser"
      plans={PLANS}
      freeBlurb="Free-тариф назавжди без картки. Оплата через LemonSqueezy."
      freeFaqAnswer="Назавжди безкоштовний рівень — AI Sidebar, SEO-аналіз сторінки, збереження до 100 сторінок. Без обмеження в часі."
      recommendedPlanParam={plan}
    />
  );
}

import { ProductUpgradePage, type PlanCardDef } from "@/app/components/ProductUpgradePage";

export const metadata = { title: "Тарифи Qorax Office" };

const PLANS: PlanCardDef[] = [
  {
    code: "office_starter",
    tier: "starter",
    name: "Starter",
    price: 12.99,
    highlight: false,
    accent: "lime",
    description: "Для фрілансерів і малого бізнесу",
    features: ["Необмежені документи", "AI — 500 запитів", "Спільна робота", "Історія версій", "Експорт PDF"],
  },
  {
    code: "office_pro",
    tier: "pro",
    name: "Pro",
    price: 24.99,
    highlight: true,
    accent: "lime",
    description: "Для професіоналів",
    features: ["AI — 5 000 запитів", "Шаблони компанії", "Розширений експорт", "Спільна робота, історія версій", "Команда до 5 осіб"],
  },
  {
    code: "office_agency",
    tier: "agency",
    name: "Agency",
    price: 59.99,
    highlight: false,
    accent: "cyan",
    description: "Для агентств і команд",
    features: ["AI — 25 000 запитів", "Шаблони компанії, розширений експорт", "Команда до 25 осіб", "Пріоритетна обробка задач"],
  },
];

export default async function OfficeUpgradePage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  return (
    <ProductUpgradePage
      product="office"
      productLabel="Office"
      backHref="/office"
      backLabel="Office"
      homeHref="/office"
      plans={PLANS}
      freeBlurb="Free-тариф назавжди без картки. Оплата через LemonSqueezy."
      freeFaqAnswer="Назавжди безкоштовний рівень — усі редактори, до 20 документів, експорт PDF, AI 20 запитів/міс. Без обмеження в часі."
      recommendedPlanParam={plan}
    />
  );
}

import { ProductUpgradePage, type PlanCardDef } from "@/app/components/ProductUpgradePage";

export const metadata = { title: "Тарифи Qorax Creator" };

const PLANS: PlanCardDef[] = [
  {
    code: "creator_starter",
    tier: "starter",
    name: "Starter",
    price: 12.99,
    highlight: false,
    accent: "lime",
    description: "Для фрілансерів і малого бізнесу",
    features: ["До 50 проєктів", "AI — 500 генерацій", "Експорт SVG/PDF", "Brand Kit", "Усі шаблони"],
  },
  {
    code: "creator_pro",
    tier: "pro",
    name: "Pro",
    price: 24.99,
    highlight: true,
    accent: "lime",
    description: "Для професіоналів",
    features: ["Необмежені проєкти", "AI — 5 000 генерацій", "Спільна робота", "Преміум-ресурси", "Команда до 5 осіб"],
  },
  {
    code: "creator_agency",
    tier: "agency",
    name: "Agency",
    price: 59.99,
    highlight: false,
    accent: "cyan",
    description: "Для агентств і команд",
    features: ["Необмежені проєкти", "AI — 25 000 генерацій", "Спільна робота і преміум-ресурси", "Команда до 25 осіб", "Пріоритетна обробка задач"],
  },
];

export default async function CreatorUpgradePage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  return (
    <ProductUpgradePage
      product="creator"
      productLabel="Creator"
      backHref="/creator"
      backLabel="Creator"
      homeHref="/creator"
      plans={PLANS}
      freeBlurb="Free-тариф назавжди без картки. Оплата через LemonSqueezy."
      freeFaqAnswer="Назавжди безкоштовний рівень — 3 проєкти, базові шаблони, експорт PNG/JPG, AI 20 генерацій/міс. Без обмеження в часі."
      recommendedPlanParam={plan}
    />
  );
}

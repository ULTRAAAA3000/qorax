import { ProductUpgradePage, type PlanCardDef } from "@/app/components/ProductUpgradePage";

export const metadata = { title: "Тарифи Qorax Mail" };

// Нова лінійка Mail (0086, PRICING.md Частина A) — Free не має
// LemonSqueezy-варіанту (призначається автоматично разом з
// business_free при реєстрації, handle_new_user), тому не входить у
// PLANS нижче — той самий підхід, що вже прийнятий для Business.
const PLANS: PlanCardDef[] = [
  {
    code: "mail_starter",
    tier: "starter",
    name: "Starter",
    price: 12.99,
    highlight: false,
    accent: "lime",
    description: "Для фрілансерів і малого бізнесу",
    features: ["До 5 поштових акаунтів", "AI — 500 запитів", "Автовідповіді", "Планувальник листів", "Базові шаблони й правила"],
  },
  {
    code: "mail_pro",
    tier: "pro",
    name: "Pro",
    price: 24.99,
    highlight: true,
    accent: "lime",
    description: "Для професіоналів",
    features: ["Необмежені поштові акаунти", "AI — 5 000 запитів", "Розсилки (broadcasts)", "Спільні поштові скриньки", "Команда до 5 осіб"],
  },
  {
    code: "mail_agency",
    tier: "agency",
    name: "Agency",
    price: 59.99,
    highlight: false,
    accent: "cyan",
    description: "Для агентств і команд",
    features: ["Необмежені поштові акаунти", "AI — 25 000 запитів", "Розсилки і спільні скриньки", "Команда до 25 осіб", "Пріоритетна обробка задач"],
  },
];

export default async function MailUpgradePage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  return (
    <ProductUpgradePage
      product="mail"
      productLabel="Mail"
      backHref="/mail"
      backLabel="Mail"
      homeHref="/mail"
      plans={PLANS}
      freeBlurb="Free-тариф назавжди без картки. Оплата через LemonSqueezy."
      freeFaqAnswer="Назавжди безкоштовний рівень — 1 поштовий акаунт, базові шаблони й прості правила, AI 20 запитів/міс. Без обмеження в часі."
      recommendedPlanParam={plan}
    />
  );
}

import { ProductComingSoon } from "@/app/components/ProductComingSoon";
import { Inbox, Send, Bot } from "lucide-react";

export const metadata = { title: "Qorax Mail — незабаром" };

export default function MailPage() {
  return (
    <ProductComingSoon
      activePath="/mail"
      eyebrow="QORAX MAIL"
      name="Qorax Mail"
      tagline="Спілкуйтесь з клієнтами"
      description="Корпоративна пошта, email-маркетинг та AI-агенти для листування — в одному місці, окремо від решти платформи."
      accent="cyan"
      highlights={[
        { icon: Inbox, title: "Пошта та контакти", text: "Вхідні, компонування листів та контакти в одному робочому просторі." },
        { icon: Send, title: "Маркетинг", text: "Кампанії, автоматизації та шаблони листів без стороннього сервісу." },
        { icon: Bot, title: "AI-агенти", text: "Автовідповіді, продажі, підтримка та пріоритизація листів під наглядом AI." },
      ]}
    />
  );
}

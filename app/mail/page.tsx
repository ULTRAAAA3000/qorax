import { ProductComingSoon } from "@/app/components/ProductComingSoon";
import { createClient } from "@/app/lib/supabase/server";
import { Inbox, Send, Bot } from "lucide-react";

export const metadata = { title: "Qorax Mail — незабаром" };

export default async function MailPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <ProductComingSoon
      activePath="/mail"
      eyebrow="QORAX MAIL"
      name="Qorax Mail"
      tagline="Спілкуйтесь з клієнтами"
      description="Корпоративна пошта, email-маркетинг та AI-агенти для листування — в одному місці, окремо від решти платформи."
      accent="cyan"
      isLoggedIn={!!user}
      highlights={[
        { icon: Inbox, title: "Пошта та контакти", text: "Вхідні, компонування листів та контакти в одному робочому просторі." },
        { icon: Send, title: "Маркетинг", text: "Кампанії, автоматизації та шаблони листів без стороннього сервісу." },
        { icon: Bot, title: "AI-агенти", text: "Автовідповіді, продажі, підтримка та пріоритизація листів під наглядом AI." },
      ]}
    />
  );
}

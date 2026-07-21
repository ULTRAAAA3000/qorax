import { createClient } from "@/app/lib/supabase/server";
import { ProductComingSoon } from "@/app/components/ProductComingSoon";
import { MailApp } from "./MailApp";
import { redirect } from "next/navigation";
import { Inbox, Send, Bot } from "lucide-react";

export const metadata = { title: "Qorax Mail" };

// Qorax Mail — Шар 1 (MODULE_ROADMAP.md). /mail лишається окремою
// точкою входу (не /dashboard/mail) — позиціонування "окремий
// продукт екосистеми", хоча технічно mail_accounts.organization_id
// NOT NULL (авторизація через вже наявну Qorax-організацію, рішення
// прийняте перед 0076_mail_core.sql).
//
// Незалогінений відвідувач одразу редиректиться на /login (той самий
// підхід, що /creator, /browser, /office) — ProductComingSoon
// прибрана для цього випадку за прямою вказівкою Артема: сесія
// Supabase спільна на весь домен, кешований вхід одразу поверне сюди
// через middleware. Fallback "залогінений, але без organization"
// (нижче) — окремий, не про логін, лишається без змін.
export default async function MailPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    // Авторизований, але без організації — не мало б трапитись у
    // звичайному флоу (реєстрація завжди створює organization), але
    // safe fallback замість краху сторінки.
    return (
      <ProductComingSoon
        activePath="/mail"
        eyebrow="QORAX MAIL"
        name="Qorax Mail"
        tagline="Спілкуйтесь з клієнтами"
        description="Спочатку завершіть налаштування вашої організації в Qorax Business."
        accent="cyan"
        isLoggedIn={true}
        highlights={[
          { icon: Inbox, title: "Пошта та контакти", text: "Вхідні, компонування листів та контакти в одному робочому просторі." },
          { icon: Send, title: "Маркетинг", text: "Кампанії, автоматизації та шаблони листів без стороннього сервісу." },
          { icon: Bot, title: "AI-агенти", text: "Автовідповіді, продажі, підтримка та пріоритизація листів під наглядом AI." },
        ]}
      />
    );
  }

  return <MailApp organizationId={membership.organization_id} />;
}

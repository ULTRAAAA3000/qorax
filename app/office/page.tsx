import { ProductComingSoon } from "@/app/components/ProductComingSoon";
import { FileText, Table, Presentation } from "lucide-react";

export const metadata = { title: "Qorax Office — незабаром" };

export default function OfficePage() {
  return (
    <ProductComingSoon
      activePath="/office"
      eyebrow="QORAX OFFICE"
      name="Qorax Office"
      tagline="Працюйте з документами"
      description="AI-простір для документів, таблиць і презентацій — не аналог Word, а помічник, що робить основну роботу за вас."
      accent="lime"
      highlights={[
        { icon: FileText, title: "Docs", text: "Редактор документів з AI Writer, що сам збирає готовий текст, таблиці та оформлення." },
        { icon: Table, title: "Sheets", text: "Таблиці з AI-генерацією з природної мови, діаграмами та імпортом з Excel/CSV." },
        { icon: Presentation, title: "Slides", text: "Презентації з AI — структура, дизайн і графіки за одним запитом." },
      ]}
    />
  );
}

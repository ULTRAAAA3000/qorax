import { ProductComingSoon } from "@/app/components/ProductComingSoon";
import { Sparkles, ScanSearch, FolderOpen } from "lucide-react";

export const metadata = { title: "Qorax Browser — незабаром" };

export default function BrowserPage() {
  return (
    <ProductComingSoon
      activePath="/browser"
      eyebrow="QORAX BROWSER"
      name="Qorax Browser"
      tagline="Досліджуйте інтернет"
      description="Робочий браузер для творців, маркетологів і підприємців: аналізує сайти, збирає ідеї та передає їх у решту екосистеми Qorax."
      accent="cyan"
      highlights={[
        { icon: Sparkles, title: "AI Sidebar", text: "AI на будь-якій сторінці — пояснює сайт, робить SEO-аудит, готує макет чи лист одним запитом." },
        { icon: ScanSearch, title: "Site Inspector", text: "Шрифти, кольори, компоненти, SEO, швидкість і технології будь-якого сайту в один клік." },
        { icon: FolderOpen, title: "Collections", text: "Конкуренти, референси, статті та ідеї одного проєкту в одному місці — заміна закладкам." },
      ]}
    />
  );
}

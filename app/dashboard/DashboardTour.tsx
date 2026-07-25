"use client";

import { useProductTour, type TourStep } from "@/app/lib/useProductTour";
import { TourButton } from "@/app/components/TourButton";

const DASHBOARD_TOUR_STEPS: TourStep[] = [
  {
    element: '[data-tour="dashboard-add-site"]',
    title: "Додайте перший сайт",
    description: "Вкажіть URL — і Qorax почне стежити за uptime, швидкістю та SEO вашого сайту автоматично.",
    side: "bottom",
  },
  {
    element: '[data-tour="dashboard-sidebar"]',
    title: "Навігація платформи",
    description: "Тут усі модулі Qorax: Dashboard, AI-помічник, а нижче — Apps з рештою інструментів.",
    side: "right",
  },
  {
    element: '[data-tour="dashboard-apps"]',
    title: "Розширені можливості",
    description: "CRM, соцмережі, переклади, Academy та інше — тут зібрано все, що виходить за межі базового моніторингу.",
    side: "right",
  },
  {
    element: '[data-tour="dashboard-plan"]',
    title: "Ваш тариф",
    description: "Поточний план і ліміти. Натисніть, щоб переглянути можливості апгрейду.",
    side: "bottom",
  },
  {
    element: '[data-tour="dashboard-settings"]',
    title: "Налаштування",
    description: "Тут можна підключити Telegram, email-сповіщення та керувати командою.",
    side: "bottom",
  },
];

export function DashboardTour() {
  const { startTour } = useProductTour("dashboard", DASHBOARD_TOUR_STEPS);
  return <TourButton onStart={startTour} />;
}

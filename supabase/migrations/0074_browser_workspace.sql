-- ============================================================
-- QORAX — Migration 0074: Qorax Browser — browser_history (MVP)
-- ============================================================
-- MODULE_ROADMAP.md, "Qorax Browser — окремий продукт екосистеми".
-- З явного MVP-обсягу цього проходу (обговорено з Артемом): лише
-- URL bar + proxy-перегляд сайту + AI Sidebar ("що це за сайт?",
-- SEO-аудит через вже наявні Gemini-виклики) — найпростіший видимий
-- результат. Решта переліку з roadmap (Collections/Smart Capture/
-- Site Inspector/One Click Actions/AI Compare/Research Mode/
-- Component Extractor/Marketplace тощо) — НЕ цей прохід.
--
-- Ця міграція НАВМИСНО мінімальна — лише одна таблиця:
-- - browser_history — недавні відвідані URL (для списку "останні" в
--   UI і як перший цеглинка майбутньої AI Memory з roadmap, не сама
--   AI Memory — та вимагає окремої логіки семантичного пошуку/
--   summarization, поза MVP)
-- - Collections (проєкти з конкурентами/референсами) — окрема
--   таблиця майбутньої ітерації, MVP не має проєктів, лише історія
-- - ai_summary — коротке text-поле для відповіді AI Sidebar, щоб не
--   повторно викликати Gemini при відкритті того самого URL вдруге
--   за сесію (кешування) — не окрема таблиця "аналізів", лише
--   nullable-колонка тут
-- ============================================================

create table browser_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  url text not null,
  title text,
  ai_summary text,
  visited_by uuid references profiles(id) on delete set null,
  visited_at timestamptz not null default now()
);

comment on table browser_history is
  'Історія переглядів у Qorax Browser (MVP). ai_summary — кешована відповідь AI Sidebar ("що це за сайт?"), щоб не викликати Gemini повторно для того самого URL. MODULE_ROADMAP.md, розділ "Qorax Browser".';

create index idx_browser_history_organization on browser_history(organization_id, visited_at desc);

alter table browser_history enable row level security;

-- Той самий organization-рівня патерн, що canvas_boards (0071) і
-- office_documents (0072) — без розрізнення viewer/editor на MVP-етапі.
create policy "browser_history_all" on browser_history
  for all using (
    organization_id in (select user_organization_ids())
    or is_platform_admin()
  );

-- ============================================================
-- НАВМИСНО без реєстрації в platform_modules: той самий принцип, що
-- canvas_boards (0071) і office_documents (0072) — Qorax Browser є
-- окремим топ-левел продуктом екосистеми (/browser), не модулем
-- усередині Dashboard-сайдбару.
-- ============================================================

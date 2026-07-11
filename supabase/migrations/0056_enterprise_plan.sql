-- 0056_enterprise_plan.sql
-- Фаза 0.4 з EXECUTION_PLAN.md — сам тариф Enterprise (enum-значення
-- вже додано окремою міграцією 0055, тепер безпечно використовувати).
--
-- ls_variant_id НЕ заповнено — Enterprise зазвичай продається не
-- через самостійний checkout (LemonSqueezy variant), а через прямі
-- перемовини/контракт. Коли зʼявиться перший реальний Enterprise-
-- клієнт, Артем або: (а) створює LS variant і заповнює ls_variant_id
-- як для інших планів, або (б) призначає план вручну через
-- organization_id без checkout взагалі (підписка створюється прямим
-- insert/update в subscriptions, не через LS webhook) — обидва шляхи
-- вже підтримує наявна схема, нової міграції для цього не треба.
--
-- site_limit/extra_site_price_usd — робочі заглушки, як і
-- AI_CREDITS_BY_PLAN у lemonSqueezyWebhook.ts; фінальні комерційні
-- умови Enterprise зазвичай індивідуальні per-контракт, тому ці
-- числа радше орієнтир для UI (`plans` таблиця), ніж жорстке
-- обмеження — конкретний Enterprise-клієнт може мати інший ліміт
-- через organization_module_access override, якщо контракт вимагає.

insert into plans (code, name, price_usd, site_limit, extra_site_price_usd, features) values
(
  'enterprise', 'Enterprise', 499.00, 20, 19.00,
  '{
    "uptime_monitoring": true,
    "speed_tracking": true,
    "ssl_domain_alerts": true,
    "broken_links": true,
    "ai_explain_simple": true,
    "monthly_pdf_report": true,
    "email_alerts": true,
    "core_web_vitals": true,
    "meta_schema_checker": true,
    "gsc_integration": true,
    "sitemap_robots_analysis": true,
    "duplicate_pages": true,
    "ai_revenue_impact": true,
    "competitor_monitoring": -1,
    "telegram_alerts": true,
    "live_dashboard": true,
    "white_label": true,
    "ai_content_generation": true,
    "docs_enterprise_content": true
  }'::jsonb
)
on conflict (code) do nothing;

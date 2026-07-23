-- ============================================================
-- QORAX — Migration 0085: telegram_coach_messages
-- ============================================================
-- Business Coach (документ Артема, пункт 16, ⭐⭐⭐⭐⭐: "Telegram сам
-- пише. Не по ошибкам. А как консультант" — приклади: нагадування про
-- застарілий контент, похвала за різке покращення швидкості).
--
-- На відміну від Weekly Digest (фіксовано щопонеділка) — Business
-- Coach перевіряється щодня в тому самому cron-циклі, що вже робить
-- speed/SEO/конкуренти (0 3 * * *), але надсилає повідомлення лише
-- коли є значуща подія, не за розкладом. Ця таблиця — дедуплікація:
-- один тип сигналу на організацію не частіше ніж раз на N днів (та
-- сама роль, що вже виконує speed_degradation_alerts для іншого
-- сигналу — навмисно не переюзовуємо ту таблицю, бо там site_id, а
-- Business Coach працює на рівні organization_id, і сигнали різні за
-- природою: "coach"-повідомлення радше про бізнес-контекст, ніж
-- конкретний технічний інцидент).
-- ============================================================

create table if not exists telegram_coach_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  -- 'content_silence' | 'speed_improvement' — розширюється майбутніми сигналами
  signal_type text not null,
  sent_at timestamptz not null default now()
);

create index idx_telegram_coach_messages_org_signal
  on telegram_coach_messages(organization_id, signal_type, sent_at desc);

alter table telegram_coach_messages enable row level security;

-- Тільки service role (воркер) — той самий підхід, що speed_degradation_alerts
create policy "service role only"
  on telegram_coach_messages
  using (false);

comment on table telegram_coach_messages is
  'Лог надісланих Business Coach повідомлень у Telegram — дедуплікація, один тип сигналу на організацію не частіше ніж раз на кілька днів.';

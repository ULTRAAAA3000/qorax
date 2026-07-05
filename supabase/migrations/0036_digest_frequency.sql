-- 0036_digest_frequency.sql
-- Налаштування частоти тижневого email-дайджесту. Раніше sendWeeklyDigests()
-- надсилала лист усім активним організаціям без розбору щопонеділка —
-- тепер можна обрати weekly / biweekly / monthly / off.

create type digest_frequency as enum ('weekly', 'biweekly', 'monthly', 'off');

alter table notification_settings
  add column if not exists digest_frequency digest_frequency not null default 'weekly';

comment on column notification_settings.digest_frequency is 'Частота email-дайджесту: weekly (щопонеділка), biweekly (кожен другий понеділок), monthly (перший понеділок місяця), off (вимкнено).';

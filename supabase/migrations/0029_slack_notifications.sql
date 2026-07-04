-- ============================================================
-- QORAX — Migration 0029: Slack webhook notifications
-- ============================================================
-- Додає Slack як третій канал алертів поряд з email і Telegram.
-- Slack не потребує bot-токена — organization просто вставляє
-- Incoming Webhook URL зі свого Slack workspace.

alter type alert_channel add value if not exists 'slack';

alter table notification_settings
  add column if not exists slack_enabled boolean not null default false,
  add column if not exists slack_webhook_url text;

comment on column notification_settings.slack_webhook_url is
  'Incoming Webhook URL зі Slack (https://hooks.slack.com/services/...). Доступно з Growth плану, як і Telegram.';

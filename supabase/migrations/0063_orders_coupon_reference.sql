-- 0063_orders_coupon_reference.sql
-- Commerce: прив'язка замовлення до купона, який був застосований.
--
-- Контекст: commerceCheckout.ts рахував coupons.used_count одразу
-- при СТВОРЕННІ checkout-сесії (до факту оплати) — якщо покупець
-- кидав кошик, checkout закінчувався (LS expires_at 30 хв), або
-- платіж не проходив, ліміт купона все одно витрачався. Той самий
-- клас проблеми, що вже виправлено для stock_quantity (див.
-- EXECUTION_PLAN.md, "Commerce: автоматичне списання складу при
-- оплаті"): рахувати використання треба в момент ПІДТВЕРДЖЕННЯ
-- оплати (webhook order_created, status=paid), не раніше.
--
-- Для цього webhook-обробнику потрібно знати, який купон застосований
-- до замовлення — зараз ця інформація ніде не зберігається між
-- checkout-запитом і webhook-подією (couponId існував лише як
-- локальна змінна commerceCheckout.ts). Додаємо посилання на orders.

alter table orders add column coupon_id uuid references coupons(id) on delete set null;

comment on column orders.coupon_id is 'Купон, застосований при оформленні цього замовлення. Використовується webhook-обробником (lemonSqueezyWebhook.ts) для інкременту coupons.used_count РІВНО ОДИН РАЗ, у момент підтвердження оплати — не в момент створення checkout-сесії.';

create index idx_orders_coupon on orders(coupon_id) where coupon_id is not null;

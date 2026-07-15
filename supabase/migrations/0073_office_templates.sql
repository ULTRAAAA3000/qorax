-- ============================================================
-- QORAX — Migration 0073: Qorax Office — office_templates
-- ============================================================
-- MODULE_ROADMAP.md, "Qorax Office" — пункт MVP-списку "шаблони
-- документів". Найдешевший наступний крок після Docs+AI Writer:
-- не новий режим/рушій, а бібліотека стартового контенту для вже
-- готового Docs-редактора (0072) — той самий формат content jsonb
-- "{blocks:[...]}", жодної нової схеми блоків.
--
-- organization_id nullable — системні шаблони (доступні всім
-- організаціям, редагувати не можна) мають organization_id=null;
-- кастомні шаблони конкретної організації (майбутнє: "зберегти як
-- шаблон" з існуючого документа) — заповнений organization_id.
-- Ця міграція сідить лише системні (5 категорій зі списку Артема:
-- договір/рахунок/комерційна пропозиція/план проєкту/SOP — решта
-- категорій з плану, резюме/інструкція/звіт/політика компанії,
-- лишаються майбутнім розширенням бібліотеки, не потребують зміни
-- схеми).
-- ============================================================

create table office_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade, -- null = системний шаблон
  category text not null,      -- 'contract' | 'invoice' | 'proposal' | 'project_plan' | 'sop' | ...
  title text not null,
  description text,
  content jsonb not null default '{"blocks":[]}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table office_templates is
  'Бібліотека шаблонів Qorax Office Docs. organization_id null = системний (усім доступний, нередагований), заповнений = власний шаблон організації. content — той самий формат, що office_documents.content (0072). MODULE_ROADMAP.md, розділ "Qorax Office".';

create index idx_office_templates_organization on office_templates(organization_id) where organization_id is not null;

alter table office_templates enable row level security;

-- select: системні шаблони бачать усі залогінені; власні шаблони
-- організації — лише її учасники. insert/update/delete: лише власні
-- шаблони організації (системні керуються тільки міграціями/адміном).
create policy "office_templates_select" on office_templates
  for select using (
    organization_id is null
    or organization_id in (select user_organization_ids())
    or is_platform_admin()
  );

create policy "office_templates_insert" on office_templates
  for insert with check (
    organization_id in (
      select m.organization_id from organization_members m
      where m.user_id = auth.uid() and m.role in ('owner', 'admin', 'editor')
    )
  );

create policy "office_templates_delete" on office_templates
  for delete using (
    organization_id in (
      select m.organization_id from organization_members m
      where m.user_id = auth.uid() and m.role in ('owner', 'admin', 'editor')
    )
    or is_platform_admin()
  );

-- ── Системні шаблони (5 стартових категорій) ──────────────────────

insert into office_templates (organization_id, category, title, description, content) values
(null, 'contract', 'Договір про надання послуг', 'Базовий шаблон договору між виконавцем і замовником', '{"blocks":[
  {"id":"t1","type":"heading","level":1,"text":"Договір про надання послуг №___"},
  {"id":"t2","type":"paragraph","text":"м. ______________                                                                    «___» __________ 20__ р."},
  {"id":"t3","type":"paragraph","text":"[Назва виконавця], в особі [ПІБ, посада], що діє на підставі [Статуту/довіреності], іменований надалі «Виконавець», з однієї сторони, та [Назва замовника] в особі [ПІБ, посада], іменований надалі «Замовник», з іншої сторони, разом іменовані «Сторони», уклали цей Договір про таке:"},
  {"id":"t4","type":"heading","level":2,"text":"1. Предмет договору"},
  {"id":"t5","type":"paragraph","text":"Виконавець зобов''язується надати Замовнику послуги з [опис послуги], а Замовник зобов''язується прийняти та оплатити ці послуги на умовах цього Договору."},
  {"id":"t6","type":"heading","level":2,"text":"2. Вартість та порядок розрахунків"},
  {"id":"t7","type":"paragraph","text":"Загальна вартість послуг за цим Договором становить [сума] грн. Оплата здійснюється [умови оплати]."},
  {"id":"t8","type":"heading","level":2,"text":"3. Строк дії договору"},
  {"id":"t9","type":"paragraph","text":"Договір набирає чинності з моменту підписання і діє до [дата] або до повного виконання Сторонами своїх зобов''язань."},
  {"id":"t10","type":"heading","level":2,"text":"4. Відповідальність сторін"},
  {"id":"t11","type":"paragraph","text":"За невиконання або неналежне виконання зобов''язань за цим Договором Сторони несуть відповідальність згідно з чинним законодавством України."},
  {"id":"t12","type":"heading","level":2,"text":"5. Реквізити сторін"},
  {"id":"t13","type":"paragraph","text":"Виконавець: ______________________          Замовник: ______________________"}
]}'::jsonb),

(null, 'invoice', 'Рахунок на оплату', 'Простий шаблон рахунку для виставлення клієнту', '{"blocks":[
  {"id":"t1","type":"heading","level":1,"text":"Рахунок на оплату № ___ від «___» __________ 20__ р."},
  {"id":"t2","type":"paragraph","text":"Постачальник: [назва компанії, реквізити]"},
  {"id":"t3","type":"paragraph","text":"Отримувач: [назва клієнта, реквізити]"},
  {"id":"t4","type":"heading","level":2,"text":"Послуги / товари"},
  {"id":"t5","type":"bullet_list","items":["[Назва позиції 1] — [кількість] × [ціна] = [сума]","[Назва позиції 2] — [кількість] × [ціна] = [сума]"]},
  {"id":"t6","type":"heading","level":2,"text":"До сплати"},
  {"id":"t7","type":"paragraph","text":"Загальна сума: [сума] грн (без ПДВ / у т.ч. ПДВ)."},
  {"id":"t8","type":"paragraph","text":"Термін оплати: [кількість днів] банківських днів з дати виставлення рахунку."},
  {"id":"t9","type":"paragraph","text":"Банківські реквізити для оплати: [IBAN, банк, ЄДРПОУ]"}
]}'::jsonb),

(null, 'proposal', 'Комерційна пропозиція', 'Шаблон КП для презентації послуги потенційному клієнту', '{"blocks":[
  {"id":"t1","type":"heading","level":1,"text":"Комерційна пропозиція"},
  {"id":"t2","type":"paragraph","text":"Кому: [ім''я контактної особи, компанія]"},
  {"id":"t3","type":"paragraph","text":"Дякуємо за інтерес до [назва компанії]. Нижче — наша пропозиція співпраці."},
  {"id":"t4","type":"heading","level":2,"text":"Проблема, яку ми вирішуємо"},
  {"id":"t5","type":"paragraph","text":"[Опис проблеми або потреби клієнта]"},
  {"id":"t6","type":"heading","level":2,"text":"Наше рішення"},
  {"id":"t7","type":"bullet_list","items":["[Перевага/компонент рішення 1]","[Перевага/компонент рішення 2]","[Перевага/компонент рішення 3]"]},
  {"id":"t8","type":"heading","level":2,"text":"Вартість"},
  {"id":"t9","type":"paragraph","text":"[Тарифний план / разова вартість / умови оплати]"},
  {"id":"t10","type":"heading","level":2,"text":"Наступні кроки"},
  {"id":"t11","type":"checklist","items":[{"text":"Узгодити деталі на дзвінку","checked":false},{"text":"Підписати договір","checked":false},{"text":"Розпочати роботу","checked":false}]}
]}'::jsonb),

(null, 'project_plan', 'План проєкту', 'Структура для планування невеликого проєкту', '{"blocks":[
  {"id":"t1","type":"heading","level":1,"text":"План проєкту: [назва]"},
  {"id":"t2","type":"paragraph","text":"Мета проєкту: [коротко, що маємо отримати в результаті]"},
  {"id":"t3","type":"heading","level":2,"text":"Терміни"},
  {"id":"t4","type":"paragraph","text":"Старт: [дата]     Завершення: [дата]"},
  {"id":"t5","type":"heading","level":2,"text":"Етапи"},
  {"id":"t6","type":"checklist","items":[{"text":"Етап 1 — [опис]","checked":false},{"text":"Етап 2 — [опис]","checked":false},{"text":"Етап 3 — [опис]","checked":false}]},
  {"id":"t7","type":"heading","level":2,"text":"Команда та відповідальні"},
  {"id":"t8","type":"bullet_list","items":["[Ім''я] — [роль/зона відповідальності]"]},
  {"id":"t9","type":"heading","level":2,"text":"Ризики"},
  {"id":"t10","type":"paragraph","text":"[Що може піти не так і як цьому запобігти]"}
]}'::jsonb),

(null, 'sop', 'Інструкція / SOP', 'Стандартна операційна процедура — покроковий опис процесу', '{"blocks":[
  {"id":"t1","type":"heading","level":1,"text":"SOP: [назва процесу]"},
  {"id":"t2","type":"paragraph","text":"Мета: [навіщо потрібна ця процедура, коли її застосовувати]"},
  {"id":"t3","type":"heading","level":2,"text":"Хто виконує"},
  {"id":"t4","type":"paragraph","text":"[Роль/посада відповідального співробітника]"},
  {"id":"t5","type":"heading","level":2,"text":"Кроки"},
  {"id":"t6","type":"checklist","items":[{"text":"Крок 1 — [дія]","checked":false},{"text":"Крок 2 — [дія]","checked":false},{"text":"Крок 3 — [дія]","checked":false}]},
  {"id":"t7","type":"heading","level":2,"text":"Типові помилки"},
  {"id":"t8","type":"bullet_list","items":["[Помилка 1 і як її уникнути]"]},
  {"id":"t9","type":"heading","level":2,"text":"Контроль якості"},
  {"id":"t10","type":"paragraph","text":"[Як перевірити, що процедура виконана правильно]"}
]}'::jsonb);

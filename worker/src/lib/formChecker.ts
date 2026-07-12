// ============================================================
// formChecker.ts — перевірка наявності форм на сайтах клієнтів
// Детектує: чи знайдена форма, кількість полів, наявність кнопки submit.
// Запускається щоденно разом з SEO checker.
// ============================================================

import { selectRows, insertRow } from "./supabase";

const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT = "Mozilla/5.0 (compatible; QoraxBot/1.0)";

interface MonitoredFormRow {
  id: string;
  site_id: string;
  page_url: string;
  form_selector: string | null;
  label: string | null;
}

export async function runFormChecks(
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<{ checked: number; errors: number }> {
  const result = await selectRows<MonitoredFormRow>(
    "monitored_forms",
    "select=id,site_id,page_url,form_selector,label&active=eq.true",
    supabaseUrl,
    serviceRoleKey
  );

  if (!result.data?.length) return { checked: 0, errors: 0 };

  let checked = 0, errors = 0;

  for (const mf of result.data) {
    try {
      const checkResult = await checkForm(mf.page_url, mf.form_selector);
      await insertRow(
        "form_checks",
        {
          monitored_form_id: mf.id,
          site_id: mf.site_id,
          form_found: checkResult.formFound,
          fields_count: checkResult.fieldsCount,
          has_submit: checkResult.hasSubmit,
        },
        supabaseUrl,
        serviceRoleKey
      );
      checked++;
    } catch (err) {
      console.error(`Form check failed for ${mf.page_url}:`, err instanceof Error ? err.message : err);
      errors++;
    }
  }

  return { checked, errors };
}

async function checkForm(
  pageUrl: string,
  formSelector: string | null
): Promise<{ formFound: boolean; fieldsCount: number | null; hasSubmit: boolean | null }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let html = "";
  try {
    const resp = await fetch(pageUrl, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });
    clearTimeout(t);
    if (!resp.ok) return { formFound: false, fieldsCount: null, hasSubmit: null };
    html = await resp.text();
  } catch {
    clearTimeout(t);
    return { formFound: false, fieldsCount: null, hasSubmit: null };
  }

  // Простий regex-аналіз HTML — без DOM парсера (CF Worker обмежений)
  const formMatches = html.match(/<form[\s\S]*?<\/form>/gi) ?? [];
  if (formMatches.length === 0) return { formFound: false, fieldsCount: null, hasSubmit: null };

  // Беремо першу форму (або ту що відповідає selctor якщо є class/id)
  // formMatches.length === 0 вже перевірено вище, тож [0] тут завжди є
  let targetForm: string = formMatches[0]!;
  if (formSelector) {
    // Шукаємо форму з цим id або class
    const selectorPart = formSelector.replace(/^[#.]/, "");
    const matched = formMatches.find(f => f.includes(`id="${selectorPart}"`) || f.includes(`class="${selectorPart}"`) || f.includes(selectorPart));
    if (matched) targetForm = matched;
  }

  const inputCount = (targetForm.match(/<input(?!\s+type=["']hidden["'])/gi) ?? []).length;
  const textareaCount = (targetForm.match(/<textarea/gi) ?? []).length;
  const selectCount = (targetForm.match(/<select/gi) ?? []).length;
  const fieldsCount = inputCount + textareaCount + selectCount;

  const hasSubmit = /<input[^>]+type=["']submit["']|<button[^>]*type=["']submit["']|<button(?![^>]*type=["']button["'])[^>]*>/i.test(targetForm);

  return { formFound: true, fieldsCount, hasSubmit };
}

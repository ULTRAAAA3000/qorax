// ============================================================
// benchmarkAggregator.ts — нічний cron для Benchmarking
// (MODULE_ROADMAP.md, "Четверта хвиля", розділ 15, Крок 2)
// ============================================================
// Проходить по вже наявних метриках (speed_checks, cro_daily_stats,
// ai_generations) і пише знеособлені агрегати в benchmark_snapshots —
// НЕ новий збір даних, переиспользование вже наявних таблиць модулів.
//
// Знеособлення: organization_id/site_id використовуються ТІЛЬКИ для
// пошуку industry/country/business_size організації, самі ці id
// НІКОЛИ не потрапляють у вставлений рядок benchmark_snapshots.
//
// Кожен запуск бере тільки "свіже" вікно (учора) — той самий підхід,
// що runSpeedChecks/runGa4Sync: одна доба даних на один нічний прогін,
// не повний перерахунок історії щоразу.

import type { Env } from "../types";
import { selectRows, insertRow } from "./supabase";

interface OrgProfile {
  id: string;
  industry: string | null;
  country: string | null;
  business_size: string | null;
}

interface SiteRow {
  id: string;
  organization_id: string;
}

interface AggregatorSummary {
  speed_snapshots: number;
  conversion_snapshots: number;
  article_length_snapshots: number;
  errors: number;
}

function yesterdayRange(): { since: string; until: string } {
  const now = new Date();
  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - 1);
  since.setUTCHours(0, 0, 0, 0);
  const until = new Date(since);
  until.setUTCDate(until.getUTCDate() + 1);
  return { since: since.toISOString(), until: until.toISOString() };
}

/** Будує site_id → org-профіль (industry/country/business_size), пропускаючи
 * організації без жодного з трьох полів заповнених — знімок без хоча б
 * одного поля групування не дає percent_rank() за чим рахувати. */
async function buildSiteToOrgProfile(env: Env): Promise<Map<string, OrgProfile>> {
  const [sitesRes, orgsRes] = await Promise.all([
    selectRows<SiteRow>("sites", "select=id,organization_id", env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
    selectRows<OrgProfile>(
      "organizations",
      "select=id,industry,country,business_size&or=(industry.not.is.null,country.not.is.null,business_size.not.is.null)",
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    ),
  ]);

  const orgById = new Map<string, OrgProfile>((orgsRes.data ?? []).map(o => [o.id, o]));
  const siteToOrg = new Map<string, OrgProfile>();
  for (const site of sitesRes.data ?? []) {
    const org = orgById.get(site.organization_id);
    if (org) siteToOrg.set(site.id, org);
  }
  return siteToOrg;
}

async function writeSnapshot(metric: string, value: number, org: OrgProfile, env: Env): Promise<boolean> {
  const res = await insertRow(
    "benchmark_snapshots",
    { industry: org.industry, country: org.country, business_size: org.business_size, metric, value },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  return res.ok;
}

// ── speed_ms: з speed_checks (0004_monitoring_performance.sql) ──────────

async function aggregateSpeed(siteToOrg: Map<string, OrgProfile>, env: Env): Promise<{ count: number; errors: number }> {
  const { since, until } = yesterdayRange();
  const res = await selectRows<{ site_id: string; load_time_ms: number }>(
    "speed_checks",
    `select=site_id,load_time_ms&checked_at=gte.${since}&checked_at=lt.${until}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return { count: 0, errors: 1 };

  let count = 0;
  let errors = 0;
  for (const row of res.data ?? []) {
    const org = siteToOrg.get(row.site_id);
    if (!org) continue; // організація без industry/country/business_size — пропускаємо
    const ok = await writeSnapshot("speed_ms", row.load_time_ms, org, env);
    if (ok) count++; else errors++;
  }
  return { count, errors };
}

// ── conversion_rate: з cro_daily_stats (0048_cro_module.sql) ────────────
// cro_daily_stats вже агреговано по добах — беремо вчорашній рядок
// напряму (date = вчора), conversion_rate вже пораховано в CRO cron.

async function aggregateConversion(siteToOrg: Map<string, OrgProfile>, env: Env): Promise<{ count: number; errors: number }> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 1);
  const dateStr = since.toISOString().slice(0, 10);

  const res = await selectRows<{ site_id: string; conversion_rate: number | null }>(
    "cro_daily_stats",
    `select=site_id,conversion_rate&date=eq.${dateStr}&conversion_rate=not.is.null`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return { count: 0, errors: 1 };

  let count = 0;
  let errors = 0;
  for (const row of res.data ?? []) {
    if (row.conversion_rate === null) continue;
    const org = siteToOrg.get(row.site_id);
    if (!org) continue;
    const ok = await writeSnapshot("conversion_rate", row.conversion_rate, org, env);
    if (ok) count++; else errors++;
  }
  return { count, errors };
}

// ── article_length: з ai_generations (0042_ai_content_module.sql) ───────
// ai_generations не прив'язана жорстко до "статті" (kind може бути title/
// meta_description/faq/article_intro) — беремо тільки kind='article_intro'
// як найближчий наявний proxy для "довжина контенту", довжина в словах.

async function aggregateArticleLength(siteToOrg: Map<string, OrgProfile>, env: Env): Promise<{ count: number; errors: number }> {
  const { since, until } = yesterdayRange();
  const res = await selectRows<{ site_id: string | null; output: string }>(
    "ai_generations",
    `select=site_id,output&kind=eq.article_intro&created_at=gte.${since}&created_at=lt.${until}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return { count: 0, errors: 1 };

  let count = 0;
  let errors = 0;
  for (const row of res.data ?? []) {
    if (!row.site_id) continue; // генерація без прив'язки до сайту — нема кого групувати
    const org = siteToOrg.get(row.site_id);
    if (!org) continue;
    const wordCount = row.output.trim().split(/\s+/).filter(Boolean).length;
    const ok = await writeSnapshot("article_length", wordCount, org, env);
    if (ok) count++; else errors++;
  }
  return { count, errors };
}

export async function runBenchmarkAggregation(env: Env): Promise<AggregatorSummary> {
  const siteToOrg = await buildSiteToOrgProfile(env);

  const [speed, conversion, articleLength] = await Promise.all([
    aggregateSpeed(siteToOrg, env),
    aggregateConversion(siteToOrg, env),
    aggregateArticleLength(siteToOrg, env),
  ]);

  return {
    speed_snapshots: speed.count,
    conversion_snapshots: conversion.count,
    article_length_snapshots: articleLength.count,
    errors: speed.errors + conversion.errors + articleLength.errors,
  };
}

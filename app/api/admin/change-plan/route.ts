import { createClient } from "@/app/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("platform_role")
    .eq("id", user.id)
    .single();

  if (profile?.platform_role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json() as { org_id?: string; plan_id?: string };
  const { org_id, plan_id } = body;
  if (!org_id || !plan_id)
    return NextResponse.json({ error: "org_id та plan_id обов'язкові" }, { status: 400 });

  const { data: plan } = await supabase
    .from("plans")
    .select("id, code, site_limit")
    .eq("id", plan_id)
    .single();

  if (!plan) return NextResponse.json({ error: "План не знайдено" }, { status: 404 });

  const newStatus =
    plan.code === "trial" ? "trialing" :
    plan.code === "free"  ? "canceled" :
    "active";

  const trialEndsAt = plan.code === "trial"
    ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    : null;

  // Try update first — if no rows, insert
  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("organization_id", org_id)
    .single();

  let error;
  if (existing) {
    ({ error } = await supabase
      .from("subscriptions")
      .update({
        plan_id: plan.id,
        status: newStatus,
        trial_ends_at: trialEndsAt,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", org_id));
  } else {
    ({ error } = await supabase
      .from("subscriptions")
      .insert({
        organization_id: org_id,
        plan_id: plan.id,
        status: newStatus,
        trial_ends_at: trialEndsAt,
        updated_at: new Date().toISOString(),
      }));
  }

  if (error) {
    console.error("[admin/change-plan] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Sync org_type + site_limit
  const orgType = plan.code === "agency" ? "agency" : "client";
  const siteLimit = plan.code === "agency" ? 5 : 1;
  await supabase
    .from("organizations")
    .update({ org_type: orgType, site_limit: siteLimit })
    .eq("id", org_id);

  return NextResponse.json({ ok: true, plan_code: plan.code, status: newStatus });
}

import { createClient } from "@/app/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  // Перевіряємо що це адмін
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("platform_role")
    .eq("id", user.id)
    .single();

  if (profile?.platform_role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json() as { org_id?: string; plan_id?: string };
  const { org_id, plan_id } = body;

  if (!org_id || !plan_id) {
    return NextResponse.json({ error: "org_id та plan_id обов'язкові" }, { status: 400 });
  }

  // Отримуємо план
  const { data: plan } = await supabase
    .from("plans")
    .select("id, code")
    .eq("id", plan_id)
    .single();

  if (!plan) {
    return NextResponse.json({ error: "План не знайдено" }, { status: 404 });
  }

  const newStatus =
    plan.code === "trial" ? "trialing" :
    plan.code === "free"  ? "canceled" :
    "active";

  const trialEndsAt = plan.code === "trial"
    ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { error } = await supabase
    .from("subscriptions")
    .upsert(
      {
        organization_id: org_id,
        plan_id: plan.id,
        status: newStatus,
        trial_ends_at: trialEndsAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" }
    );

  if (error) {
    console.error("[admin/change-plan] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, plan_code: plan.code, status: newStatus });
}

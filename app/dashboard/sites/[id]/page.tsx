import { createClient } from "@/app/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Debug — Qorax" };

export default async function SiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: site, error: siteError } = await supabase
    .from("sites")
    .select("id, url, display_name")
    .eq("id", id)
    .single();

  return (
    <div style={{ padding: 40, fontFamily: "monospace", color: "white", background: "#0a0a0a", minHeight: "100vh" }}>
      <h1 style={{ color: "#D6FF3F" }}>🔍 Debug: /dashboard/sites/{id}</h1>
      <hr style={{ borderColor: "#333", margin: "20px 0" }} />

      <h2>Env vars</h2>
      <p>SUPABASE_URL: <code style={{ color: supabaseUrl ? "#D6FF3F" : "#F5675A" }}>{supabaseUrl || "❌ UNDEFINED"}</code></p>
      <p>SUPABASE_KEY: <code style={{ color: supabaseKey ? "#D6FF3F" : "#F5675A" }}>{supabaseKey ? `✓ ${supabaseKey.slice(0, 20)}...` : "❌ UNDEFINED"}</code></p>

      <hr style={{ borderColor: "#333", margin: "20px 0" }} />

      <h2>Auth</h2>
      <p>User: <code style={{ color: user ? "#D6FF3F" : "#F5675A" }}>{user ? user.email : "❌ NOT LOGGED IN"}</code></p>
      <p>User error: <code style={{ color: "#F5675A" }}>{userError?.message || "none"}</code></p>

      <hr style={{ borderColor: "#333", margin: "20px 0" }} />

      <h2>Site query (id: {id})</h2>
      <p>Site found: <code style={{ color: site ? "#D6FF3F" : "#F5675A" }}>{site ? "✓ YES" : "❌ NO"}</code></p>
      <p>Site data: <code>{site ? JSON.stringify(site) : "null"}</code></p>
      <p>Site error: <code style={{ color: "#F5675A" }}>{siteError?.message || "none"}</code></p>
    </div>
  );
}

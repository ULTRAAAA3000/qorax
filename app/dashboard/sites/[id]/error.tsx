"use client";

export default function SiteError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  return (
    <div style={{ padding: 40, fontFamily: "monospace", color: "white", background: "#0a0a0a", minHeight: "100vh" }}>
      <h1 style={{ color: "#F5675A" }}>Runtime Error on /dashboard/sites/[id]</h1>
      <p><strong>Message:</strong> {error.message}</p>
      {error.digest && <p><strong>Digest:</strong> {error.digest}</p>}
      <pre style={{ marginTop: 20, padding: 16, background: "#111", borderRadius: 8, fontSize: 12, overflow: "auto" }}>
        {error.stack}
      </pre>
    </div>
  );
}

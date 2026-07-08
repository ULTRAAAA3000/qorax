"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, X, Loader2, ChevronRight, User, Phone, Mail } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface CrmContact {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  source: string;
  created_at: string;
}

interface CrmDeal {
  id: string;
  contact_id: string | null;
  title: string;
  stage: string;
  value_cents: number | null;
  currency: string;
  created_at: string;
}

interface Props {
  organizationId: string;
  accessToken: string;
}

// Порядок стадій — той самий, що в CHECK-обмеженні crm_deals.stage
// (0043_crm_module.sql) і VALID_STAGES в crmHandler.ts. Змінювати
// тільки синхронно в обох місцях.
const STAGES: { key: string; label: string }[] = [
  { key: "new", label: "Нові" },
  { key: "contacted", label: "Зв'язались" },
  { key: "qualified", label: "Кваліфіковані" },
  { key: "won", label: "Виграні" },
  { key: "lost", label: "Втрачені" },
];

function fmtMoney(cents: number | null, currency: string): string | null {
  if (cents === null) return null;
  return `${(cents / 100).toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ${currency}`;
}

export function CrmBoardUI({ organizationId, accessToken }: Props) {
  const [view, setView] = useState<"deals" | "contacts">("deals");
  const [deals, setDeals] = useState<CrmDeal[] | null>(null);
  const [contacts, setContacts] = useState<CrmContact[] | null>(null);
  const [movingDealId, setMovingDealId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Нова угода ──
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [newDealTitle, setNewDealTitle] = useState("");
  const [creatingDeal, setCreatingDeal] = useState(false);

  // ── Новий контакт ──
  const [showNewContact, setShowNewContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [creatingContact, setCreatingContact] = useState(false);

  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  const loadDeals = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/crm/deals?organization_id=${organizationId}`, { headers: authHeaders });
      const data = await res.json();
      setDeals(data.deals ?? []);
    } catch {
      setDeals([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, accessToken]);

  const loadContacts = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/crm/contacts?organization_id=${organizationId}`, { headers: authHeaders });
      const data = await res.json();
      setContacts(data.contacts ?? []);
    } catch {
      setContacts([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, accessToken]);

  useEffect(() => {
    loadDeals();
    loadContacts();
  }, [loadDeals, loadContacts]);

  async function createDeal(e: React.FormEvent) {
    e.preventDefault();
    if (!newDealTitle.trim()) return;
    setCreatingDeal(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/crm/deals`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: organizationId, title: newDealTitle.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Помилка"); return; }
      setNewDealTitle("");
      setShowNewDeal(false);
      await loadDeals();
    } finally {
      setCreatingDeal(false);
    }
  }

  async function createContact(e: React.FormEvent) {
    e.preventDefault();
    if (!newContactName.trim() && !newContactEmail.trim() && !newContactPhone.trim()) return;
    setCreatingContact(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/crm/contacts`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
          name: newContactName.trim() || undefined,
          email: newContactEmail.trim() || undefined,
          phone: newContactPhone.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Помилка"); return; }
      setNewContactName("");
      setNewContactEmail("");
      setNewContactPhone("");
      setShowNewContact(false);
      await loadContacts();
    } finally {
      setCreatingContact(false);
    }
  }

  async function moveDeal(dealId: string, nextStage: string) {
    setMovingDealId(dealId);
    // оптимістичне оновлення — не чекати відповідь мережі, щоб канбан відчувався миттєвим
    setDeals(prev => prev?.map(d => (d.id === dealId ? { ...d, stage: nextStage } : d)) ?? prev);
    try {
      const res = await fetch(`${API_BASE_URL}/api/crm/deals/${dealId}/stage`, {
        method: "PATCH",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: organizationId, stage: nextStage }),
      });
      if (!res.ok) await loadDeals(); // відкат при помилці — перезавантажити реальний стан
    } finally {
      setMovingDealId(null);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.2)", color: "#ff8080" }}>
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={() => setView("deals")}
          className="text-sm px-3 py-1.5 rounded-lg transition-colors"
          style={view === "deals" ? { background: "var(--lime)", color: "#0a0a0a", fontWeight: 600 } : { color: "var(--text-secondary)" }}
        >
          Угоди
        </button>
        <button
          onClick={() => setView("contacts")}
          className="text-sm px-3 py-1.5 rounded-lg transition-colors"
          style={view === "contacts" ? { background: "var(--lime)", color: "#0a0a0a", fontWeight: 600 } : { color: "var(--text-secondary)" }}
        >
          Контакти
        </button>
      </div>

      {view === "deals" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            {!showNewDeal ? (
              <button onClick={() => setShowNewDeal(true)} className="glow-button text-sm !py-2 !px-4 flex items-center gap-1.5">
                <Plus size={14} /> Нова угода
              </button>
            ) : (
              <form onSubmit={createDeal} className="flex items-center gap-2">
                <input
                  autoFocus
                  value={newDealTitle}
                  onChange={e => setNewDealTitle(e.target.value)}
                  placeholder="Назва угоди"
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }}
                />
                <button type="submit" disabled={creatingDeal} className="glow-button text-sm !py-2 !px-4">
                  {creatingDeal ? <Loader2 size={14} className="animate-spin" /> : "Додати"}
                </button>
                <button type="button" onClick={() => setShowNewDeal(false)} className="text-[var(--text-tertiary)]">
                  <X size={16} />
                </button>
              </form>
            )}
          </div>

          {deals === null ? (
            <div className="glow-card p-10 text-center">
              <Loader2 size={20} className="animate-spin mx-auto" style={{ color: "var(--text-tertiary)" }} />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {STAGES.map((stage, stageIndex) => {
                const stageDeals = deals.filter(d => d.stage === stage.key);
                return (
                  <div key={stage.key} className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">{stage.label}</span>
                      <span className="text-xs text-[var(--text-tertiary)]">{stageDeals.length}</span>
                    </div>
                    <div className="space-y-2 min-h-[80px]">
                      {stageDeals.map(deal => {
                        const money = fmtMoney(deal.value_cents, deal.currency);
                        const nextStage = STAGES[stageIndex + 1]?.key;
                        return (
                          <div key={deal.id} className="glow-card p-3 space-y-2">
                            <p className="text-sm font-medium">{deal.title}</p>
                            {money && <p className="text-xs" style={{ color: "var(--cyan)" }}>{money}</p>}
                            {nextStage && stage.key !== "lost" && (
                              <button
                                onClick={() => moveDeal(deal.id, nextStage)}
                                disabled={movingDealId === deal.id}
                                className="w-full flex items-center justify-center gap-1 text-xs py-1.5 rounded-lg transition-colors"
                                style={{ background: "rgba(255,255,255,0.03)", color: "var(--text-secondary)" }}
                              >
                                {movingDealId === deal.id ? <Loader2 size={12} className="animate-spin" /> : (<>Далі <ChevronRight size={12} /></>)}
                              </button>
                            )}
                          </div>
                        );
                      })}
                      {stageDeals.length === 0 && (
                        <div className="rounded-xl px-3 py-4 text-center" style={{ border: "1px dashed rgba(255,255,255,0.06)" }}>
                          <span className="text-xs text-[var(--text-tertiary)]">—</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {view === "contacts" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            {!showNewContact ? (
              <button onClick={() => setShowNewContact(true)} className="glow-button text-sm !py-2 !px-4 flex items-center gap-1.5">
                <Plus size={14} /> Новий контакт
              </button>
            ) : (
              <form onSubmit={createContact} className="flex flex-wrap items-center gap-2 justify-end">
                <input value={newContactName} onChange={e => setNewContactName(e.target.value)} placeholder="Ім'я" className="rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }} />
                <input value={newContactEmail} onChange={e => setNewContactEmail(e.target.value)} placeholder="Email" className="rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }} />
                <input value={newContactPhone} onChange={e => setNewContactPhone(e.target.value)} placeholder="Телефон" className="rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }} />
                <button type="submit" disabled={creatingContact} className="glow-button text-sm !py-2 !px-4">
                  {creatingContact ? <Loader2 size={14} className="animate-spin" /> : "Додати"}
                </button>
                <button type="button" onClick={() => setShowNewContact(false)} className="text-[var(--text-tertiary)]">
                  <X size={16} />
                </button>
              </form>
            )}
          </div>

          {contacts === null ? (
            <div className="glow-card p-10 text-center">
              <Loader2 size={20} className="animate-spin mx-auto" style={{ color: "var(--text-tertiary)" }} />
            </div>
          ) : contacts.length === 0 ? (
            <div className="glow-card p-10 text-center">
              <p className="text-sm text-[var(--text-secondary)]">Ще немає контактів — додайте перший.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {contacts.map(contact => (
                <div key={contact.id} className="glow-card p-3 flex items-center gap-4">
                  <User size={16} style={{ color: "var(--text-tertiary)" }} />
                  <span className="text-sm font-medium">{contact.name || "Без імені"}</span>
                  {contact.email && (
                    <span className="text-xs text-[var(--text-tertiary)] flex items-center gap-1"><Mail size={12} />{contact.email}</span>
                  )}
                  {contact.phone && (
                    <span className="text-xs text-[var(--text-tertiary)] flex items-center gap-1"><Phone size={12} />{contact.phone}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

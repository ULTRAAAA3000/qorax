"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { RealtimeChannel } from "@supabase/realtime-js";

// useLiveSync — "жива синхронізація при збереженні" (MODULE_ROADMAP.md,
// "Qorax Office", останній пункт — "реальне одночасне редагування").
//
// СВІДОМЕ звуження, задокументоване тут прямо в коді: справжнє
// посимвольне спільне редагування (як у Google Docs) вимагає CRDT
// (напр. Yjs) з character-level прив'язкою до текстових полів —
// для plain <textarea>/<input> (не rich-text framework на кшталт
// ProseMirror) це означало б писати власну логіку збереження позиції
// курсора під час злиття чужих правок посеред друку — високий ризик
// класичного багу "курсор стрибає" без пропорційної якості
// перевірки в цьому проході. Замість цього: коли хтось інший
// зберігає документ, усі інші бачать про це миттєво (через
// Broadcast-канал, той самий Supabase Realtime, що вже перевірений
// у usePresence.ts — жодної нової інфраструктури) — і або
// підтягують зміни автоматично (якщо самі зараз нічого не редагують),
// або бачать ненав'язливий банер замість тихої втрати своїх правок.
//
// Технічно — Broadcast, не Presence і не postgres_changes: Broadcast
// теж працює "з коробки" без вмикання Replication у Supabase
// Dashboard (те саме обґрунтування, що вже для Presence).
export function useLiveSync(
  docType: string,
  docId: string,
  options: {
    isEditing: () => boolean; // чи користувач зараз щось редагує (не перезаписувати мовчки)
    onRemoteUpdate: () => void; // викликається, коли безпечно підтягнути зміни одразу
  }
): { pendingUpdate: boolean; applyPendingUpdate: () => void; notifySaved: () => void } {
  const [pendingUpdate, setPendingUpdate] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  // useState з lazy-ініціалізатором, не useRef(Date.now()...) — той
  // самий клас проблеми, що вже ловив React Compiler раніше
  // (react-hooks/purity): виклик Date.now()/Math.random() напряму
  // під час рендеру нечистий, навіть якщо результат одразу
  // "заморожується" в ref. Lazy useState-ініціалізатор викликається
  // React'ом рівно один раз, поза звичайним циклом рендеру.
  const [selfId] = useState(() => `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const optionsRef = useRef(options);
  useEffect(() => { optionsRef.current = options; }, [options]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { createClient } = await import("@/app/lib/supabase/client");
      const supabase = createClient();
      const channel = supabase.channel(`sync:${docType}:${docId}`);

      channel
        .on("broadcast", { event: "doc-updated" }, (msg: { payload?: { senderId?: string } }) => {
          if (cancelled) return;
          if (msg.payload?.senderId === selfId) return; // не реагувати на власне збереження
          if (optionsRef.current.isEditing()) {
            setPendingUpdate(true); // хтось інший зберіг, поки я редагую — не мовчки перезаписувати
          } else {
            optionsRef.current.onRemoteUpdate(); // безпечно — одразу підтягнути
          }
        })
        .subscribe();

      channelRef.current = channel;
    })();

    return () => {
      cancelled = true;
      const ch = channelRef.current;
      if (ch) {
        import("@/app/lib/supabase/client").then(({ createClient }) => {
          createClient().removeChannel(ch);
        });
      }
    };
  }, [docType, docId, selfId]);

  const notifySaved = useCallback(() => {
    channelRef.current?.send({
      type: "broadcast",
      event: "doc-updated",
      payload: { senderId: selfId },
    });
  }, [selfId]);

  const applyPendingUpdate = useCallback(() => {
    setPendingUpdate(false);
    optionsRef.current.onRemoteUpdate();
  }, []);

  return { pendingUpdate, applyPendingUpdate, notifySaved };
}

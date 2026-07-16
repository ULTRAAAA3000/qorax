"use client";

import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/realtime-js";

export interface PresentUser {
  userId: string;
  email: string;
}

// usePresence — MVP "спільної роботи" для Qorax Office
// (MODULE_ROADMAP.md, "Qorax Office", останній пункт списку).
// Свідомо НЕ повноцінна real-time синхронізація змін (Google
// Docs-подібне спільне редагування вимагає CRDT/operational
// transforms і Durable Objects — значно більший обсяг, задокументовано
// як наступна ітерація). Це найдешевший цінний перший крок:
// presence — хто зараз дивиться той самий документ.
//
// Технічне рішення: Supabase Realtime Presence-канал, НЕ
// `postgres_changes` — принципова відмінність: Presence працює
// "з коробки" на анонімному ключі без потреби вмикати Replication
// для конкретної таблиці в Supabase Dashboard (те, що знадобилося б
// для відстеження реальних змін рядка). Тому ця фіча не додає
// жодного ручного кроку для Артема, на відміну від решти платформи,
// де нові таблиці й крони вимагають дій у Dashboard.
export function usePresence(docType: string, docId: string): PresentUser[] {
  const [users, setUsers] = useState<PresentUser[]>([]);

  useEffect(() => {
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    (async () => {
      const { createClient } = await import("@/app/lib/supabase/client");
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      channel = supabase.channel(`presence:${docType}:${docId}`, {
        config: { presence: { key: user.id } },
      });

      channel
        .on("presence", { event: "sync" }, () => {
          if (!channel) return;
          const state = channel.presenceState();
          const list: PresentUser[] = Object.entries(state)
            .filter(([key]) => key !== user.id) // не показуємо себе — присутність інших, не власна
            .map(([key, presences]: [string, unknown]) => {
              const p = (presences as Array<{ email?: string }>)[0];
              return { userId: key, email: p?.email ?? "?" };
            });
          setUsers(list);
        })
        .subscribe(async (status: string) => {
          if (status === "SUBSCRIBED" && channel && !cancelled) {
            await channel.track({ email: user.email, joined_at: new Date().toISOString() });
          }
        });
    })();

    return () => {
      cancelled = true;
      const ch = channel;
      if (ch) {
        import("@/app/lib/supabase/client").then(({ createClient }) => {
          createClient().removeChannel(ch);
        });
      }
    };
  }, [docType, docId]);

  return users;
}

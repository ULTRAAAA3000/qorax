"use client";

import { useState } from "react";
import { MessageSquare, FolderOpen, Brain, ListChecks, Bot, Zap, Lock } from "lucide-react";
import { WorkspaceTab } from "./WorkspaceTab";
import { MemoryTab } from "./MemoryTab";
import { ChatTab } from "./ChatTab";
import { AgentsTab } from "./AgentsTab";

type TabId = "chat" | "workspace" | "agents" | "memory" | "tasks" | "automations";

interface SiteOption {
  id: string;
  url: string;
  display_name: string;
}

// Табова навігація хаба (MODULE_ROADMAP.md "Третя хвиля": Chat +
// Agents + Workspace + Memory + Tasks + Automations). Chat/Workspace/
// Memory/Agents реально реалізовані (EXECUTION_PLAN.md, послідовні
// сесії) — Tasks/Automations поки заблоковані заглушки "Скоро", той
// самий патерн, що вже використано в PlatformSidebar для coming_soon-
// модулів.
const TABS: Array<{ id: TabId; label: string; icon: typeof MessageSquare; ready: boolean }> = [
  { id: "chat", label: "Chat", icon: MessageSquare, ready: true },
  { id: "workspace", label: "Workspace", icon: FolderOpen, ready: true },
  { id: "agents", label: "Agents", icon: Bot, ready: true },
  { id: "memory", label: "Memory", icon: Brain, ready: true },
  { id: "tasks", label: "Tasks", icon: ListChecks, ready: false },
  { id: "automations", label: "Automations", icon: Zap, ready: false },
];

export function QoraxAiHub({ sites }: { sites: SiteOption[] }) {
  const [activeTab, setActiveTab] = useState<TabId>("chat");

  return (
    <div>
      {/* Tab bar */}
      <div
        className="flex items-center gap-1 p-1 rounded-xl mb-6 overflow-x-auto"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => tab.ready && setActiveTab(tab.id)}
              disabled={!tab.ready}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm whitespace-nowrap transition-colors shrink-0"
              style={{
                background: isActive ? "rgba(214,255,63,0.1)" : "transparent",
                color: isActive ? "var(--lime)" : tab.ready ? "var(--text-secondary)" : "var(--text-tertiary)",
                opacity: tab.ready ? 1 : 0.5,
                cursor: tab.ready ? "pointer" : "default",
              }}
            >
              <Icon size={14} />
              {tab.label}
              {!tab.ready && <Lock size={10} className="ml-0.5" />}
            </button>
          );
        })}
      </div>

      {/* Active tab content */}
      {activeTab === "chat" && <ChatTab />}
      {activeTab === "workspace" && <WorkspaceTab />}
      {activeTab === "memory" && <MemoryTab />}
      {activeTab === "agents" && <AgentsTab sites={sites} />}

      {activeTab !== "chat" && activeTab !== "workspace" && activeTab !== "memory" && activeTab !== "agents" && (
        <div
          className="rounded-xl p-8 text-center"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <p className="text-sm text-[var(--text-secondary)]">
            Ця вкладка ще в розробці — з&apos;явиться найближчим часом.
          </p>
        </div>
      )}
    </div>
  );
}

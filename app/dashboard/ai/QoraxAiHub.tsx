"use client";

import { useState } from "react";
import { MessageSquare, FolderOpen, Brain, ListChecks, Bot, Zap } from "lucide-react";
import { WorkspaceTab } from "./WorkspaceTab";
import { MemoryTab } from "./MemoryTab";
import { ChatTab } from "./ChatTab";
import { AgentsTab } from "./AgentsTab";
import { TasksTab } from "./TasksTab";
import { AutomationsTab } from "./AutomationsTab";

type TabId = "chat" | "workspace" | "agents" | "memory" | "tasks" | "automations";

interface SiteOption {
  id: string;
  url: string;
  display_name: string;
}

// Табова навігація хаба (MODULE_ROADMAP.md "Третя хвиля": Chat +
// Agents + Workspace + Memory + Tasks + Automations). Усі шість
// вкладок реалізовано (EXECUTION_PLAN.md, послідовні сесії) —
// Automations, остання, підключена до agent_subscriptions
// (0049_qorax_ai_hub.sql — та сама таблиця, задум roadmap "Automations
// = agent_subscriptions" виконано без нової схеми).
const TABS: Array<{ id: TabId; label: string; icon: typeof MessageSquare }> = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "workspace", label: "Workspace", icon: FolderOpen },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "tasks", label: "Tasks", icon: ListChecks },
  { id: "automations", label: "Automations", icon: Zap },
];

export function QoraxAiHub({ sites, organizationId }: { sites: SiteOption[]; organizationId: string }) {
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
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm whitespace-nowrap transition-colors shrink-0"
              style={{
                background: isActive ? "rgba(214,255,63,0.1)" : "transparent",
                color: isActive ? "var(--lime)" : "var(--text-secondary)",
              }}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Active tab content */}
      {activeTab === "chat" && <ChatTab />}
      {activeTab === "workspace" && <WorkspaceTab />}
      {activeTab === "memory" && <MemoryTab />}
      {activeTab === "agents" && <AgentsTab sites={sites} />}
      {activeTab === "tasks" && <TasksTab />}
      {activeTab === "automations" && <AutomationsTab sites={sites} organizationId={organizationId} />}
    </div>
  );
}

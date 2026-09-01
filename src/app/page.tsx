"use client";

import { useState, useRef, useEffect } from "react";
import { AGENTS, Agent } from "@/lib/agents";
import type { MissionState, AgentStep, AgentStatus } from "@/lib/mission/state";
import { V1_AGENTS } from "@/lib/mission/agents";

const STATUS_STYLE: Record<AgentStatus, string> = {
  queued: "text-zinc-500 bg-zinc-800",
  running: "text-violet-300 bg-violet-900/40",
  completed: "text-emerald-300 bg-emerald-900/30",
  failed: "text-red-300 bg-red-900/30",
  retrying: "text-amber-300 bg-amber-900/30",
  waiting_approval: "text-amber-300 bg-amber-900/30",
  skipped: "text-zinc-500 bg-zinc-800",
  cancelled: "text-zinc-500 bg-zinc-800",
};

const DEMO_MISSION =
  "Research a problem faced by small businesses and design a simple AI-powered solution.";

export default function Home() {
  const [goal, setGoal] = useState("");
  const [running, setRunning] = useState(false);
  const [missionState, setMissionState] = useState<MissionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "crew" | "mission" | "artifacts" | "architecture"
  >("crew");
  const [routerOnline, setRouterOnline] = useState<boolean | null>(null);
  const [routerDetail, setRouterDetail] = useState<string>("");
  const resultsRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/router", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        const online = Boolean(data?.backend?.routerOnline);
        setRouterOnline(data?.backend?.routerConfigured ? online : false);
        setRouterDetail(
          data?.backend?.routerConfigured
            ? online
              ? `AI Router ONLINE${data?.backend?.latencyMs != null ? ` · ${data.backend.latencyMs}ms` : ""}`
              : `AI Router OFFLINE${data?.backend?.detail ? ` · ${data.backend.detail}` : ""}`
            : "AI Router not configured"
        );
      } catch {
        if (!cancelled) {
          setRouterOnline(false);
          setRouterDetail("AI Router OFFLINE · unreachable");
        }
      }
    };
    poll();
    const id = setInterval(poll, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const launchMission = async (text?: string, demo = false) => {
    const missionText = (text ?? goal).trim();
    if (!missionText || running) return;
    setRunning(true);
    setError(null);
    setMissionState(null);
    setActiveTab("mission");
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("/api/mission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mission: missionText, stream: true, demo }),
        signal: ac.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error || `Request failed (${res.status})`);
        setRunning(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setError("No response stream");
        setRunning(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const lines = part.split("\n");
          let event = "message";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (!data) continue;
          try {
            const parsed = JSON.parse(data);
            if (event === "step" || event === "done") {
              setMissionState(parsed as MissionState);
            } else if (event === "error") {
              setError((parsed as { error?: string }).error || "Stream error");
            }
          } catch {
            /* ignore */
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Network error");
      }
    } finally {
      setRunning(false);
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    }
  };

  const approve = async () => {
    if (!missionState) return;
    const res = await fetch(`/api/mission/${missionState.id}/approve`, { method: "POST" });
    const data = await res.json();
    if (data.state) setMissionState(data.state);
    else if (data.error) setError(data.error);
  };

  const reject = async () => {
    if (!missionState) return;
    const res = await fetch(`/api/mission/${missionState.id}/reject`, { method: "POST" });
    const data = await res.json();
    if (data.state) setMissionState(data.state);
    else if (data.error) setError(data.error);
  };

  const exampleGoals = [
    DEMO_MISSION,
    "Build a landing page for an AI productivity product",
    "Plan an MVP for a Notion template marketplace",
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-lg shadow-lg shadow-violet-500/20">
              ⚡
            </div>
            <div className="min-w-0">
              <h1 className="font-semibold text-lg tracking-tight truncate">Nexus Crew</h1>
              <p className="text-xs text-zinc-500">AI Agent OS · V2</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div
              title={routerDetail || "Checking AI Router…"}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium bg-zinc-900/80"
              style={{
                borderColor:
                  routerOnline === true
                    ? "rgba(52,211,153,0.4)"
                    : routerOnline === false
                      ? "rgba(248,113,113,0.4)"
                      : "rgba(113,113,122,0.4)",
                color:
                  routerOnline === true
                    ? "rgb(110,231,183)"
                    : routerOnline === false
                      ? "rgb(252,165,165)"
                      : "rgb(161,161,170)",
              }}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  routerOnline === true
                    ? "bg-emerald-400 pulse-glow"
                    : routerOnline === false
                      ? "bg-red-400"
                      : "bg-zinc-500"
                }`}
              />
              {routerOnline === true
                ? "AI Router: ONLINE"
                : routerOnline === false
                  ? "AI Router: OFFLINE"
                  : "AI Router: …"}
            </div>
          <nav className="flex gap-1 bg-zinc-900 rounded-lg p-1 border border-zinc-800 shrink-0 overflow-x-auto max-w-[45vw]">
            {(["crew", "mission", "artifacts", "architecture"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-2 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium capitalize transition whitespace-nowrap ${
                  activeTab === tab ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <section className="mb-10">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              Multi-agent operating system
            </h2>
            <p className="mt-3 text-zinc-400 max-w-2xl mx-auto text-sm sm:text-base">
              Live streaming · server-side approvals · artifacts · retries
            </p>
          </div>

          <div className="max-w-3xl mx-auto">
            <div className="relative">
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Describe the mission…"
                rows={3}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl px-4 sm:px-5 py-4 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none text-sm sm:text-base"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) launchMission();
                }}
              />
              <div className="absolute bottom-3 right-3 flex gap-2">
                <button
                  onClick={() => launchMission()}
                  disabled={!goal.trim() || running}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:opacity-40 font-medium text-sm shadow-lg shadow-violet-600/20 transition flex items-center gap-2"
                >
                  {running ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Live…
                    </>
                  ) : (
                    <>Launch 🚀</>
                  )}
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 justify-center">
              {exampleGoals.map((ex) => (
                <button
                  key={ex}
                  onClick={() => {
                    setGoal(ex);
                    if (ex === DEMO_MISSION) launchMission(ex, true);
                  }}
                  className="text-xs px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition max-w-[90vw] truncate"
                >
                  {ex.slice(0, 56)}
                  {ex.length > 56 ? "…" : ""}
                </button>
              ))}
            </div>
          </div>
        </section>

        {activeTab === "crew" && (
          <section>
            <h3 className="text-lg font-semibold mb-4 text-zinc-200">Pipeline agents</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {V1_AGENTS.map((a) => (
                <div key={a.id} className="agent-card rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
                  <div className="flex items-start gap-3 mb-2">
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${a.color} flex items-center justify-center text-xl shadow-lg`}>
                      {a.emoji}
                    </div>
                    <div>
                      <h4 className="font-semibold">{a.name}</h4>
                      <p className="text-xs text-zinc-500 capitalize">{a.id}</p>
                    </div>
                  </div>
                  <p className="text-sm text-zinc-400 line-clamp-3">{a.systemPrompt.slice(0, 110)}…</p>
                </div>
              ))}
            </div>
            <h3 className="text-lg font-semibold mb-4 text-zinc-200">Legacy display crew</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {AGENTS.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          </section>
        )}

        {activeTab === "mission" && (
          <section ref={resultsRef}>
            <h3 className="text-lg font-semibold mb-4 text-zinc-200 flex items-center gap-2 flex-wrap">
              Mission Log
              {running && <span className="text-xs font-normal text-violet-400 pulse-glow">• live</span>}
              {missionState?.status === "awaiting_approval" && (
                <span className="text-xs font-normal text-amber-400">• approval required</span>
              )}
            </h3>

            {error && (
              <div className="mb-4 rounded-xl border border-red-800/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}

            {!missionState && !running && !error && (
              <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 p-12 text-center text-zinc-500">
                Launch a mission. Requires LLM API key. Streaming updates appear live.
              </div>
            )}

            {running && !missionState && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center text-zinc-400">
                <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-400 rounded-full animate-spin mx-auto mb-3" />
                Connecting to pipeline…
              </div>
            )}

            {missionState && (
              <div className="space-y-4">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm flex flex-wrap gap-3 items-center">
                  <span className="text-zinc-500">Status:</span>
                  <span className="font-medium capitalize">{missionState.status.replace(/_/g, " ")}</span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-zinc-500 text-xs font-mono">{missionState.id}</span>
                </div>

                {missionState.status === "awaiting_approval" && (
                  <div className="rounded-xl border border-amber-700/50 bg-amber-950/30 px-4 py-4">
                    <div className="font-medium text-amber-200 mb-2">Approval Required (server-side)</div>
                    <p className="text-sm text-amber-100/80 mb-3">
                      {missionState.approvals.find((a) => a.status === "pending")?.reason ||
                        "Reviewer flagged this mission."}
                    </p>
                    <div className="flex gap-2">
                      <button className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-medium" onClick={approve}>
                        Approve
                      </button>
                      <button className="px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-sm font-medium" onClick={reject}>
                        Reject
                      </button>
                    </div>
                  </div>
                )}

                {missionState.steps.map((step) => (
                  <StepCard key={step.id} step={step} />
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === "artifacts" && (
          <section>
            <h3 className="text-lg font-semibold mb-4">Artifacts</h3>
            {!missionState?.artifacts?.length ? (
              <div className="rounded-2xl border border-dashed border-zinc-800 p-10 text-center text-zinc-500">
                Artifacts appear after agents complete.
              </div>
            ) : (
              <div className="space-y-3">
                {missionState.artifacts.map((a) => (
                  <div key={a.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                    <div className="flex flex-wrap gap-2 items-center mb-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">{a.type}</span>
                      <span className="font-medium text-sm">{a.title}</span>
                      <span className="text-xs text-zinc-500 ml-auto">{a.creatorAgent}</span>
                    </div>
                    <pre className="text-xs text-zinc-400 whitespace-pre-wrap max-h-48 overflow-auto">
                      {a.content.slice(0, 2000)}
                      {a.content.length > 2000 ? "…" : ""}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === "architecture" && (
          <section className="space-y-6">
            <h3 className="text-lg font-semibold">Architecture</h3>
            <pre className="text-[10px] sm:text-xs text-zinc-300 font-mono bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 overflow-x-auto whitespace-pre">{`USER → POST /api/mission (SSE stream)
  → Orchestrator → Planner → Researcher → Analyst
  → Architect → Builder → Designer → Coder
  → Tester → Security → Reviewer → Documenter
  → [server approval gate]
  → Artifacts + persisted MissionState

Storage: file (local) | memory (Vercel)
LLM: openai | xai | openrouter | custom
Tools: web_search, url_read, file_*, code_gen (gated)
`}</pre>
          </section>
        )}
      </main>

      <footer className="border-t border-zinc-900 mt-16 py-8 text-center text-sm text-zinc-600 px-4">
        Nexus Crew V2 · SSE · server approvals · modular providers
      </footer>
    </div>
  );
}

function StepCard({ step }: { step: AgentStep }) {
  const def = V1_AGENTS.find((a) => a.id === step.id);
  return (
    <div className="fade-in-up rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
      <div className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-zinc-800/80 bg-zinc-900/80">
        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${def?.color || "from-zinc-600 to-zinc-700"} flex items-center justify-center text-sm`}>
          {def?.emoji || "•"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm">{step.name}</div>
          <div className="text-xs text-zinc-500">
            {step.attempt ? `attempt ${step.attempt}/${step.maxAttempts || 1}` : step.id}
          </div>
        </div>
        <span className={`text-[10px] sm:text-xs px-2 py-0.5 rounded-full capitalize ${STATUS_STYLE[step.status]}`}>
          {step.status.replace(/_/g, " ")}
        </span>
      </div>
      <div className="px-4 sm:px-5 py-4">
        {step.error && <p className="text-sm text-red-300 mb-2">{step.error}</p>}
        {step.output ? (
          <Markdownish content={step.output} />
        ) : (
          !step.error && step.status !== "queued" && <p className="text-sm text-zinc-500">Working…</p>
        )}
      </div>
    </div>
  );
}

function AgentCard({ agent }: { agent: Agent }) {
  return (
    <div className="agent-card rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${agent.color} flex items-center justify-center text-xl shadow-lg`}>
          {agent.emoji}
        </div>
        <div>
          <h4 className="font-semibold">{agent.name}</h4>
          <p className="text-xs text-zinc-500">{agent.title}</p>
        </div>
      </div>
      <p className="text-sm text-zinc-400 leading-relaxed">{agent.description}</p>
    </div>
  );
}

function Markdownish({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div className="space-y-1.5 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">
      {lines.map((line, i) => {
        if (line.startsWith("## ")) {
          return (
            <h4 key={i} className="font-semibold text-zinc-100 mt-2">
              {line.replace(/^##\s+/, "")}
            </h4>
          );
        }
        if (line.startsWith("# ")) {
          return (
            <h3 key={i} className="font-semibold text-zinc-50 mt-2">
              {line.replace(/^#\s+/, "")}
            </h3>
          );
        }
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <p key={i}>
            {parts.map((part, j) =>
              part.startsWith("**") && part.endsWith("**") ? (
                <strong key={j} className="text-zinc-100 font-semibold">
                  {part.slice(2, -2)}
                </strong>
              ) : (
                <span key={j}>{part}</span>
              )
            )}
          </p>
        );
      })}
    </div>
  );
}

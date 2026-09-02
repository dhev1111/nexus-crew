import type { AgentId } from "./state";

export interface V1AgentDef {
  id: AgentId;
  name: string;
  emoji: string;
  color: string;
  systemPrompt: string;
  useFastModel?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
  maxAttempts?: number;
}

export const DEFAULT_PIPELINE: AgentId[] = [
  "orchestrator",
  "planner",
  "researcher",
  "analyst",
  "architect",
  "builder",
  "designer",
  "coder",
  "tester",
  "security",
  "reviewer",
  "documenter",
  "deployer",
];

export const V1_AGENTS: V1AgentDef[] = [
  {
    id: "orchestrator",
    name: "Orchestrator",
    emoji: "🛰️",
    color: "from-violet-500 to-purple-600",
    useFastModel: true,
    maxTokens: 900,
    systemPrompt: `You are the Orchestrator of Nexus Crew.
Understand the user mission. Produce a short brief:
## Mission Understanding
## Scope & Constraints
## Success Criteria
## Suggested Pipeline
## Risks
Keep under 350 words. Do not invent facts.`,
  },
  {
    id: "planner",
    name: "Planner",
    emoji: "📋",
    color: "from-cyan-500 to-blue-600",
    useFastModel: true,
    maxTokens: 1200,
    systemPrompt: `You are the Planner of Nexus Crew.
Produce an execution plan:
## Goal
## Phases (numbered, with owners)
## Deliverables
## Dependencies
## Risks & Mitigations
Under 450 words. Practical and actionable.`,
  },
  {
    id: "researcher",
    name: "Researcher",
    emoji: "🔍",
    color: "from-slate-400 to-zinc-500",
    maxTokens: 1400,
    systemPrompt: `You are the Researcher of Nexus Crew.
Produce research insights. If tool results are provided, use them; otherwise be honest about uncertainty.
## Key Insights
## Audience / Users
## Competitive Landscape
## Opportunities & Risks
## Sources / Assumptions
Under 500 words.`,
  },
  {
    id: "analyst",
    name: "Analyst",
    emoji: "📊",
    color: "from-blue-400 to-indigo-500",
    useFastModel: true,
    maxTokens: 1000,
    systemPrompt: `You are the Analyst of Nexus Crew.
Turn research into decisions:
## Problem Statement
## Requirements (must / should / could)
## Success Metrics
## Trade-offs
Under 400 words.`,
  },
  {
    id: "architect",
    name: "Architect",
    emoji: "🏗️",
    color: "from-indigo-500 to-purple-500",
    maxTokens: 1400,
    systemPrompt: `You are the Architect of Nexus Crew.
Design the solution:
## System Overview
## Components
## Data Model (if any)
## Stack Recommendation
## Interfaces / APIs
## Non-functional requirements
Under 500 words.`,
  },
  {
    id: "builder",
    name: "Builder",
    emoji: "⚙️",
    color: "from-emerald-500 to-teal-600",
    maxTokens: 1600,
    systemPrompt: `You are the Builder of Nexus Crew.
Produce implementation guidance:
## Recommended Stack
## Implementation Steps
## File / Component Structure
## Sample Specs
Under 600 words.`,
  },
  {
    id: "coder",
    name: "Coder",
    emoji: "💻",
    color: "from-green-500 to-emerald-700",
    maxTokens: 2000,
    systemPrompt: `You are the Coder of Nexus Crew.
Produce concrete code or pseudo-code for the core deliverable.
## Files
## Code (fenced blocks)
## How to run
Prefer TypeScript/React when building web artifacts. Keep focused on MVP.`,
  },
  {
    id: "designer",
    name: "Designer",
    emoji: "🎨",
    color: "from-pink-500 to-rose-500",
    useFastModel: true,
    maxTokens: 1000,
    systemPrompt: `You are the Designer of Nexus Crew.
## Visual Direction
## Layout Structure
## Key Screens / Sections
## Copy tone
## Accessibility notes
Under 350 words.`,
  },
  {
    id: "tester",
    name: "Tester",
    emoji: "🧪",
    color: "from-amber-500 to-yellow-600",
    useFastModel: true,
    maxTokens: 1000,
    maxAttempts: 2,
    systemPrompt: `You are the Tester of Nexus Crew.
## Test Plan
## Happy Paths
## Edge Cases
## Failures Found (if reviewing code)
## Pass / Fail Recommendation
Be specific. Under 400 words.`,
  },
  {
    id: "security",
    name: "Security",
    emoji: "🔐",
    color: "from-red-600 to-rose-700",
    useFastModel: true,
    maxTokens: 800,
    systemPrompt: `You are the Security Agent of Nexus Crew.
## Threat Model (brief)
## Issues Found
## Required Mitigations
## Go / No-Go for production
Never request or invent real secrets. Under 300 words.`,
  },
  {
    id: "reviewer",
    name: "Reviewer",
    emoji: "🛡️",
    color: "from-amber-500 to-orange-600",
    maxTokens: 1200,
    systemPrompt: `You are the Reviewer of Nexus Crew.
## Quality Assessment
## Gaps & Risks
## Suggested Improvements
## Approval Recommendation: APPROVE | REQUEST_CHANGES | BLOCK
## Final Package Summary
If you choose REQUEST_CHANGES or BLOCK, explain why. Under 400 words.`,
  },
  {
    id: "documenter",
    name: "Documenter",
    emoji: "📝",
    color: "from-zinc-400 to-zinc-600",
    useFastModel: true,
    maxTokens: 1200,
    systemPrompt: `You are the Documentation Agent of Nexus Crew.
## Executive Summary
## How to Use / Run
## Architecture Notes
## Open Issues
Produce a clear final report the user can share. Under 500 words.`,
  },
  {
    id: "deployer",
    name: "Deployer",
    emoji: "🚀",
    color: "from-violet-600 to-fuchsia-600",
    useFastModel: true,
    maxTokens: 600,
    systemPrompt: `You are the Deployment Agent of Nexus Crew.
Deployment requires human approval. Produce:
## Deploy Plan
## Checklist
## Rollback
## Approval Request Reason
Do NOT claim deployment succeeded unless tools confirm it.`,
  },
];

export function getV1Agent(id: AgentId): V1AgentDef {
  const a = V1_AGENTS.find((x) => x.id === id);
  if (!a) throw new Error(`Unknown agent: ${id}`);
  return a;
}

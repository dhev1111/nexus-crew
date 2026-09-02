import { AgentRole, getAgent } from "./agents";

export interface AgentOutput {
  agentId: AgentRole;
  status: "thinking" | "done";
  content: string;
  timestamp: number;
}

function extractKeywords(goal: string): string[] {
  const lower = goal.toLowerCase();
  const words = lower
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
  return [...new Set(words)].slice(0, 12);
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function simulateCrew(goal: string): AgentOutput[] {
  const keywords = extractKeywords(goal);
  const topic = keywords[0] || "product";
  const outputs: AgentOutput[] = [];

  // Commander
  outputs.push({
    agentId: "commander",
    status: "done",
    timestamp: Date.now(),
    content: `**Mission Brief received.**

Goal: "${goal}"

I have decomposed this into the following parallel workstreams:

1. **Research & Validation** → Scout
2. **Product Definition** → Forge
3. **Technical Implementation** → CodeX + Sentinel
4. **Go-to-Market** → Pulse + Closer
5. **Visual Storytelling** → Cinema

Priority order: Research first, then Product Spec → Build → Test → Market + Video + Sales assets in parallel.

All agents: synchronise outputs to Mission Control when complete. Let's ship.`,
  });

  // Researcher
  outputs.push({
    agentId: "researcher",
    status: "done",
    timestamp: Date.now() + 1,
    content: `**Research Snapshot for "${goal}"**

• Target audience: Early adopters and operators who care about speed + quality in ${topic}-related workflows.
• Competitive landscape: Several tools exist, but most are either too complex or lack the multi-agent orchestration angle.
• Opportunity: Position as an AI-native team that reduces headcount and time-to-launch by 5–10×.
• Key insight: Users want end-to-end ownership (idea → code → video → sales) rather than single-point tools.
• Recommended validation: 5–7 user interviews + landing-page waitlist in week 1.

Ready for Product Architect to define the MVP.`,
  });

  // Product
  outputs.push({
    agentId: "product",
    status: "done",
    timestamp: Date.now() + 2,
    content: `**Product Spec – MVP**

**Name working title:** Nexus ${capitalise(topic)} Studio

**Core value prop:**  
One command → coordinated AI crew delivers product, code, tests, marketing assets, sales scripts and video production plan.

**MVP Features (v0.1):**
1. Mission input + agent routing
2. Structured multi-agent outputs (this demo surface)
3. Exportable deliverables (markdown / JSON)
4. Role visibility & progress tracking

**Later:**
- Real LLM backends per agent
- Tool use (GitHub, Vercel, Stripe, etc.)
- Persistent memory & project history

**Success metric:** Time from idea → first shippable package < 30 min for a simple digital product.

Handing off to CodeX for implementation notes and to Cinema for launch video concept.`,
  });

  // Developer
  outputs.push({
    agentId: "developer",
    status: "done",
    timestamp: Date.now() + 3,
    content: `**Technical Implementation Plan**

Stack recommendation:
- Next.js 15 / App Router + TypeScript
- Tailwind + modern UI primitives
- Deploy target: Vercel
- Optional: AI SDK for real agent calls later

Architecture sketch:
\`\`\`
/app
  /page.tsx          → Mission Control UI
  /api/crew          → (future) multi-agent orchestration
/lib
  agents.ts          → Agent definitions
  simulate.ts        → Current demo brain
\`\`\`

Immediate deliverables:
- Clean, dark, high-signal dashboard
- Agent cards with status
- Goal → coordinated outputs in one click

Next: Wire real models + tools (GitHub, Vercel, email) once API keys are available.

Code is production-ready for the demo layer.`,
  });

  // Tester
  outputs.push({
    agentId: "tester",
    status: "done",
    timestamp: Date.now() + 4,
    content: `**QA Checklist & Risks**

Happy-path tests:
- [ ] Goal input accepts multi-line text
- [ ] All 8 agents return structured output
- [ ] UI remains responsive on mobile
- [ ] Dark mode contrast meets accessibility baseline

Edge cases:
- Empty goal → graceful error
- Extremely long goal → truncation + warning
- Concurrent missions → future queue

Risks to watch:
1. Hallucinated claims if real LLMs are added without grounding
2. Over-promising on automation depth in marketing copy

Recommendation: Ship current demo as v0.1 showcase, then add evaluation harness before production agents.`,
  });

  // Marketer
  outputs.push({
    agentId: "marketer",
    status: "done",
    timestamp: Date.now() + 5,
    content: `**Growth & Content Plan**

Positioning statement:  
"Your entire digital product team — in one AI crew."

Launch content calendar (first 14 days):
Day 1–2: Teaser threads + waitlist
Day 3: Launch video + Product Hunt / social
Day 4–7: Case-study style posts (how the crew built X)
Day 8–14: Deep-dive agent spotlight series

SEO seeds:
- "AI agent team for product development"
- "multi-agent video + code + marketing"

Channels: X/Twitter, LinkedIn, Product Hunt, Indie Hackers, relevant Discord/Slack communities.

CTA: "Give the crew a mission → get a full package back."`,
  });

  // Sales
  outputs.push({
    agentId: "sales",
    status: "done",
    timestamp: Date.now() + 6,
    content: `**Sales Assets**

Cold outreach (short):
"Hey {{Name}} — most founders still hire 4–6 people to go from idea to launch video + site + sales copy.  
Nexus Crew does it in one coordinated run.  
Want me to run a free sample mission on your next idea?"

Pitch deck outline:
1. Problem (slow, expensive teams)
2. Solution (orchestrated specialist agents)
3. Demo (live mission)
4. Pricing (freemium → pro → team)
5. Ask

Objection handling:
- "Will it replace my team?" → "It multiplies them. Humans set direction; agents execute the volume work."
- "Is the quality good enough?" → "We surface every agent’s work so you can edit or approve."

Funnel: Waitlist → Sample mission → Paid plan.`,
  });

  // Video
  outputs.push({
    agentId: "video",
    status: "done",
    timestamp: Date.now() + 7,
    content: `**Launch Video Concept**

Title: "Meet the Crew that builds while you sleep"

Runtime: 60–90 seconds

Structure:
0–10s  Hook – "What if your next product had a full team on day one?"
10–25s Problem – scattered tools, slow hiring, context switching
25–50s Solution – quick cuts of each agent (Aether → Forge → CodeX → Cinema…) working in parallel
50–70s Result – finished product + marketing kit + video plan appear
70–90s CTA – "Drop a mission. Watch the crew work."

Visual style: Dark UI, neon accent lines, terminal + cinematic hybrid.
Thumbnail: Agent silhouettes + bold text "AI CREW // ON MISSION"

Script draft available on request. Ready for production when you green-light.`,
  });

  return outputs;
}

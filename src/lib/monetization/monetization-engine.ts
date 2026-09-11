/**
 * Monetization engine — opportunity discovery, lead tracking, funnel management.
 */

import type {
  Opportunity, Offer, Lead, Proposal, FunnelStage,
  FunnelMetrics, RiskAssessment, RiskLevel,
} from "./types";
import { emitEvent } from "@/lib/observability";

const opportunities: Opportunity[] = [];
const offers: Offer[] = [];
const leads: Lead[] = [];
const proposals: Proposal[] = [];

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function assessRisk(opportunity: Opportunity): RiskAssessment {
  const factors: string[] = [];
  let level: RiskLevel = "low";

  if (opportunity.competition === "high" || opportunity.competition === "critical") {
    factors.push("High competition in this niche");
    level = "medium";
  }
  if (opportunity.estimatedDemand < 100) {
    factors.push("Low estimated demand");
    level = level === "medium" ? "high" : "medium";
  }
  if (opportunity.estimatedDemand < 10) {
    factors.push("Very low demand — may not be viable");
    level = "high";
  }

  return {
    level,
    factors,
    recommendation: level === "low"
      ? "Good opportunity — proceed with content and offers"
      : level === "medium"
        ? "Moderate risk — validate demand before heavy investment"
        : "High risk — consider alternative niches or validate extensively",
  };
}

export const monetizationEngine = {
  discoverOpportunity(data: { title: string; description: string; niche: string; estimatedDemand: number; competition: RiskLevel }): Opportunity {
    const opp: Opportunity = {
      id: genId("opp"),
      ...data,
      timestamp: Date.now(),
    };
    opportunities.push(opp);

    const risk = assessRisk(opp);
    emitEvent("funnel", "info", "funnel.updated", `Opportunity discovered: ${opp.title}`, {
      meta: { opportunityId: opp.id, risk: risk.level },
    });

    return opp;
  },

  createOffer(data: { title: string; description: string; price: number; currency: string; type: Offer["type"]; opportunityId: string }): Offer {
    const offer: Offer = {
      id: genId("offer"),
      ...data,
      timestamp: Date.now(),
    };
    offers.push(offer);
    emitEvent("funnel", "info", "funnel.updated", `Offer created: ${offer.title}`);
    return offer;
  },

  addLead(data: { source: string; contact?: string; interest: string }): Lead {
    const lead: Lead = {
      id: genId("lead"),
      ...data,
      score: 0,
      stage: "lead",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    leads.push(lead);
    emitEvent("funnel", "info", "funnel.updated", `Lead added from ${lead.source}`);
    return lead;
  },

  qualifyLead(id: string, score: number): Lead | null {
    const lead = leads.find((l) => l.id === id);
    if (!lead) return null;
    lead.score = score;
    lead.stage = score >= 70 ? "qualification" : "lead";
    lead.updatedAt = Date.now();
    return lead;
  },

  createProposal(data: { leadId: string; offerId: string; content: string }): Proposal | null {
    const lead = leads.find((l) => l.id === data.leadId);
    const offer = offers.find((o) => o.id === data.offerId);
    if (!lead || !offer) return null;

    const proposal: Proposal = {
      id: genId("prop"),
      ...data,
      status: "draft",
      createdAt: Date.now(),
    };
    proposals.push(proposal);
    lead.stage = "proposal";
    lead.updatedAt = Date.now();

    emitEvent("funnel", "info", "funnel.updated", `Proposal created for lead ${lead.id}`);
    return proposal;
  },

  getMetrics(): FunnelMetrics {
    const qualifiedLeads = leads.filter((l) => l.stage === "qualification" || l.stage === "proposal" || l.stage === "customer");
    const customers = leads.filter((l) => l.stage === "customer");

    return {
      opportunities: opportunities.length,
      leads: leads.length,
      qualifiedLeads: qualifiedLeads.length,
      proposals: proposals.length,
      customers: customers.length,
      revenue: 0,
      conversionRate: leads.length > 0 ? (customers.length / leads.length) * 100 : 0,
    };
  },

  listOpportunities(): Opportunity[] {
    return opportunities.slice();
  },

  listLeads(): Lead[] {
    return leads.slice();
  },

  listOffers(): Offer[] {
    return offers.slice();
  },

  detectScamRisks(text: string): RiskAssessment {
    const scamPatterns = [
      /guaranteed?\s*(income|money|earnings)/i,
      /no\s*risk/i,
      /easy\s*money/i,
      /get\s*rich\s*quick/i,
      /100%\s*(guaranteed|profit)/i,
      /double\s*your\s*(money|income)/i,
    ];

    const factors: string[] = [];
    for (const pattern of scamPatterns) {
      if (pattern.test(text)) {
        factors.push(`Matches scam pattern: ${pattern.source}`);
      }
    }

    const level: RiskLevel = factors.length === 0 ? "low" : factors.length === 1 ? "medium" : "high";

    return {
      level,
      factors,
      recommendation: factors.length === 0
        ? "No scam indicators detected"
        : "Review content for misleading claims before publishing",
    };
  },

  clear() {
    opportunities.length = 0;
    offers.length = 0;
    leads.length = 0;
    proposals.length = 0;
  },
};

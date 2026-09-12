/**
 * Monetization / Lead Funnel types.
 */

export type FunnelStage =
  | "opportunity"
  | "audience"
  | "offer"
  | "content"
  | "lead"
  | "qualification"
  | "proposal"
  | "customer"
  | "revenue"
  | "feedback";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface Opportunity {
  id: string;
  title: string;
  description: string;
  niche: string;
  estimatedDemand: number;
  competition: RiskLevel;
  timestamp: number;
}

export interface Offer {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  type: "digital_product" | "service" | "subscription" | "affiliate" | "other";
  opportunityId: string;
  timestamp: number;
}

export interface Lead {
  id: string;
  source: string;
  contact?: string;
  interest: string;
  score: number;
  stage: FunnelStage;
  createdAt: number;
  updatedAt: number;
}

export interface Proposal {
  id: string;
  leadId: string;
  offerId: string;
  content: string;
  status: "draft" | "sent" | "accepted" | "rejected";
  createdAt: number;
}

export interface FunnelMetrics {
  opportunities: number;
  leads: number;
  qualifiedLeads: number;
  proposals: number;
  customers: number;
  revenue: number;
  conversionRate: number;
}

export interface RiskAssessment {
  level: RiskLevel;
  factors: string[];
  recommendation: string;
}

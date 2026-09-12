/**
 * Analytics types.
 */

export type MetricType =
  | "impressions"
  | "views"
  | "watch_time"
  | "engagement"
  | "clicks"
  | "leads"
  | "conversions"
  | "revenue";

export interface MetricRecord {
  id: string;
  type: MetricType;
  value: number;
  source: string;
  platform?: string;
  contentId?: string;
  campaignId?: string;
  timestamp: number;
  metadata: Record<string, unknown>;
}

export interface ContentPerformance {
  contentId: string;
  platform: string;
  impressions: number;
  views: number;
  engagement: number;
  clicks: number;
  leads: number;
  conversions: number;
  revenue: number;
  score: number;
}

export interface Insight {
  id: string;
  type: "pattern" | "recommendation" | "alert" | "opportunity";
  title: string;
  description: string;
  confidence: number;
  data: Record<string, unknown>;
  timestamp: number;
}
